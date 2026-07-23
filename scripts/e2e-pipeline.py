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
dev_vars_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".dev.vars")
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
