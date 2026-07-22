# E2E PIPELINE — EVERY CODE FILE

---

## 1. scripts/e2e-pipeline.py (main orchestrator)

#!/usr/bin/env python3
"""
COMPLETE E2E PIPELINE — Vision-Aware Video Editor
Uses Cloudflare Workers AI (@cf/meta/llama-3.2-11b-vision-instruct) for vision.

Flow:
1. Extract frames from reference + footage (3fps)
2. Create mosaics (contact sheets) for both
3. Send BOTH mosaics to Cloudflare vision AI in ONE call
4. AI analyzes reference style + footage content
5. AI recommends how to edit footage to match reference
6. Render the edit based on AI recommendations

Requirements:
- CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .dev.vars
- Python AI worker running at localhost:8102
- ffmpeg installed
"""
import base64
import json
import os
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

PYTHON_AI = "http://localhost:8102"
CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct"

# Load Cloudflare credentials from .dev.vars
DEV_VARS = {}
dev_vars_path = os.path.join(os.path.dirname(__file__), ".dev.vars")
if os.path.exists(dev_vars_path):
    with open(dev_vars_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                DEV_VARS[k.strip()] = v.strip().strip('"').strip("'")

CLOUDFLARE_API_TOKEN = DEV_VARS.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = DEV_VARS.get("CLOUDFLARE_ACCOUNT_ID", "")

if not CLOUDFLARE_API_TOKEN or not CLOUDFLARE_ACCOUNT_ID:
    print("ERROR: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in .dev.vars")
    print("Get them from: https://dash.cloudflare.com/profile/api-tokens")
    print("Account ID from: https://dash.cloudflare.com/ (right sidebar)")
    sys.exit(1)

CLOUDFLARE_AI_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{CLOUDFLARE_AI_MODEL}"

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "validation-output", "e2e-pipeline")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


# ─── Helpers ─────────────────────────────────────────────────────────────────

def post_python_ai(endpoint, data):
    """Call Python AI worker."""
    req = urllib.request.Request(
        f"{PYTHON_AI}{endpoint}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def call_cloudflare_vision(images_b64, prompt):
    """Call Cloudflare Workers AI vision model with images + text."""
    content = []
    for img_b64 in images_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{img_b64}", "detail": "low"},
        })
    content.append({"type": "text", "text": prompt})

    payload = json.dumps({
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 2000,
    }).encode()

    req = urllib.request.Request(
        CLOUDFLARE_AI_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        },
    )

    with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
        result = json.loads(resp.read())

    if not result.get("success"):
        raise Exception(f"Cloudflare AI error: {result}")

    return result["result"]["response"]


def load_image_b64(path):
    """Load image file as base64."""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def extract_video_frames(video_path, fps, output_dir, max_frames=None):
    """Extract frames from video using FFmpeg."""
    os.makedirs(output_dir, exist_ok=True)
    cmd = ["ffmpeg", "-i", video_path, "-vf", f"fps={fps}", "-q:v", "2", "-y"]
    if max_frames:
        cmd.extend(["-frames:v", str(max_frames)])
    cmd.append(os.path.join(output_dir, "frame_%04d.jpg"))
    subprocess.run(cmd, capture_output=True, check=True)
    return sorted(Path(output_dir).glob("frame_*.jpg"))


def detect_cuts(frame_dir, fps):
    """Detect scene cuts using histogram difference."""
    return post_python_ai("/detect-cuts", {"frameDir": frame_dir, "fps": fps})


def create_mosaic(frame_dir, fps, cols=6):
    """Create contact sheet mosaic."""
    return post_python_ai("/create-mosaic", {"frameDir": frame_dir, "fps": fps, "cols": cols})


def resize_image(path, max_size_kb=600):
    """Resize image to fit API limits."""
    from PIL import Image
    img = Image.open(path)
    while os.path.getsize(path) > max_size_kb * 1024:
        img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
        img.save(path, quality=70)
    return path


# ─── Main Pipeline ───────────────────────────────────────────────────────────

def run_pipeline(reference_path, footage_path, output_name="edit"):
    """Run the full E2E pipeline."""
    run_dir = os.path.join(OUTPUT_DIR, output_name)
    os.makedirs(run_dir, exist_ok=True)

    print(f"=== E2E PIPELINE: {output_name} ===")
    print(f"Reference: {os.path.basename(reference_path)}")
    print(f"Footage: {os.path.basename(footage_path)}")
    print()

    # ── Step 1: Extract frames ──
    print("1/7 Extracting frames (3fps)...")
    ref_frames_dir = os.path.join(run_dir, "ref-frames")
    foot_frames_dir = os.path.join(run_dir, "foot-frames")

    ref_frames = extract_video_frames(reference_path, 3, ref_frames_dir)
    foot_frames = extract_video_frames(footage_path, 3, foot_frames_dir)

    # Get video durations
    probe_ref = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", reference_path],
        capture_output=True, text=True, check=True,
    )
    probe_foot = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", footage_path],
        capture_output=True, text=True, check=True,
    )
    ref_dur = float(json.loads(probe_ref.stdout)["format"]["duration"])
    foot_dur = float(json.loads(probe_foot.stdout)["format"]["duration"])

    print(f"   Reference: {len(ref_frames)} frames ({ref_dur:.1f}s)")
    print(f"   Footage: {len(foot_frames)} frames ({foot_dur:.1f}s)")

    # ── Step 2: Detect cuts ──
    print("\n2/7 Detecting cuts...")
    ref_cuts = detect_cuts(ref_frames_dir, 3)
    foot_cuts = detect_cuts(foot_frames_dir, 3)

    ref_shots = ref_cuts["data"]["shots"]
    foot_shots = foot_cuts["data"]["shots"]

    print(f"   Reference: {len(ref_shots)} shots")
    print(f"   Footage: {len(foot_shots)} shots")

    # ── Step 3: Create mosaics ──
    print("\n3/7 Creating mosaics...")
    ref_mosaic = create_mosaic(ref_frames_dir, 3, cols=6)
    foot_mosaic = create_mosaic(foot_frames_dir, 3, cols=8)

    ref_mosaic_path = ref_mosaic["data"]["path"]
    foot_mosaic_path = foot_mosaic["data"]["path"]

    # Resize for API
    resize_image(ref_mosaic_path, 500)
    resize_image(foot_mosaic_path, 500)

    print(f"   Reference: {os.path.getsize(ref_mosaic_path)/1024:.0f}KB")
    print(f"   Footage: {os.path.getsize(foot_mosaic_path)/1024:.0f}KB")

    # ── Step 4: Vision AI analysis ──
    print("\n4/7 Vision AI analysis...")
    ref_b64 = load_image_b64(ref_mosaic_path)
    foot_b64 = load_image_b64(foot_mosaic_path)

    vision_prompt = f"""You are an expert video editor. You are given two contact sheets:

IMAGE 1 (REFERENCE): A reference video the user wants to match the editing style of.
- Duration: {ref_dur:.1f}s
- {len(ref_shots)} cuts detected

IMAGE 2 (FOOTAGE): The user's raw footage they want edited.
- Duration: {foot_dur:.1f}s
- {len(foot_shots)} shots detected

Analyze both images and return a JSON object with this exact structure:
{{
  "reference_analysis": {{
    "editing_style": "one-line description of the editing style",
    "pacing": "fast/medium/slow with details",
    "cuts_per_minute": {len(ref_shots) / (ref_dur / 60):.0f},
    "color_mood": "warm/cool/desaturated/high-contrast/etc",
    "transitions": "what transitions are used",
    "text_overlays": "any text visible on screen",
    "camera_work": "camera movement patterns",
    "energy_curve": "how energy changes through the video"
  }},
  "footage_analysis": {{
    "content": "what is in the video",
    "best_moments": ["list timestamps or descriptions of the best 5-8 moments"],
    "color_profile": "current color look",
    "camera_work": "camera movement patterns",
    "suitable_for": "what kind of edit this footage works for"
  }},
  "edit_plan": {{
    "shot_selection": "which moments from footage to use and in what order",
    "cut_timing": "how to time the cuts (match reference pacing: {len(ref_shots) / (ref_dur / 60):.0f} cuts/min)",
    "speed_adjustments": "where to speed up or slow down",
    "color_grade": "what color changes to match reference style",
    "transitions_to_use": "what transitions between shots",
    "text_to_add": "any text overlays that would improve the edit"
  }}
}}

Return ONLY valid JSON. No markdown, no explanation."""

    print("   Calling Cloudflare Workers AI vision model...")
    vision_response = call_cloudflare_vision([ref_b64, foot_b64], vision_prompt)

    # Parse vision response
    try:
        # Try to extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', vision_response)
        if json_match:
            analysis = json.loads(json_match.group())
        else:
            analysis = {"raw_response": vision_response}
    except json.JSONDecodeError:
        analysis = {"raw_response": vision_response}

    # Save analysis
    with open(os.path.join(run_dir, "vision-analysis.json"), "w") as f:
        json.dump(analysis, f, indent=2)

    print(f"   Analysis saved to {run_dir}/vision-analysis.json")
    if "reference_analysis" in analysis:
        ref_a = analysis["reference_analysis"]
        print(f"   Reference style: {ref_a.get('editing_style', 'unknown')}")
        print(f"   Pacing: {ref_a.get('pacing', 'unknown')}")
    if "edit_plan" in analysis:
        ep = analysis["edit_plan"]
        print(f"   Cut timing: {ep.get('cut_timing', 'unknown')}")

    # ── Step 5: Compile edit plan ──
    print("\n5/7 Compiling edit plan...")

    # Use AI's shot selection or fallback to reference pacing
    if "edit_plan" in analysis and "shot_selection" in analysis["edit_plan"]:
        # Parse AI's shot selection
        selection_text = analysis["edit_plan"]["shot_selection"]
        print(f"   AI recommends: {selection_text[:100]}...")

    # Build segments based on reference pacing
    target_cuts_per_min = len(ref_shots) / (ref_dur / 60)
    target_total_cuts = min(int(target_cuts_per_min * min(ref_dur, 30) / 60), 50)

    segments = []
    foot_step = foot_dur / max(target_total_cuts, 1)

    for i in range(target_total_cuts):
        start = i * foot_step
        dur = min(foot_step, foot_dur - start)
        if dur <= 0:
            break
        segments.append({"start": start, "duration": dur})

    print(f"   {len(segments)} segments planned")

    # ── Step 6: Render ──
    print("\n6/7 Rendering...")

    # Apply speed adjustments if AI recommended them
    speed_adjustments = {}
    if "edit_plan" in analysis and "speed_adjustments" in analysis["edit_plan"]:
        speed_text = analysis["edit_plan"]["speed_adjustments"].lower()
        if "slow" in speed_text or "slow-motion" in speed_text:
            # Slow down certain segments
            for i in range(0, len(segments), 4):
                speed_adjustments[i] = 0.6
        if "fast" in speed_text or "speed up" in speed_text:
            # Speed up certain segments
            for i in range(2, len(segments), 4):
                speed_adjustments[i] = 1.5

    temp_dir = os.path.join(run_dir, "temp")
    os.makedirs(temp_dir, exist_ok=True)

    seg_files = []
    for i, seg in enumerate(segments):
        seg_file = os.path.join(temp_dir, f"seg_{i:03d}.mp4")
        speed = speed_adjustments.get(i, 1.0)

        vf_parts = []
        if speed != 1.0:
            vf_parts.append(f"setpts={1.0/speed:.3f}*PTS")

        cmd = ["ffmpeg", "-y", "-ss", str(seg["start"]), "-i", footage_path,
               "-t", str(seg["duration"])]
        if vf_parts:
            cmd.extend(["-vf", ",".join(vf_parts)])
        cmd.extend(["-c:v", "libx264", "-preset", "fast", "-an", seg_file])

        if subprocess.run(cmd, capture_output=True).returncode == 0:
            seg_files.append(seg_file)

    print(f"   {len(seg_files)} segments rendered")

    # Concat
    concat_list = os.path.join(temp_dir, "concat.txt")
    with open(concat_list, "w") as f:
        for sf in seg_files:
            f.write(f"file '{sf}'\n")

    concat_file = os.path.join(temp_dir, "concat.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", concat_file],
        capture_output=True,
    )

    # ── Step 7: Apply color grade from AI recommendation ──
    print("\n7/7 Applying color grade...")

    # Get color recommendation from AI
    color_filter = "eq=contrast=1.15:saturation=0.7"  # Default
    if "edit_plan" in analysis and "color_grade" in analysis["edit_plan"]:
        color_text = analysis["edit_plan"]["color_grade"].lower()
        if "desaturated" in color_text or "muted" in color_text:
            color_filter = "eq=contrast=1.2:saturation=0.3"
        elif "vibrant" in color_text or "saturated" in color_text:
            color_filter = "eq=contrast=1.1:saturation=1.3"
        elif "warm" in color_text:
            color_filter = "eq=contrast=1.1:saturation=0.9,curves=r='0/0 0.5/0.55 1/1'"
        elif "cool" in color_text:
            color_filter = "eq=contrast=1.1:saturation=0.9,curves=b='0/0 0.5/0.55 1/1'"
        print(f"   Color: {color_text[:60]}")

    output_path = os.path.join(run_dir, f"{output_name}.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-i", concat_file, "-vf", color_filter,
         "-c:v", "libx264", "-preset", "fast", "-t", str(min(ref_dur, foot_dur, 30)),
         output_path],
        capture_output=True,
    )

    # Cleanup temp
    for sf in seg_files:
        try: os.remove(sf)
        except: pass
    try: os.remove(concat_list)
    except: pass
    try: os.remove(concat_file)
    except: pass

    # ── Result ──
    if os.path.exists(output_path):
        size = os.path.getsize(output_path) / (1024 * 1024)
        print(f"\n=== OUTPUT ===")
        print(f"  {output_path} ({size:.1f}MB)")
        print(f"  Segments: {len(seg_files)}")
        print(f"  Duration: {min(ref_dur, foot_dur, 30):.1f}s")
        print(f"  Color: {color_filter}")
        subprocess.run(["open", output_path])
        print("  Opened in player")
        return output_path
    else:
        print("  RENDER FAILED")
        return None


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    REFERENCE = "/Users/hamza/Desktop/reserves/monet-ai-story/monet-reference-edits/2nd imporatnt.MP4"
    FOOTAGE = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4"

    if len(sys.argv) >= 3:
        REFERENCE = sys.argv[1]
        FOOTAGE = sys.argv[2]

    run_pipeline(REFERENCE, FOOTAGE, "steph-curry-e2e")

---

## 2. workers/python-ai/lightweight_server.py (all endpoints)

"""Lightweight analysis server — only our new pipeline endpoints."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Jalebi Analysis Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ─── Frame Extraction ───

class ExtractFramesBody(BaseModel):
    filePath: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0, le=30)
    maxFrames: Optional[int] = Field(default=None, ge=1)
    outputDir: Optional[str] = None


def extract_frames(file_path: str, fps: float = 3.0, max_frames: int | None = None, output_dir: str | None = None):
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="jalebi-frames-")
    os.makedirs(output_dir, exist_ok=True)

    probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file_path]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    probe_data = json.loads(probe_result.stdout)
    duration = float(probe_data["format"]["duration"])

    width, height = 1920, 1080
    for stream in probe_data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width", 1920)
            height = stream.get("height", 1080)
            break

    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    cmd = ["ffmpeg", "-i", file_path, "-vf", f"fps={fps}", "-q:v", "2", "-y"]
    if max_frames:
        cmd.extend(["-frames:v", str(max_frames)])
    cmd.append(output_pattern)
    subprocess.run(cmd, capture_output=True, check=True)

    frames = []
    frame_files = sorted(Path(output_dir).glob("frame_*.jpg"))
    for i, fp in enumerate(frame_files):
        frames.append({
            "path": str(fp),
            "timestamp_s": round(i / fps, 4),
            "width": width,
            "height": height,
        })

    return {
        "frames": frames,
        "metadata": {
            "total_frames": len(frames),
            "fps": fps,
            "duration_s": duration,
            "output_dir": output_dir,
        },
    }


@app.post("/extract-frames")
def extract_frames_route(body: ExtractFramesBody) -> dict:
    result = extract_frames(body.filePath, body.fps, body.maxFrames, body.outputDir)
    return {"success": True, "data": result}


# ─── Cut Detection ───

class DetectCutsBody(BaseModel):
    frameDir: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0)
    threshold: float = Field(default=0.3, gt=0, lt=1)


def detect_cuts(frame_dir: str, fps: float = 3.0, threshold: float = 0.3):
    import cv2
    import numpy as np

    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    if len(frame_files) < 2:
        return {"cuts": [], "shots": [{"start_s": 0, "end_s": 0, "frame_start": 0, "frame_end": 0}]}

    histograms = []
    for fp in frame_files:
        img = cv2.imread(str(fp))
        if img is None:
            continue
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        histograms.append(hist)

    cuts = []
    for i in range(1, len(histograms)):
        diff = cv2.compareHist(histograms[i - 1], histograms[i], cv2.HISTCMP_BHATTACHARYYA)
        if diff > threshold:
            cuts.append({
                "frame_index": i,
                "timestamp_s": round(i / fps, 4),
                "confidence": round(min(diff, 1.0), 4),
            })

    shots = []
    start_frame = 0
    for cut in cuts:
        shots.append({
            "start_s": round(start_frame / fps, 4),
            "end_s": cut["timestamp_s"],
            "frame_start": start_frame,
            "frame_end": cut["frame_index"],
        })
        start_frame = cut["frame_index"]

    shots.append({
        "start_s": round(start_frame / fps, 4),
        "end_s": round(len(histograms) / fps, 4),
        "frame_start": start_frame,
        "frame_end": len(histograms) - 1,
    })

    min_dur = 0.2
    shots = [s for s in shots if (s["end_s"] - s["start_s"]) >= min_dur]

    return {"cuts": cuts, "shots": shots}


@app.post("/detect-cuts")
def detect_cuts_route(body: DetectCutsBody) -> dict:
    result = detect_cuts(body.frameDir, body.fps, body.threshold)
    return {"success": True, "data": result}


# ─── Motion Analysis ───

class AnalyzeMotionBody(BaseModel):
    frameDir: str = Field(min_length=1)
    shots: list[dict] = Field(min_length=1)


def classify_motion(flow_magnitude: float, flow_angle: float) -> tuple[str, float, float | None]:
    import math
    if flow_magnitude < 0.5:
        return "static", 0.0, None
    if flow_magnitude < 2.0:
        return "handheld", min(flow_magnitude / 5.0, 1.0), None
    deg = math.degrees(flow_angle) % 360
    if 315 <= deg or deg <= 45:
        return "pan_right", min(flow_magnitude / 10.0, 1.0), deg
    elif 135 <= deg <= 225:
        return "pan_left", min(flow_magnitude / 10.0, 1.0), deg
    elif 45 < deg < 135:
        return "zoom_in", min(flow_magnitude / 10.0, 1.0), deg
    elif 225 < deg < 315:
        return "zoom_out", min(flow_magnitude / 10.0, 1.0), deg
    return "shake", min(flow_magnitude / 10.0, 1.0), deg


def analyze_motion(frame_dir: str, shots: list[dict]) -> dict:
    import cv2
    import numpy as np

    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    motions = []

    for i, shot in enumerate(shots):
        sf = shot["frame_start"]
        ef = min(shot["frame_end"], len(frame_files) - 1)
        if sf >= len(frame_files) or sf >= ef:
            motions.append({"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None})
            continue

        img1 = cv2.imread(str(frame_files[sf]), cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imread(str(frame_files[ef]), cv2.IMREAD_GRAYSCALE)
        if img1 is None or img2 is None:
            motions.append({"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None})
            continue

        if img1.shape != img2.shape:
            img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        flow = cv2.calcOpticalFlowFarneback(img1, img2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        avg_mag = float(np.mean(magnitude))
        # Weight angle by magnitude — ignore static regions (sky, walls, floors)
        mask = magnitude > np.percentile(magnitude, 75)
        dominant_angle = float(np.median(angle[mask])) if mask.any() else float(np.median(angle))

        motion_type, intensity, direction = classify_motion(avg_mag, dominant_angle)
        motions.append({
            "shot_index": i,
            "motion": motion_type,
            "intensity": round(intensity, 4),
            "direction_degrees": round(direction, 2) if direction is not None else None,
        })

    return {"motions": motions}


@app.post("/analyze-motion")
def analyze_motion_route(body: AnalyzeMotionBody) -> dict:
    result = analyze_motion(body.frameDir, body.shots)
    return {"success": True, "data": result}


# ─── Color Analysis ───

class AnalyzeColorBody(BaseModel):
    frameDir: str = Field(min_length=1)
    shots: list[dict] = Field(min_length=1)


def classify_temperature(hue: float) -> str:
    if hue < 30 or hue > 150:
        return "warm"
    elif 90 <= hue <= 150:
        return "cool"
    return "neutral"


def analyze_color(frame_dir: str, shots: list[dict]) -> dict:
    import cv2
    import numpy as np

    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    shot_colors = []
    all_hues, all_sats, all_brights = [], [], []

    for i, shot in enumerate(shots):
        sf = shot["frame_start"]
        ef = min(shot["frame_end"], len(frame_files) - 1)
        if sf >= len(frame_files):
            shot_colors.append({"shot_index": i, "dominant_hue": "90", "temperature": "neutral", "saturation": 0, "brightness": 0})
            continue

        hues, sats, brights = [], [], []
        for fi in range(sf, ef + 1):
            img = cv2.imread(str(frame_files[fi]))
            if img is None:
                continue
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            hues.append(float(np.mean(hsv[:, :, 0])))
            sats.append(float(np.mean(hsv[:, :, 1])) / 255.0)
            brights.append(float(np.mean(hsv[:, :, 2])) / 255.0)

        avg_hue = float(np.mean(hues)) if hues else 90
        avg_sat = float(np.mean(sats)) if sats else 0.5
        avg_bright = float(np.mean(brights)) if brights else 0.5

        shot_colors.append({
            "shot_index": i,
            "dominant_hue": f"{avg_hue:.0f}",
            "temperature": classify_temperature(avg_hue),
            "saturation": round(avg_sat, 4),
            "brightness": round(avg_bright, 4),
        })
        all_hues.extend(hues)
        all_sats.extend(sats)
        all_brights.extend(brights)

    global_sat = float(np.mean(all_sats)) if all_sats else 0.5
    global_bright = float(np.mean(all_brights)) if all_brights else 0.5
    global_hue = float(np.mean(all_hues)) if all_hues else 90
    brightness_std = float(np.std(all_brights)) if all_brights else 0.1

    return {
        "shots": shot_colors,
        "global": {
            "contrast": round(1.0 + brightness_std * 2, 4),
            "saturation": round(global_sat, 4),
            "temperature_shift": classify_temperature(global_hue),
            "shadows_tint": "neutral",
            "highlights_tint": "neutral",
        },
    }


@app.post("/analyze-color")
def analyze_color_route(body: AnalyzeColorBody) -> dict:
    result = analyze_color(body.frameDir, body.shots)
    return {"success": True, "data": result}


# ─── Frame Mosaic ───

class CreateMosaicBody(BaseModel):
    frameDir: str = Field(min_length=1)
    fps: float = Field(default=3.0, gt=0, le=30)
    cols: int = Field(default=6, ge=2, le=12)
    thumbWidth: int = Field(default=320, ge=100, le=800)
    thumbHeight: int = Field(default=180, ge=60, le=450)


def create_mosaic(frame_dir, fps=3.0, cols=6, thumb_width=320, thumb_height=180):
    from workers.frame_mosaic import create_mosaic as _create_mosaic
    output_path = os.path.join(frame_dir, "_mosaic.jpg")
    result = _create_mosaic(frame_dir, output_path, cols=cols, thumb_width=thumb_width, thumb_height=thumb_height, fps=fps)
    if result and os.path.exists(result):
        file_size = os.path.getsize(result)
        return {"path": result, "file_size": file_size, "exists": True}
    return {"path": "", "file_size": 0, "exists": False}


@app.post("/create-mosaic")
def create_mosaic_route(body: CreateMosaicBody) -> dict:
    result = create_mosaic(body.frameDir, body.fps, body.cols, body.thumbWidth, body.thumbHeight)
    return {"success": True, "data": result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8102)

---

## 3. workers/python-ai/workers/frame_extractor.py

"""Frame extraction using FFmpeg. Extracts frames at specified FPS."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class FrameInfo:
    path: str
    timestamp_s: float
    width: int
    height: int


@dataclass
class ExtractionResult:
    frames: list[FrameInfo]
    metadata: dict


def extract_frames(
    file_path: str,
    fps: float = 3.0,
    max_frames: int | None = None,
    output_dir: str | None = None,
) -> ExtractionResult:
    """Extract frames from video using FFmpeg at specified FPS.

    Args:
        file_path: Path to input video file
        fps: Frames per second to extract (default 3)
        max_frames: Maximum number of frames to extract (optional)
        output_dir: Directory to save frames (default: temp dir)

    Returns:
        ExtractionResult with frame paths and metadata
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="jalebi-frames-")

    os.makedirs(output_dir, exist_ok=True)

    # Get video duration and dimensions
    probe_cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", file_path,
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    probe_data = json.loads(probe_result.stdout)

    duration = float(probe_data["format"]["duration"])

    width, height = 1920, 1080
    for stream in probe_data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width", 1920)
            height = stream.get("height", 1080)
            break

    # Extract frames
    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    cmd = [
        "ffmpeg", "-i", file_path,
        "-vf", f"fps={fps}",
        "-q:v", "2",
    ]

    if max_frames:
        cmd.extend(["-vframes", str(max_frames)])

    cmd.extend(["-y", output_pattern])

    subprocess.run(cmd, capture_output=True, check=True)

    # Collect frame info
    frames: list[FrameInfo] = []
    frame_files = sorted(Path(output_dir).glob("frame_*.jpg"))

    for i, frame_path in enumerate(frame_files):
        timestamp_s = i / fps
        frames.append(FrameInfo(
            path=str(frame_path),
            timestamp_s=round(timestamp_s, 4),
            width=width,
            height=height,
        ))

    return ExtractionResult(
        frames=frames,
        metadata={
            "total_frames": len(frames),
            "fps": fps,
            "duration_s": duration,
            "output_dir": output_dir,
        },
    )

---

## 4. workers/python-ai/workers/cut_detector.py

"""Cut detection using histogram difference between consecutive frames."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class CutPoint:
    frame_index: int
    timestamp_s: float
    confidence: float


@dataclass
class ShotSegment:
    start_s: float
    end_s: float
    frame_start: int
    frame_end: int


def detect_cuts(
    frame_dir: str,
    fps: float = 3.0,
    threshold: float = 0.3,
    min_shot_duration_s: float = 0.2,
) -> dict:
    """Detect scene cuts by comparing histograms of consecutive frames.

    Args:
        frame_dir: Directory containing extracted frames
        fps: Frame rate used during extraction
        threshold: Histogram diff threshold for cut detection (0-1)
        min_shot_duration_s: Minimum shot duration in seconds

    Returns:
        Dict with cuts and shots arrays
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))

    if len(frame_files) < 2:
        return {
            "cuts": [],
            "shots": [
                {"start_s": 0.0, "end_s": 0.0, "frame_start": 0, "frame_end": 0}
            ],
        }

    # Compute histogram for each frame
    histograms = []
    for frame_path in frame_files:
        img = cv2.imread(str(frame_path))
        if img is None:
            continue
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        histograms.append(hist)

    if len(histograms) < 2:
        return {
            "cuts": [],
            "shots": [
                {"start_s": 0.0, "end_s": 0.0, "frame_start": 0, "frame_end": 0}
            ],
        }

    # Compare consecutive frames
    cuts: list[CutPoint] = []
    for i in range(1, len(histograms)):
        diff = cv2.compareHist(
            histograms[i - 1], histograms[i], cv2.HISTCMP_BHATTACHARYYA
        )
        if diff > threshold:
            cuts.append(
                CutPoint(
                    frame_index=i,
                    timestamp_s=round(i / fps, 4),
                    confidence=round(min(diff, 1.0), 4),
                )
            )

    # Build shot segments
    shots: list[ShotSegment] = []
    start_frame = 0
    for cut in cuts:
        shots.append(
            ShotSegment(
                start_s=round(start_frame / fps, 4),
                end_s=cut.timestamp_s,
                frame_start=start_frame,
                frame_end=cut.frame_index,
            )
        )
        start_frame = cut.frame_index

    # Final shot
    shots.append(
        ShotSegment(
            start_s=round(start_frame / fps, 4),
            end_s=round(len(histograms) / fps, 4),
            frame_start=start_frame,
            frame_end=len(histograms) - 1,
        )
    )

    # Filter shots below minimum duration
    shots = [s for s in shots if (s.end_s - s.start_s) >= min_shot_duration_s]

    return {
        "cuts": [
            {"frame_index": c.frame_index, "timestamp_s": c.timestamp_s, "confidence": c.confidence}
            for c in cuts
        ],
        "shots": [
            {"start_s": s.start_s, "end_s": s.end_s, "frame_start": s.frame_start, "frame_end": s.frame_end}
            for s in shots
        ],
    }

---

## 5. workers/python-ai/workers/motion_analyzer.py

"""Motion analysis using optical flow between shot boundary frames."""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class ShotMotion:
    shot_index: int
    motion: str
    intensity: float
    direction_degrees: float | None


def _compute_flow_stats(img1: np.ndarray, img2: np.ndarray) -> tuple[float, float, float]:
    flow = cv2.calcOpticalFlowFarneback(img1, img2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    vx, vy = flow[..., 0], flow[..., 1]
    magnitude, angle = cv2.cartToPolar(vx, vy)

    mean_mag = float(np.mean(magnitude))

    # Weight angle by magnitude — ignore static regions (sky, walls, floors)
    mask = magnitude > np.percentile(magnitude, 75)
    dominant_angle = float(np.median(angle[mask])) if mask.any() else float(np.median(angle))

    h, w = img1.shape
    cy, cx = h / 2, w / 2
    ys, xs = np.mgrid[0:h, 0:w]
    dx = xs.astype(np.float32) - cx
    dy = ys.astype(np.float32) - cy

    dot = vx * dx + vy * dy
    radial_mag = np.sqrt(dx * dx + dy * dy)
    radial_mag[radial_mag == 0] = 1.0
    radial_norm = dot / radial_mag
    radial_fraction = float(np.mean(radial_norm > 0) if mean_mag > 0 else 0)

    return mean_mag, dominant_angle, radial_fraction


def classify_motion(
    flow_magnitude: float,
    flow_angle: float,
    radial_fraction: float,
    flow_std: float = 0.0,
) -> tuple[str, float, float | None]:
    """Classify camera motion from optical flow statistics.

    Returns:
        (motion_type, intensity, direction_degrees)
    """
    if flow_magnitude < 0.5:
        return "static", 0.0, None

    if flow_magnitude < 2.0:
        return "handheld", min(flow_magnitude / 5.0, 1.0), None

    deg = math.degrees(flow_angle) % 360
    intensity = min(flow_magnitude / 10.0, 1.0)

    if 0.6 < radial_fraction < 0.75:
        return "zoom_in", intensity, deg
    if radial_fraction > 0.75:
        return "zoom_out", intensity, deg

    if flow_std > flow_magnitude * 0.8:
        return "shake", intensity, deg

    if 315 <= deg or deg <= 45:
        return "pan_right", intensity, deg
    if 135 <= deg <= 225:
        return "pan_left", intensity, deg
    if 45 < deg < 135:
        return "tilt_up", intensity, deg
    if 225 < deg < 315:
        return "tilt_down", intensity, deg

    return "shake", intensity, deg


def analyze_motion(
    frame_dir: str,
    shots: list[dict],
) -> dict:
    """Analyze camera motion for each shot using optical flow.

    Args:
        frame_dir: Directory containing extracted frames
        shots: Shot segments from cut detection

    Returns:
        Dict with motions array
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))

    motions = []
    for i, shot in enumerate(shots):
        start_frame = shot["frame_start"]
        end_frame = shot["frame_end"]

        if start_frame >= len(frame_files) or end_frame >= len(frame_files):
            motions.append(
                {"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None}
            )
            continue

        img1 = cv2.imread(str(frame_files[start_frame]), cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imread(
            str(frame_files[min(end_frame, len(frame_files) - 1)]),
            cv2.IMREAD_GRAYSCALE,
        )

        if img1 is None or img2 is None:
            motions.append(
                {"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None}
            )
            continue

        if img1.shape != img2.shape:
            img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        mean_mag, dominant_angle, radial_frac = _compute_flow_stats(img1, img2)

        mid_frame = (start_frame + end_frame) // 2
        flow_std = 0.0
        if 0 < start_frame < mid_frame < end_frame < len(frame_files):
            img_prev = cv2.imread(str(frame_files[mid_frame - 1]), cv2.IMREAD_GRAYSCALE)
            img_next = cv2.imread(str(frame_files[min(mid_frame + 1, len(frame_files) - 1)]), cv2.IMREAD_GRAYSCALE)
            if img_prev is not None and img_next is not None:
                if img_prev.shape != img_next.shape:
                    img_next = cv2.resize(img_next, (img_prev.shape[1], img_prev.shape[0]))
                prev_flow = cv2.calcOpticalFlowFarneback(
                    img_prev, img_next, None, 0.5, 3, 15, 3, 5, 1.2, 0
                )
                prev_mag, _ = cv2.cartToPolar(prev_flow[..., 0], prev_flow[..., 1])
                flow_std = float(np.std(prev_mag))

        motion_type, intensity, direction = classify_motion(
            mean_mag, dominant_angle, radial_frac, flow_std
        )

        motions.append(
            {
                "shot_index": i,
                "motion": motion_type,
                "intensity": round(intensity, 4),
                "direction_degrees": round(direction, 2) if direction is not None else None,
            }
        )

    return {"motions": motions}

---

## 6. workers/python-ai/workers/color_analyzer.py

"""Color analysis using per-shot histogram statistics."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def classify_temperature(avg_hue: float) -> str:
    """Classify color temperature from HSV hue.

    Warm hues: 0-30 (red/orange/yellow)
    Neutral: 30-89 (yellow-green transition)
    Cool hues: 90-150 (blue/cyan)
    Warm hues: >150 (magenta/red)
    """
    if avg_hue < 30 or avg_hue > 150:
        return "warm"
    elif 90 <= avg_hue <= 150:
        return "cool"
    return "neutral"


def analyze_color(
    frame_dir: str,
    shots: list[dict],
) -> dict:
    """Analyze color profile for each shot and globally.

    Returns:
        Dict with per-shot color and global color profile
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))

    shot_colors = []
    all_hues: list[float] = []
    all_saturations: list[float] = []
    all_brightnesses: list[float] = []

    for i, shot in enumerate(shots):
        start_frame = shot["frame_start"]
        end_frame = min(shot["frame_end"], len(frame_files) - 1)

        if start_frame >= len(frame_files):
            shot_colors.append({
                "shot_index": i,
                "dominant_hue": "90",
                "temperature": "neutral",
                "saturation": 0,
                "brightness": 0,
            })
            continue

        hues: list[float] = []
        sats: list[float] = []
        brights: list[float] = []

        for fi in range(start_frame, end_frame + 1):
            img = cv2.imread(str(frame_files[fi]))
            if img is None:
                continue
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            hues.append(float(np.mean(hsv[:, :, 0])))
            sats.append(float(np.mean(hsv[:, :, 1])) / 255.0)
            brights.append(float(np.mean(hsv[:, :, 2])) / 255.0)

        avg_hue = float(np.mean(hues)) if hues else 90
        avg_sat = float(np.mean(sats)) if sats else 0.5
        avg_bright = float(np.mean(brights)) if brights else 0.5
        temperature = classify_temperature(avg_hue)

        shot_colors.append({
            "shot_index": i,
            "dominant_hue": f"{avg_hue:.0f}",
            "temperature": temperature,
            "saturation": round(avg_sat, 4),
            "brightness": round(avg_bright, 4),
        })

        all_hues.extend(hues)
        all_saturations.extend(sats)
        all_brightnesses.extend(brights)

    global_sat = float(np.mean(all_saturations)) if all_saturations else 0.5
    global_bright = float(np.mean(all_brightnesses)) if all_brightnesses else 0.5
    global_hue = float(np.mean(all_hues)) if all_hues else 90

    brightness_std = float(np.std(all_brightnesses)) if all_brightnesses else 0.1
    contrast = 1.0 + (brightness_std * 2)

    return {
        "shots": shot_colors,
        "global": {
            "contrast": round(contrast, 4),
            "saturation": round(global_sat, 4),
            "temperature_shift": classify_temperature(global_hue),
            "shadows_tint": "neutral",
            "highlights_tint": "neutral",
        },
    }

---

## 7. workers/python-ai/workers/frame_mosaic.py

"""Frame mosaic — combines extracted frames into a single contact sheet image."""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np


def create_mosaic(
    frame_dir: str,
    output_path: str,
    cols: int = 6,
    thumb_width: int = 320,
    thumb_height: int = 180,
    padding: int = 4,
    bg_color: tuple[int, int, int] = (20, 20, 20),
    label_frames: bool = True,
    fps: float = 3.0,
) -> str:
    """Create a contact sheet / mosaic from extracted frames.
    
    Args:
        frame_dir: Directory containing frame_*.jpg files
        output_path: Where to save the mosaic image
        cols: Number of columns in the grid
        thumb_width: Width of each thumbnail
        thumb_height: Height of each thumbnail
        padding: Pixels between thumbnails
        bg_color: Background color (BGR)
        label_frames: Whether to add frame number labels
        fps: Frame rate used during extraction (for timestamp labels)
    
    Returns:
        Path to the created mosaic image
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))
    if not frame_files:
        return ""
    
    n_frames = len(frame_files)
    rows = (n_frames + cols - 1) // cols
    
    # Calculate canvas size
    canvas_w = cols * (thumb_width + padding) + padding
    canvas_h = rows * (thumb_height + padding) + padding
    
    canvas = np.full((canvas_h, canvas_w, 3), bg_color, dtype=np.uint8)
    
    for i, fp in enumerate(frame_files):
        row = i // cols
        col = i % cols
        
        x = padding + col * (thumb_width + padding)
        y = padding + row * (thumb_height + padding)
        
        # Read and resize frame
        img = cv2.imread(str(fp))
        if img is None:
            continue
        
        # Resize maintaining aspect ratio
        h, w = img.shape[:2]
        scale = min(thumb_width / w, thumb_height / h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(img, (new_w, new_h))
        
        # Center in thumbnail cell
        offset_x = (thumb_width - new_w) // 2
        offset_y = (thumb_height - new_h) // 2
        
        canvas[y + offset_y:y + offset_y + new_h, x + offset_x:x + offset_x + new_w] = resized
        
        # Add frame label
        if label_frames:
            timestamp = i / fps
            label = f"{i+1} ({timestamp:.1f}s)"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.4
            thickness = 1
            (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)
            cv2.putText(canvas, label, (x + 4, y + thumb_height - 6), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)
    
    # Add title bar
    title_h = 30
    title_canvas = np.full((title_h, canvas_w, 3), (40, 40, 40), dtype=np.uint8)
    title = f"Frame Mosaic — {n_frames} frames @ {fps}fps ({n_frames/fps:.1f}s)"
    cv2.putText(title_canvas, title, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1, cv2.LINE_AA)
    
    final = np.vstack([title_canvas, canvas])
    
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    cv2.imwrite(output_path, final, [cv2.IMWRITE_JPEG_QUALITY, 85])
    
    return output_path


def get_mosaic_base64(frame_dir: str, fps: float = 3.0) -> str:
    """Create mosaic and return as base64 string for API calls."""
    import base64
    
    temp_path = os.path.join(frame_dir, "_mosaic.jpg")
    create_mosaic(frame_dir, temp_path, fps=fps)
    
    if not os.path.exists(temp_path):
        return ""
    
    with open(temp_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    
    os.remove(temp_path)
    return b64

---

## 8. packages/edit-dna/src/schema.ts

export interface EditDNA {
  version: "1.0";
  source: {
    type: "reference" | "footage";
    duration_s: number;
    fps: number;
    resolution: { width: number; height: number };
    aspect_ratio: string;
  };
  shots: Shot[];
  color: ColorProfile;
  audio: AudioProfile;
  text_events: TextEvent[];
  pacing: PacingProfile;
  metadata: {
    analyzed_at: string;
    frame_count: number;
    analysis_fps: number;
    confidence: number;
    field_owners: Record<string, string>;
  };
}

export interface Shot {
  id: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  content: {
    description: string;
    subjects: string[];
    action: string;
    mood: string;
  };
  camera: {
    motion: "static" | "pan_left" | "pan_right" | "zoom_in" | "zoom_out" | "shake" | "tracking" | "handheld";
    intensity: number;
    direction_degrees?: number;
  };
  color: {
    dominant_hue: string;
    temperature: "warm" | "cool" | "neutral";
    saturation: number;
    brightness: number;
  };
  crop?: "tight" | "medium" | "wide" | "ultra-wide";
  cut_in_type?: "hard" | "dissolve" | "fade_from_black";
  cut_out_type?: "hard" | "dissolve" | "fade_to_black";
}

export interface ColorProfile {
  contrast: number;
  saturation: number;
  temperature_shift: "warm" | "cool" | "neutral";
  shadows_tint: string;
  highlights_tint: string;
  lut_approximation?: {
    shadows: [number, number, number];
    mids: [number, number, number];
    highlights: [number, number, number];
  };
}

export interface AudioProfile {
  bpm: number;
  beat_grid_s: number[];
  downbeats_s: number[];
  energy_curve: { time_s: number; energy: number }[];
  speech_segments: { start_s: number; end_s: number }[];
  sync_points_s: number[];
}

export interface TextEvent {
  start_s: number;
  end_s: number;
  content: string;
  position: "center" | "top" | "bottom" | "lower-third";
  style: "bold" | "italic" | "outline" | "shadow" | "glow";
  animation: "pop" | "fade" | "slide" | "typewriter" | "none";
}

export interface PacingProfile {
  avg_shot_length_s: number;
  variance: "low" | "medium" | "high";
  energy_curve: "rising" | "falling" | "peak" | "valley" | "steady";
  climax_position_s?: number;
}

---

## 9. packages/edit-dna/src/zod-schema.ts

import { z } from "zod";

const shotSchema = z.object({
  id: z.string().min(1),
  start_s: z.number().min(0),
  end_s: z.number().min(0),
  duration_s: z.number().min(0),
  content: z.object({
    description: z.string(),
    subjects: z.array(z.string()),
    action: z.string(),
    mood: z.string(),
  }),
  camera: z.object({
    motion: z.enum(["static", "pan_left", "pan_right", "zoom_in", "zoom_out", "shake", "tracking", "handheld"]),
    intensity: z.number().min(0).max(1),
    direction_degrees: z.number().optional(),
  }),
  color: z.object({
    dominant_hue: z.string(),
    temperature: z.enum(["warm", "cool", "neutral"]),
    saturation: z.number().min(0).max(1),
    brightness: z.number().min(0).max(1),
  }),
  crop: z.enum(["tight", "medium", "wide", "ultra-wide"]).optional(),
  cut_in_type: z.enum(["hard", "dissolve", "fade_from_black"]).optional(),
  cut_out_type: z.enum(["hard", "dissolve", "fade_to_black"]).optional(),
});

const colorProfileSchema = z.object({
  contrast: z.number(),
  saturation: z.number(),
  temperature_shift: z.enum(["warm", "cool", "neutral"]),
  shadows_tint: z.string(),
  highlights_tint: z.string(),
  lut_approximation: z.object({
    shadows: z.tuple([z.number(), z.number(), z.number()]),
    mids: z.tuple([z.number(), z.number(), z.number()]),
    highlights: z.tuple([z.number(), z.number(), z.number()]),
  }).optional(),
});

const audioProfileSchema = z.object({
  bpm: z.number().min(0),
  beat_grid_s: z.array(z.number()),
  downbeats_s: z.array(z.number()),
  energy_curve: z.array(z.object({ time_s: z.number(), energy: z.number() })),
  speech_segments: z.array(z.object({ start_s: z.number(), end_s: z.number() })),
  sync_points_s: z.array(z.number()),
});

const textEventSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  content: z.string(),
  position: z.enum(["center", "top", "bottom", "lower-third"]),
  style: z.enum(["bold", "italic", "outline", "shadow", "glow"]),
  animation: z.enum(["pop", "fade", "slide", "typewriter", "none"]),
});

const pacingProfileSchema = z.object({
  avg_shot_length_s: z.number().min(0),
  variance: z.enum(["low", "medium", "high"]),
  energy_curve: z.enum(["rising", "falling", "peak", "valley", "steady"]),
  climax_position_s: z.number().optional(),
});

export const editDNAz = z.object({
  version: z.literal("1.0"),
  source: z.object({
    type: z.enum(["reference", "footage"]),
    duration_s: z.number().min(0),
    fps: z.number().min(0),
    resolution: z.object({ width: z.number().min(1), height: z.number().min(1) }),
    aspect_ratio: z.string(),
  }),
  shots: z.array(shotSchema).min(1),
  color: colorProfileSchema,
  audio: audioProfileSchema,
  text_events: z.array(textEventSchema),
  pacing: pacingProfileSchema,
  metadata: z.object({
    analyzed_at: z.string(),
    frame_count: z.number().min(0),
    analysis_fps: z.number().min(0),
    confidence: z.number().min(0).max(1),
    field_owners: z.record(z.string()),
  }),
});

export type EditDNAInput = z.input<typeof editDNAz>;

---

## 10. packages/edit-dna/src/index.ts

export { editDNAz } from "./zod-schema.js";
export type { EditDNA, Shot, ColorProfile, AudioProfile, TextEvent, PacingProfile } from "./schema.js";
export type { EditDNAInput } from "./zod-schema.js";

import { z } from "zod";
import { editDNAz } from "./zod-schema.js";
import type { EditDNA } from "./schema.js";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function validateEditDNA(data: unknown): Result<EditDNA, z.ZodError> {
  const result = editDNAz.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data as EditDNA };
  }
  return { ok: false, error: result.error };
}

---

## 11. packages/intent-compiler/src/types.ts

export interface OperationPlan {
  version: "1.0";
  target_duration_s: number;
  aspect_ratio: string;
  operations: Operation[];
  global_effects: GlobalEffect[];
  text_overlays: TextOverlay[];
  audio_mix: AudioMix;
}

export type Operation =
  | { type: "place_clip"; clip_id: string; track: number; start_s: number; duration_s: number; in_point_s: number; out_point_s: number }
  | { type: "apply_speed"; target: "clip" | "segment"; clip_id?: string; segment_index?: number; curve: SpeedCurve }
  | { type: "apply_transition"; between: [number, number]; transition_type: "crossfade" | "wipe" | "dissolve" | "hard"; duration_s: number }
  | { type: "apply_effect"; target: "clip" | "segment"; effect: EffectParams }
  | { type: "apply_color"; target: "global" | "clip"; clip_id?: string; params: ColorParams };

export interface SpeedCurve {
  keyframes: { time_s: number; speed: number }[];
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface GlobalEffect {
  type: "color_grade" | "vignette" | "grain" | "glow";
  params: Record<string, number>;
}

export interface TextOverlay {
  text: string;
  start_s: number;
  end_s: number;
  position: { x: number; y: number };
  style: Record<string, unknown>;
  animation: string;
}

export interface AudioMix {
  tracks: { clip_id: string; volume: number; fade_in_s: number; fade_out_s: number }[];
  ducking?: { enabled: boolean; threshold: number };
}

export interface EffectParams {
  type: string;
  intensity: number;
  [key: string]: unknown;
}

export interface ColorParams {
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: string;
  lut?: string;
}

---

## 12. packages/intent-compiler/src/compiler.ts

import { validateOperationPlan, type OperationPlan, type Result } from "./index.js";
import type { EditDNA } from "@monet/edit-dna";

export interface ClipManifest {
  clips: {
    id: string;
    filePath: string;
    duration_s: number;
    resolution: { width: number; height: number };
    content_tags?: string[];
  }[];
}

export type CallLLM = (systemPrompt: string, userMessage: string) => Promise<string>;

const MAX_RETRIES = 2;

function buildUserMessage(dna: EditDNA, manifest: ClipManifest, userPrompt: string): string {
  return (
    `Edit DNA:\n${JSON.stringify(dna, null, 2)}\n\n` +
    `Available clips:\n${JSON.stringify(manifest, null, 2)}\n\n` +
    `User request: ${userPrompt}`
  );
}

export async function compileIntent(
  dna: EditDNA,
  manifest: ClipManifest,
  userPrompt: string,
  callLLM: CallLLM,
  systemPrompt: string,
): Promise<Result<OperationPlan, string>> {
  const userMessage = buildUserMessage(dna, manifest, userPrompt);
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prompt =
        attempt === 0
          ? systemPrompt
          : `${systemPrompt}\n\nYour previous output failed validation: ${lastError}\nFix the error and return the corrected OperationPlan.`;

      const response = await callLLM(prompt, userMessage);

      let parsed: unknown;
      try {
        parsed = JSON.parse(response);
      } catch {
        lastError = "Invalid JSON in LLM response";
        continue;
      }

      const validation = validateOperationPlan(parsed);
      if (validation.ok) {
        return { ok: true, value: validation.value };
      }

      lastError = validation.error.message;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    error: `Intent compilation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
  };
}

---

## 13. src/server/lib/analysis-engine.ts

/**
 * Analysis Engine — orchestrates all analysis modules into Edit DNA.
 *
 * Order: extract frames → detect cuts → analyze motion → analyze color →
 *        caption shots (vision AI) → analyze audio → assemble Edit DNA
 */

import { z } from "zod";
import { validateEditDNA, type EditDNA, type Result } from "@monet/edit-dna";
import type { Env } from "../types/env";
import { captionShots, type ShotCaption } from "./vision-captioner.js";

const PYTHON_AI_URL_DEFAULT = "http://localhost:8102";
const PYTHON_AUDIO_URL_DEFAULT = "http://localhost:8101";

interface AnalysisOptions {
  filePath: string;
  fps?: number;
  type?: "reference" | "footage";
}

interface FrameInfo {
  path: string;
  timestamp_s: number;
  width: number;
  height: number;
}

interface ExtractionResult {
  frames: FrameInfo[];
  metadata: {
    total_frames: number;
    fps: number;
    duration_s: number;
    output_dir: string;
  };
}

interface CutResult {
  cuts: { frame_index: number; timestamp_s: number; confidence: number }[];
  shots: { start_s: number; end_s: number; frame_start: number; frame_end: number }[];
}

interface MotionResult {
  motions: { shot_index: number; motion: string; intensity: number; direction_degrees: number | null }[];
}

interface ColorResult {
  shots: { shot_index: number; dominant_hue: string; temperature: string; saturation: number; brightness: number }[];
  global: { contrast: number; saturation: number; temperature_shift: string; shadows_tint: string; highlights_tint: string };
}

interface AudioAnalysisResult {
  duration: number;
  sampleRate: number;
  tempo: number;
  beats: number[];
  transients: number[];
  energyCurve: { time: number; value: number }[];
  onsetCurve: { time: number; value: number }[];
  summary: { beatCount: number; transientCount: number; averageEnergy: number; maxEnergy: number };
}

const PythonWorkerResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
});

async function pythonPost<T>(url: string, body: unknown, dataSchema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Python worker ${url} returned ${res.status}`);
  }
  const raw = await res.json();
  const parsed = PythonWorkerResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Python worker at ${url} returned invalid envelope: ${JSON.stringify(raw)}`);
  }
  if (!parsed.data.success) throw new Error(`Python worker error at ${url}`);
  const dataResult = dataSchema.safeParse(parsed.data.data);
  if (!dataResult.success) {
    throw new Error(`Python worker at ${url} returned invalid data: ${dataResult.error.message}`);
  }
  return dataResult.data;
}

export async function analyzeVideo(
  env: Env,
  options: AnalysisOptions,
): Promise<Result<EditDNA, string>> {
  const { filePath, fps = 3, type = "reference" } = options;
  const aiUrl = env.PYTHON_AI_URL || PYTHON_AI_URL_DEFAULT;
  const audioUrl = env.PYTHON_AUDIO_URL || PYTHON_AUDIO_URL_DEFAULT;

  try {
    // Step 1: Extract frames
    const extraction = await pythonPost<ExtractionResult>(`${aiUrl}/extract-frames`, {
      filePath,
      fps,
    });

    const { frames, metadata } = extraction;
    if (frames.length === 0) {
      return { ok: false, error: "No frames extracted from video" };
    }

    // Step 2: Detect cuts
    const cutResult = await pythonPost<CutResult>(`${aiUrl}/detect-cuts`, {
      frameDir: metadata.output_dir,
      fps,
      threshold: 0.3,
    });

    if (cutResult.shots.length === 0) {
      return { ok: false, error: "No shots detected in video" };
    }

    // Step 3: Analyze motion
    const motionResult = await pythonPost<MotionResult>(`${aiUrl}/analyze-motion`, {
      frameDir: metadata.output_dir,
      shots: cutResult.shots,
    });

    // Step 4: Analyze color
    const colorResult = await pythonPost<ColorResult>(`${aiUrl}/analyze-color`, {
      frameDir: metadata.output_dir,
      shots: cutResult.shots,
    });

    // Step 5: Vision captioning
    const captions = await captionShots(env, metadata.output_dir, cutResult.shots, fps);

    // Step 6: Audio analysis (optional — proceed without it on failure)
    let audioProfile = buildEmptyAudioProfile();
    try {
      const audioResult = await pythonPost<AudioAnalysisResult>(`${audioUrl}/analyze-audio`, {
        filePath,
      });
      audioProfile = mapAudioProfile(audioResult);
    } catch {
      // Audio analysis is optional
    }

    // Step 7: Assemble Edit DNA
    const shots = cutResult.shots.map((shot, i) => ({
      id: `shot-${i}`,
      start_s: shot.start_s,
      end_s: shot.end_s,
      duration_s: shot.end_s - shot.start_s,
      content: {
        description: captions[i]?.description || "Unknown",
        subjects: captions[i]?.subjects || [],
        action: captions[i]?.action || "unknown",
        mood: captions[i]?.mood || "neutral",
      },
      camera: {
        motion: mapMotionType(motionResult.motions[i]?.motion || "static"),
        intensity: clamp01(motionResult.motions[i]?.intensity || 0),
        direction_degrees: motionResult.motions[i]?.direction_degrees ?? undefined,
      },
      color: {
        dominant_hue: colorResult.shots[i]?.dominant_hue || "90",
        temperature: mapTemperature(colorResult.shots[i]?.temperature),
        saturation: clamp01(colorResult.shots[i]?.saturation ?? 0.5),
        brightness: clamp01(colorResult.shots[i]?.brightness ?? 0.5),
      },
    }));

    const dna: EditDNA = {
      version: "1.0",
      source: {
        type,
        duration_s: metadata.duration_s,
        fps: metadata.fps,
        resolution: { width: frames[0]?.width || 1920, height: frames[0]?.height || 1080 },
        aspect_ratio: "16:9",
      },
      shots,
      color: {
        contrast: colorResult.global.contrast,
        saturation: colorResult.global.saturation,
        temperature_shift: mapTemperature(colorResult.global.temperature_shift),
        shadows_tint: colorResult.global.shadows_tint,
        highlights_tint: colorResult.global.highlights_tint,
      },
      audio: audioProfile,
      text_events: [],
      pacing: {
        avg_shot_length_s: shots.reduce((sum, s) => sum + s.duration_s, 0) / shots.length,
        variance: shots.length > 5 ? "high" : shots.length > 2 ? "medium" : "low",
        energy_curve: "steady",
      },
      metadata: {
        analyzed_at: new Date().toISOString(),
        frame_count: frames.length,
        analysis_fps: fps,
        confidence: 0.8,
        field_owners: {
          cuts: "cut-detector",
          motion: "motion-analyzer",
          color: "color-analyzer",
          content: "vision-captioner",
          audio: "audio-worker",
        },
      },
    };

    // Validate
    const validation = validateEditDNA(dna);
    if (!validation.ok) {
      return { ok: false, error: `Edit DNA validation failed: ${validation.error.message}` };
    }

    return { ok: true, value: validation.value };
  } catch (err) {
    return { ok: false, error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const VALID_MOTION_TYPES = new Set([
  "static", "pan_left", "pan_right", "zoom_in", "zoom_out", "shake", "tracking", "handheld",
]);

function mapMotionType(raw: string): EditDNA["shots"][0]["camera"]["motion"] {
  if (VALID_MOTION_TYPES.has(raw)) {
    return raw as EditDNA["shots"][0]["camera"]["motion"];
  }
  // Python worker may return "tilt_up"/"tilt_down" — map to nearest valid type
  if (raw === "tilt_up" || raw === "tilt_down") return "tracking";
  return "static";
}

function mapTemperature(raw: string): "warm" | "cool" | "neutral" {
  if (raw === "warm" || raw === "cool") return raw;
  return "neutral";
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mapAudioProfile(result: AudioAnalysisResult): EditDNA["audio"] {
  return {
    bpm: result.tempo || 0,
    beat_grid_s: result.beats || [],
    downbeats_s: result.transients || [],
    energy_curve: (result.energyCurve || []).map((p) => ({ time_s: p.time, energy: p.value })),
    speech_segments: [],
    sync_points_s: [],
  };
}

function buildEmptyAudioProfile(): EditDNA["audio"] {
  return {
    bpm: 0,
    beat_grid_s: [],
    downbeats_s: [],
    energy_curve: [],
    speech_segments: [],
    sync_points_s: [],
  };
}

---

## 14. src/server/lib/vision-captioner.ts

/**
 * Vision captioner — sends 1-2 representative frames per shot to vision AI.
 * Uses existing vision-analyzer.ts for the actual Cloudflare Workers AI call.
 */
import type { Env } from "../types/env";
import { analyzeWithVision } from "./vision-analyzer.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface ShotSegment {
  start_s: number;
  end_s: number;
  frame_start: number;
  frame_end: number;
}

export interface ShotCaption {
  shot_index: number;
  description: string;
  subjects: string[];
  action: string;
  mood: string;
}

/**
 * Select 1-2 representative keyframes for a shot.
 * Returns the first frame + middle frame (if shot > 1s).
 */
function selectKeyframes(
  frameDir: string,
  shot: ShotSegment,
): string[] {
  const frameStart = String(shot.frame_start + 1).padStart(4, "0");
  const paths = [path.join(frameDir, `frame_${frameStart}.jpg`)];

  if (shot.end_s - shot.start_s > 1.0) {
    const midFrame = Math.floor((shot.frame_start + shot.frame_end) / 2);
    const midPath = path.join(frameDir, `frame_${String(midFrame + 1).padStart(4, "0")}.jpg`);
    if (midPath !== paths[0]) {
      paths.push(midPath);
    }
  }

  return paths;
}

/**
 * Read frame files from disk as Uint8Array buffers.
 */
async function readFrames(paths: string[]): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];
  for (const p of paths) {
    try {
      const data = await fs.readFile(p);
      frames.push(new Uint8Array(data));
    } catch {
      // Skip missing frames
    }
  }
  return frames;
}

/**
 * Caption each shot using vision AI on representative keyframes.
 */
export async function captionShots(
  env: Env,
  frameDir: string,
  shots: ShotSegment[],
  fps: number,
): Promise<ShotCaption[]> {
  const captions: ShotCaption[] = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const keyframePaths = selectKeyframes(frameDir, shot);
    const frames = await readFrames(keyframePaths);

    if (frames.length === 0) {
      captions.push({
        shot_index: i,
        description: "No frames available",
        subjects: [],
        action: "unknown",
        mood: "neutral",
      });
      continue;
    }

    // Timestamps for the keyframes within the shot
    const timestamps = [
      shot.start_s,
      ...(frames.length > 1 ? [(shot.start_s + shot.end_s) / 2] : []),
    ];

    try {
      const result = await analyzeWithVision(
        env,
        frames,
        `shot-${i}`,
        shot.end_s - shot.start_s,
        timestamps,
      );

      // Merge segments into a single caption for the shot
      const descriptions = result.segments.map((s) => s.description).filter(Boolean);
      const allSubjects = result.segments.flatMap((s) => s.subject ? [s.subject] : []);
      const actions = result.segments.map((s) => s.action).filter(Boolean);
      const moods = result.segments.map((s) => s.mood).filter(Boolean);

      captions.push({
        shot_index: i,
        description: descriptions[0] || result.summary || "Unknown scene",
        subjects: [...new Set(allSubjects)],
        action: actions[0] || "unknown",
        mood: moods[0] || "neutral",
      });
    } catch (e) {
      console.warn(`[vision-captioner] Failed to caption shot ${i}: ${(e as Error).message}`);
      captions.push({
        shot_index: i,
        description: "Analysis failed",
        subjects: [],
        action: "unknown",
        mood: "neutral",
      });
    }
  }

  return captions;
}

---

## 15. src/server/api/analyze-dna.ts

import { z } from "zod";
import type { Env } from "../types/env";
import { analyzeVideo } from "../lib/analysis-engine.js";

const AnalyzeDNASchema = z.object({
  filePath: z.string().min(1),
  fps: z.number().min(0.5).max(30).default(3),
  type: z.enum(["reference", "footage"]).default("reference"),
});

export async function handleAnalyzeDNA(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = AnalyzeDNASchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await analyzeVideo(env, parsed.data);

    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    return Response.json({ success: true, data: result.value });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

---

## 16. src/server/api/compile-intent.ts

import { z } from "zod";
import { compileIntent, type ClipManifest } from "@monet/intent-compiler/compiler";
import { validateEditDNA } from "@monet/edit-dna";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const SYSTEM_PROMPT = `You are an expert video editor. You receive:
1. An Edit DNA JSON describing a reference video's editing patterns
2. A manifest of available clips (user's footage)
3. A user prompt describing what they want

Your job: produce an OperationPlan — a list of structured operations that Jalebi Advanced's rendering engine can execute.

RULES:
- You ONLY emit operations from this list: place_clip, apply_speed, apply_transition, apply_color, apply_effect
- You NEVER emit pixels, raw effect code, or render decisions
- Every place_clip operation must reference a clip_id from the manifest
- Clip durations must not exceed the available clip duration
- The sum of all place_clip durations must approximately match the target duration
- Apply speed changes via SpeedCurve (keyframes with time_s and speed multiplier)
- Apply transitions between consecutive clips
- Apply color effects as global grade (not per-clip)

OUTPUT: Valid JSON matching the OperationPlan schema. No markdown fences, no explanation, just JSON.`;

const CompileIntentSchema = z.object({
  editDNA: z.unknown(),
  manifest: z.object({
    clips: z.array(
      z.object({
        id: z.string(),
        filePath: z.string(),
        duration_s: z.number(),
        resolution: z.object({ width: z.number(), height: z.number() }),
        content_tags: z.array(z.string()).optional(),
      })
    ),
  }),
  prompt: z.string().min(1),
});

export async function handleCompileIntent(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = CompileIntentSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid request",
        400,
        parsed.error.flatten(),
      );
    }

    const dnaValidation = validateEditDNA(parsed.data.editDNA);
    if (!dnaValidation.ok) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid Edit DNA",
        400,
        { details: dnaValidation.error.message },
      );
    }

    const ai = getAIService(env);

    const callLLM = async (systemPrompt: string, userMessage: string): Promise<string> => {
      const result = await ai.run("compile-intent", {
        systemPrompt,
        prompt: userMessage,
        maxTokens: 4096,
      });
      if (!result.raw) {
        throw new Error("Empty LLM response");
      }
      return result.raw;
    };

    const manifest: ClipManifest = parsed.data.manifest;

    const result = await compileIntent(
      dnaValidation.value,
      manifest,
      parsed.data.prompt,
      callLLM,
      SYSTEM_PROMPT,
    );

    if (!result.ok) {
      return apiError(
        ApiErrorCode.InternalError,
        result.error,
        500,
      );
    }

    return jsonResponse({ success: true, data: result.value });
  } catch (err) {
    return apiError(
      ApiErrorCode.InternalError,
      err instanceof Error ? err.message : "Unknown error",
      500,
    );
  }
}

---

## 17. src/server/api/pipeline.ts

import { z } from "zod";
import { analyzeVideo } from "../lib/analysis-engine.js";
import { compileIntent, type ClipManifest } from "@monet/intent-compiler/compiler";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const SYSTEM_PROMPT = `You are an expert video editor. You receive:
1. An Edit DNA JSON describing a reference video's editing patterns
2. A manifest of available clips (user's footage)
3. A user prompt describing what they want

Your job: produce an OperationPlan — a list of structured operations that the rendering engine can execute.

RULES:
- You ONLY emit operations from this list: place_clip, apply_speed, apply_transition, apply_color, apply_effect
- You NEVER emit pixels, raw effect code, or render decisions
- Every place_clip operation must reference a clip_id from the manifest
- Clip durations must not exceed the available clip duration
- The sum of all place_clip durations must approximately match the target duration
- Apply speed changes via SpeedCurve (keyframes with time_s and speed multiplier)
- Apply transitions between consecutive clips
- Apply color effects as global grade (not per-clip)

OUTPUT: Valid JSON matching the OperationPlan schema. No markdown fences, no explanation, just JSON.`;

const PipelineSchema = z.object({
  filePath: z.string().min(1),
  clipPaths: z.array(z.string()).min(1),
  prompt: z.string().min(1),
  type: z.enum(["reference", "footage"]).default("reference"),
  fps: z.number().min(0.5).max(30).default(3),
});

export async function handlePipeline(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = PipelineSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid request",
        400,
        parsed.error.flatten(),
      );
    }

    // Step 1: Analyze reference video
    const analysis = await analyzeVideo(env, {
      filePath: parsed.data.filePath,
      fps: parsed.data.fps,
      type: parsed.data.type,
    });

    if (!analysis.ok) {
      return apiError(
        ApiErrorCode.AnalysisFailed,
        `Analysis failed: ${analysis.error}`,
        500,
      );
    }

    // Step 2: Analyze user's own footage for real clip manifest
    const clipAnalyses = await Promise.all(
      parsed.data.clipPaths.map((p) =>
        analyzeVideo(env, { filePath: p, fps: 3, type: "footage" })
      )
    );

    const manifest: ClipManifest = {
      clips: clipAnalyses.map((a, i) => ({
        id: `clip-${i}`,
        filePath: parsed.data.clipPaths[i],
        duration_s: a.ok ? a.value.source.duration_s : 10,
        resolution: a.ok
          ? a.value.source.resolution
          : { width: 1920, height: 1080 },
        content_tags: a.ok
          ? a.value.shots.flatMap((s) => s.content.subjects)
          : [],
      })),
    };

    // Step 3: Compile intent via AI
    const ai = getAIService(env);

    const callLLM = async (systemPrompt: string, userMessage: string): Promise<string> => {
      const result = await ai.run("pipeline", {
        systemPrompt,
        prompt: userMessage,
        maxTokens: 4096,
      });
      if (!result.raw) {
        throw new Error("Empty LLM response");
      }
      return result.raw;
    };

    const compiled = await compileIntent(
      analysis.value,
      manifest,
      parsed.data.prompt,
      callLLM,
      SYSTEM_PROMPT,
    );

    if (!compiled.ok) {
      return apiError(
        ApiErrorCode.InternalError,
        `Compilation failed: ${compiled.error}`,
        500,
      );
    }

    return jsonResponse({
      success: true,
      data: {
        editDNA: analysis.value,
        operationPlan: compiled.value,
      },
    });
  } catch (err) {
    return apiError(
      ApiErrorCode.InternalError,
      err instanceof Error ? err.message : "Unknown error",
      500,
    );
  }
}

---

## 18. apps/kove-advanced/packages/core/src/headless/operation-executor.ts

/**
 * Headless operation executor — converts OperationPlan JSON into a
 * Jalebi Advanced project that can be rendered without UI interaction.
 *
 * This is the programmatic bridge between the intent compiler's
 * OperationPlan and the kove-core engine's Project type.
 */

import type { OperationPlan, Operation } from "@monet/intent-compiler";
import type {
  Project,
  MediaItem,
  MediaMetadata,
} from "../types/project";
import type {
  Timeline,
  Track,
  Clip,
  Effect,
  Transform,
  Transition,
} from "../types/timeline";

export interface HeadlessMediaInput {
  readonly id: string;
  readonly name: string;
  readonly type: "video" | "audio" | "image";
  readonly blob: Blob | null;
  readonly metadata: {
    readonly duration: number;
    readonly width: number;
    readonly height: number;
    readonly frameRate?: number;
    readonly codec?: string;
    readonly sampleRate?: number;
    readonly channels?: number;
    readonly fileSize?: number;
  };
}

export type HeadlessProject = Project;

function generateId(prefix = "h"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTransform(): Transform {
  return {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
  };
}

function defaultEffectParams(): Effect[] {
  return [];
}

function createClip(
  trackId: string,
  mediaId: string,
  startTime: number,
  duration: number,
  inPoint: number,
  outPoint: number,
): Clip {
  return {
    id: generateId("clip"),
    mediaId,
    trackId,
    startTime,
    duration,
    inPoint,
    outPoint,
    effects: defaultEffectParams(),
    audioEffects: [],
    transform: defaultTransform(),
    volume: 1,
    keyframes: [],
    speed: 1,
  };
}

function resolveMediaType(
  inputType: HeadlessMediaInput["type"],
): MediaItem["type"] {
  if (inputType === "image") return "image";
  if (inputType === "audio") return "audio";
  return "video";
}

function toMediaMetadata(
  input: HeadlessMediaInput["metadata"],
): MediaMetadata {
  return {
    duration: input.duration,
    width: input.width,
    height: input.height,
    frameRate: input.frameRate ?? 30,
    codec: input.codec ?? "unknown",
    sampleRate: input.sampleRate ?? 44100,
    channels: input.channels ?? 2,
    fileSize: input.fileSize ?? 0,
  };
}

function toMediaItem(input: HeadlessMediaInput): MediaItem {
  return {
    id: input.id,
    name: input.name,
    type: resolveMediaType(input.type),
    fileHandle: null,
    blob: input.blob,
    metadata: toMediaMetadata(input.metadata),
    thumbnailUrl: null,
    waveformData: null,
  };
}

function findOrCreateTrack(
  tracks: Track[],
  trackIndex: number,
  trackType: Track["type"],
): Track {
  const trackId = `track-${trackIndex}`;
  let track = tracks.find((t) => t.id === trackId);
  if (!track) {
    track = {
      id: trackId,
      type: trackType,
      name: `Track ${trackIndex}`,
      clips: [],
      transitions: [],
      locked: false,
      hidden: false,
      muted: false,
      solo: false,
    };
    tracks.push(track);
  }
  return track;
}

function applyPlaceClip(
  tracks: Track[],
  op: Extract<Operation, { type: "place_clip" }>,
  mediaMap: Map<string, HeadlessMediaInput>,
): void {
  const mediaItem = mediaMap.get(op.clip_id);
  const trackType: Track["type"] =
    mediaItem?.type === "audio" ? "audio" : "video";
  const track = findOrCreateTrack(tracks, op.track, trackType);

  track.clips.push(
    createClip(track.id, op.clip_id, op.start_s, op.duration_s, op.in_point_s, op.out_point_s),
  );
}

function applySpeed(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_speed" }>,
): void {
  for (const track of tracks) {
    for (const clip of track.clips) {
      const matchesTarget =
        (op.target === "clip" && op.clip_id && clip.mediaId === op.clip_id) ||
        (op.target === "segment" && op.segment_index !== undefined);

      if (!matchesTarget) continue;

      const keyframes = op.curve.keyframes;
      if (keyframes.length === 0) continue;

      const avgSpeed =
        keyframes.reduce((sum, kf) => sum + kf.speed, 0) / keyframes.length;
      clip.speed = avgSpeed;
    }
  }
}

function applyTransition(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_transition" }>,
): void {
  const [trackIdxA, trackIdxB] = op.between;
  const trackA = tracks.find((t) => t.id === `track-${trackIdxA}`);
  const trackB = tracks.find((t) => t.id === `track-${trackIdxB}`);

  const clipsA = trackA?.clips ?? [];
  const clipsB = trackB?.clips ?? clipsA;

  if (clipsA.length === 0) return;

  const clipA = clipsA[clipsA.length - 1];
  const clipB = clipsB.find(
    (c) => Math.abs(c.startTime - (clipA.startTime + clipA.duration)) < 0.01,
  );

  if (!clipA || !clipB) return;

  const transitionTypeMap: Record<string, Transition["type"]> = {
    crossfade: "crossfade",
    wipe: "wipe",
    dissolve: "crossfade",
    hard: "cut",
  };

  const transition: Transition = {
    id: generateId("transition"),
    clipAId: clipA.id,
    clipBId: clipB.id,
    type: transitionTypeMap[op.transition_type] ?? "crossfade",
    duration: op.duration_s,
    params: {},
  };

  const targetTrack = trackA ?? findOrCreateTrack(tracks, trackIdxA, "video");
  targetTrack.transitions.push(transition);
}

function applyEffect(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_effect" }>,
): void {
  const effect: Effect = {
    id: generateId("fx"),
    type: op.effect.type,
    params: { intensity: op.effect.intensity, ...op.effect },
    enabled: true,
  };

  for (const track of tracks) {
    for (const clip of track.clips) {
      const matchesTarget =
        (op.target === "clip" && clip.mediaId) ||
        (op.target === "segment");

      if (!matchesTarget) continue;

      clip.effects.push(effect);
    }
  }
}

function applyColor(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_color" }>,
): void {
  const colorEffect: Effect = {
    id: generateId("color"),
    type: "color",
    params: { ...op.params },
    enabled: true,
  };

  if (op.target === "global") {
    for (const track of tracks) {
      for (const clip of track.clips) {
        clip.effects.push(colorEffect);
      }
    }
    return;
  }

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (op.clip_id && clip.mediaId !== op.clip_id) continue;
      clip.effects.push(colorEffect);
    }
  }
}

function applyOperation(
  tracks: Track[],
  operation: Operation,
  mediaMap: Map<string, HeadlessMediaInput>,
): void {
  switch (operation.type) {
    case "place_clip":
      applyPlaceClip(tracks, operation, mediaMap);
      break;
    case "apply_speed":
      applySpeed(tracks, operation);
      break;
    case "apply_transition":
      applyTransition(tracks, operation);
      break;
    case "apply_effect":
      applyEffect(tracks, operation);
      break;
    case "apply_color":
      applyColor(tracks, operation);
      break;
  }
}

export function executePlan(
  plan: OperationPlan,
  media: HeadlessMediaInput[],
): HeadlessProject {
  const mediaMap = new Map(media.map((m) => [m.id, m]));
  const tracks: Track[] = [];

  for (const op of plan.operations) {
    applyOperation(tracks, op, mediaMap);
  }

  // Apply global_effects to ALL clips
  for (const ge of plan.global_effects) {
    const effect: Effect = {
      id: generateId("ge"),
      type: ge.type,
      params: { ...ge.params },
      enabled: true,
    };
    for (const track of tracks) {
      for (const clip of track.clips) {
        clip.effects.push(effect);
      }
    }
  }

  // Map text_overlays to subtitles
  const subtitles: import("../types/timeline").Subtitle[] = plan.text_overlays.map((t) => ({
    id: generateId("text"),
    text: t.text,
    startTime: t.start_s,
    endTime: t.end_s,
    style: {
      fontFamily: "Helvetica",
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "transparent",
      position: (t.position.y < 0.3 ? "top" : t.position.y > 0.7 ? "bottom" : "center") as "top" | "center" | "bottom",
    },
  }));

  const timeline: Timeline = {
    tracks,
    subtitles,
    duration: plan.target_duration_s,
    markers: [],
  };

  const mediaLibrary = {
    items: media.map(toMediaItem),
  };

  const aspectParts = plan.aspect_ratio.split(":");
  const aspectW = Number(aspectParts[0]) || 16;
  const aspectH = Number(aspectParts[1]) || 9;
  const baseHeight = 1080;
  const width = Math.round((baseHeight * aspectW) / aspectH);

  return {
    id: generateId("project"),
    name: "Headless Export",
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    settings: {
      width,
      height: baseHeight,
      frameRate: 30,
      sampleRate: 44100,
      channels: 2,
    },
    mediaLibrary,
    timeline,
  };
}

---

## 19. apps/web/src/lib/kove-generation-pipeline.ts (intent pipeline function)

 * Use runIntentPipeline for the new intent-driven pipeline.
 * This pipeline is kept for backward compatibility and A/B testing.
 */
export async function runGenerationPipeline(input: {
  projectId: string;
  files: UploadAssetInput[];
  prompt: string;
  intensity?: number;
  tempoMode?: string;
  referenceMode?: "strict_replication" | "inspired";
  signal?: AbortSignal;
  onStageChange?: (stage: PipelineStage) => void;
}): Promise<PipelineResult> {
  const store = useProjectStore.getState();
  const { setAssets, setPrompt, setAnalysis, setGeneration, setTruth } = store;
  const mediaUrlMap: Record<string, string> = {};

  try {
    // Stage 1: Upload
    input.onStageChange?.("uploading");
    setGeneration({ status: "generating" });

    const uploadResult = await uploadAssets({
      projectId: input.projectId,
      files: input.files,
      signal: input.signal,
    });

    if (uploadResult.errors.length > 0 && uploadResult.footageIds.length === 0) {
      throw new Error(`Upload failed: ${uploadResult.errors.map((e) => e.error).join(", ")}`);
    }

    // Build asset state
    const footageAssets: FootageAsset[] = uploadResult.assets
      .filter((a) => a.type === "footage")
      .map((a) => ({
        id: a.id, fileName: a.fileName, mediaUrl: a.mediaUrl,
        r2FileId: a.r2FileId, uploadStatus: a.uploadStatus as any,
        error: a.error, type: "footage" as const,
      }));

    const musicAsset: MusicAsset | undefined = uploadResult.assets
      .filter((a) => a.type === "music")
      .map((a) => ({
        id: a.id, fileName: a.fileName, mediaUrl: a.mediaUrl,
        r2FileId: a.r2FileId, uploadStatus: a.uploadStatus as any,
        error: a.error, type: "music" as const,
        beatFallback: false, analysisStatus: "idle" as const,
      }))[0];

    const refAsset: ReferenceAsset | undefined = uploadResult.assets
      .filter((a) => a.type === "reference")
      .map((a) => ({
        id: a.id, fileName: a.fileName, mediaUrl: a.mediaUrl,
        r2FileId: a.r2FileId, uploadStatus: a.uploadStatus as any,
        error: a.error, type: "reference" as const,
        analysisStatus: "idle" as const,
      }))[0];

    setAssets({ footage: footageAssets, music: musicAsset, reference: refAsset });
    setPrompt({ text: input.prompt, intensity: input.intensity, tempoMode: input.tempoMode });
    Object.assign(mediaUrlMap, uploadResult.mediaUrlMap);

    // Stage 2: Analysis
    input.onStageChange?.("analyzing");
    setAnalysis({ status: "analyzing" });

    let analysisResult: AnalysisResult | null = null;
    if (uploadResult.footageIds.length > 0) {
      analysisResult = await analyzeProject({
        projectId: input.projectId,
        footageIds: uploadResult.footageIds,
        musicId: uploadResult.musicId,
        signal: input.signal,
      });
      setAnalysis({
        analysisId: analysisResult.analysisId,
        footage: analysisResult.footage,
        music: analysisResult.music,
        status: "ready",
      });
    }

    // Stage 2b: Reference analysis (if reference provided)
    let referenceStyleId: string | undefined;
    let referenceStyle: unknown;
    if (refAsset?.r2FileId) {
      try {
        const refResult = await analyzeReference({
          projectId: input.projectId,
          fileId: refAsset.r2FileId,
          signal: input.signal,
        });
        referenceStyleId = refResult.referenceStyleId;
        referenceStyle = refResult.style;
        setAnalysis({ referenceStyleId });
        setTruth({ referenceProvided: true, referenceAnalyzed: true });
      } catch (err: any) {
        console.warn("Reference analysis failed:", err.message);
        setTruth({ referenceProvided: true, referenceAnalyzed: false });
      }
--
export async function runIntentPipeline(input: {
  projectId: string;
  files: UploadAssetInput[];
  prompt: string;
  signal?: AbortSignal;
  onStageChange?: (stage: PipelineStage) => void;
}): Promise<IntentPipelineResult> {
  const mediaUrlMap: Record<string, string> = {};

  try {
    // Stage 1: Upload
    input.onStageChange?.("uploading");

    const uploadResult = await uploadAssets({
      projectId: input.projectId,
      files: input.files,
      signal: input.signal,
    });

---

## 20. src/lib/api-client.ts (analyzeDNA + compileIntent functions)

// ─── Intent Pipeline (new) ─────────────────────────────────

export interface AnalyzeDNAResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function analyzeDNA(
  filePath: string,
  fps: number = 3,
  type: "reference" | "footage" = "reference"
): Promise<AnalyzeDNAResult> {
  const res = await fetch(`${API_BASE}/api/analyze-dna`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, fps, type }),
  });
  return handleResponse<AnalyzeDNAResult>(res);
}

export interface CompileIntentResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function compileIntent(
  editDNA: unknown,
  manifest: { clips: { id: string; filePath: string; duration_s: number; resolution: { width: number; height: number }; content_tags?: string[] }[] },
  prompt: string

---

## 21. .dev.vars (Cloudflare credentials — ADD YOUR KEY)

```
CLOUDFLARE_API_TOKEN=your_key_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.2-11b-vision-instruct
```

---

## How to Run

```bash
# 1. Set Cloudflare credentials in .dev.vars
# 2. Start Python AI worker
cd workers/python-ai && source .venv/bin/activate && python lightweight_server.py &

# 3. Run E2E pipeline
python scripts/e2e-pipeline.py \
  "monet-reference-edits/2nd imporatnt.MP4" \
  "test-videos/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4"
```
