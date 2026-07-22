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
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Jalebi Analysis Server", version="1.0.0")


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
