#!/usr/bin/env python3
"""
analysis_visualizer.py — Burn-in QA renderer for analyzer output.

Consumes existing analyzer JSON schemas and composites overlay layers
onto the source video for visual validation.

Usage:
    python scripts/analysis_visualizer.py <video> <analysis.json> [options]

Options:
    --output PATH        Output video path (default: <video>-analyzed.mp4)
    --only LAYERS        Comma-separated layer names (default: all)
    --no-audio           Skip audio mux (output will be silent)
    --fps FPS            Output frame rate (default: video native)

Layer names: motion, beats, events, effects, ocr, color, semantic, shot_info
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
from typing import Any, Optional

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Layer registry
# ---------------------------------------------------------------------------

LAYERS: dict[str, tuple[str, str, bool]] = {
    "shot_info":  ("shot_info",  "Top-left: shot type, camera/subject motion", True),
    "events":     ("events",     "Event flash banners for transitions/speed ramps", True),
    "effects":    ("effects",    "Effect badges overlaid on frame", True),
    "ocr":        ("ocr",        "OCR bounding boxes + recognized text", True),
    "beats":      ("beats",      "Bottom scrolling beat timeline + motion waveform", True),
    "color":      ("color",      "Corner palette strip + temperature label", True),
    "semantic":   ("semantic",   "Bottom-third semantic caption", True),
}

# Colors (BGR for OpenCV)
COLOR_CUT = (0, 255, 255)       # yellow
COLOR_FADE = (255, 255, 0)      # cyan
COLOR_WHIP = (0, 165, 255)      # orange
COLOR_EFFECT = (0, 255, 0)      # green
COLOR_TEXT = (255, 255, 255)     # white
COLOR_BEAT = (255, 0, 255)      # magenta
COLOR_SEMANTIC = (200, 200, 200) # light gray


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyzer QA visualizer")
    parser.add_argument("video", help="Source video path")
    parser.add_argument("analysis", help="Analysis JSON path")
    parser.add_argument("--output", default=None, help="Output video path")
    parser.add_argument("--only", default=None,
                        help="Comma-separated layer names (default: all)")
    parser.add_argument("--no-audio", action="store_true", help="Skip audio mux")
    parser.add_argument("--fps", type=float, default=None, help="Output frame rate")
    return parser.parse_args()


def load_analysis(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def _parse_time_range(time_str: str) -> tuple[float, float]:
    """Parse '0.0-0.5s' -> (0.0, 0.5)."""
    parts = time_str.replace("s", "").split("-")
    if len(parts) == 2:
        return float(parts[0]), float(parts[1])
    return 0.0, 0.0


def build_timeline(analysis: dict, fps: float, duration: float) -> dict:
    """
    Build a unified frame-indexed timeline from all analyzer outputs.
    Pipeline output schema: perShot array with embedded transition/color/effects.
    """
    total_frames = int(duration * fps)
    timeline: dict[int, list[dict]] = {i: [] for i in range(total_frames)}
    per_shot = analysis.get("shots", [])

    # Shots
    for i, shot in enumerate(per_shot):
        start_t, end_t = _parse_time_range(shot.get("time", "0.0-0.0s"))
        dur = shot.get("duration", end_t - start_t)
        if dur <= 0:
            dur = 0.1
        start_frame = int(start_t * fps)
        end_frame = int((start_t + dur) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": "shot",
                "shot_index": i,
                "shot_type": shot.get("type", "medium"),
                "motion": shot.get("motion", 0),
                "color": shot.get("color", {}),
                "speed_direction": shot.get("speed_direction", {}),
            })

    # Transitions embedded in perShot
    for shot in per_shot:
        trans = shot.get("transition")
        if not trans:
            continue
        t_time = trans.get("time", 0)
        if isinstance(t_time, str):
            t_time = float(t_time.replace("s", ""))
        t_type = trans.get("type", "cut")
        t_conf = 0.8
        t_dur = 0.1
        start_frame = int(max(0, (t_time - t_dur / 2)) * fps)
        end_frame = int(min(duration, (t_time + t_dur / 2)) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": "transition",
                "subtype": t_type,
                "confidence": t_conf,
            })

    # Effects per shot
    for shot in per_shot:
        effs = shot.get("effects", [])
        if not effs:
            continue
        start_t, _ = _parse_time_range(shot.get("time", "0.0-0.0s"))
        eff_frame = int(start_t * fps)
        for eff in effs:
            timeline[eff_frame].append({
                "type": "effect",
                "subtype": str(eff),
                "confidence": 0.8,
            })

    # Speed ramps from speed_direction per shot
    for shot in per_shot:
        sd = shot.get("speed_direction", {})
        if sd.get("hasRamp"):
            start_t, _ = _parse_time_range(shot.get("time", "0.0-0.0s"))
            ramp_frame = int(start_t * fps)
            if ramp_frame < total_frames:
                timeline[ramp_frame].append({
                    "type": "transition",
                    "subtype": f"ramp_{sd.get('rampType', '?')}",
                    "confidence": 0.8,
                })

    # Beats from standard.audio
    audio_data = analysis.get("standard", {}).get("audio") or {}
    bpm = audio_data.get("bpm", 0)
    if bpm > 0:
        beat_interval = 60.0 / bpm
        for bi in range(int(duration / beat_interval) + 1):
            beat_time = bi * beat_interval
            beat_frame = int(beat_time * fps)
            if beat_frame < total_frames:
                timeline[beat_frame].append({
                    "type": "beat",
                    "strength": 0.5,
                })

    return timeline


# ---------------------------------------------------------------------------
# Overlay renderers (each takes a frame + active events, returns modified frame)
# ---------------------------------------------------------------------------

def render_shot_info(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Top-left corner: current shot type, motion, color grade, ramp/reverse."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    color = shot.get("color", {})
    sd = shot.get("speed_direction", {})
    lines = [
        f"Shot: {shot.get('shot_type', '?')}",
        f"Motion: {shot.get('motion', 0):.2f}",
        f"Grade: {color.get('grade', '?')} Temp: {color.get('temperature', '?')}",
    ]
    if sd.get("hasRamp"):
        rt = sd.get("rampType") or "?"
        lines.append(f"RAMP: {rt}")
    if sd.get("isReverse"):
        rc = sd.get("reverseConfidence", 0)
        lines.append(f"REVERSE (conf={rc:.0%})")
    y_offset = 20
    for line in lines:
        cv2.putText(frame, line, (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_CUT, 1, cv2.LINE_AA)
        y_offset += 20
    return frame


def render_events(frame: np.ndarray, events: list[dict], frame_idx: int, fps: float) -> np.ndarray:
    """Banner overlay for transitions/speed ramps."""
    h, w = frame.shape[:2]
    for ev in events:
        if ev["type"] not in ("transition", "keyframe", "speed_ramp"):
            continue
        subtype = ev.get("subtype", "EVENT")
        conf = ev.get("confidence", 0.5)
        color = {
            "cut": COLOR_CUT,
            "fade_to_black": COLOR_FADE,
            "fade_from_black": COLOR_FADE,
            "whip_pan": COLOR_WHIP,
            "fade_in": COLOR_FADE,
            "fade_out": COLOR_FADE,
        }.get(subtype, COLOR_CUT)

        label = f"{subtype.upper()} ({conf:.0%})"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        x = (w - tw) // 2
        y = h // 3
        # Background rectangle
        cv2.rectangle(frame, (x - 10, y - th - 10),
                      (x + tw + 10, y + 10), color, -1)
        cv2.putText(frame, label, (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2, cv2.LINE_AA)
    return frame


def render_effects(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Effect badges in top-right corner."""
    h, w = frame.shape[:2]
    effects = [e for e in events if e["type"] == "effect"]
    if not effects:
        return frame
    y_offset = 20
    for eff in effects:
        label = eff.get("subtype", "FX")
        conf = eff.get("confidence", 0)
        color = COLOR_EFFECT if conf > 0.7 else (0, 165, 255)
        cv2.putText(frame, f"[{label}]", (w - 150, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
        y_offset += 20
    return frame


def render_beats(frame: np.ndarray, events: list[dict], frame_idx: int,
                 fps: float, motion_curve: Optional[list] = None) -> np.ndarray:
    """Bottom scrolling beat timeline + motion waveform."""
    h, w = frame.shape[:2]
    strip_h = 30
    strip_y = h - strip_h - 10

    # Background strip
    cv2.rectangle(frame, (0, strip_y), (w, strip_y + strip_h), (30, 30, 30), -1)

    # Beats as ticks
    for ev in events:
        if ev["type"] != "beat":
            continue
        # Map beat time to x position (scroll relative to current frame)
        # For simplicity, draw in a window around current position
        beat_strength = ev.get("strength", 0.5)
        color = (0, int(255 * beat_strength), 255)
        # Draw at center since we don't know exact time position without full timeline
        cv2.line(frame, (w // 2, strip_y), (w // 2, strip_y + strip_h), COLOR_BEAT, 2)
        cv2.putText(frame, "\u266a", (w // 2 - 5, strip_y + strip_h - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_BEAT, 1)

    # Motion waveform at bottom (use motion curve from shot data)
    if motion_curve:
        pass  # Full waveform rendering deferred

    return frame


def render_color_swatch(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Corner color grade swatch + saturation + temperature."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    color_data = shot.get("color", {})
    grade = color_data.get("grade", "?")
    temp = color_data.get("temperature", "?")
    sat = color_data.get("saturation", 0)
    bw = color_data.get("isBw", False)

    h, w = frame.shape[:2]
    swatch_x = w - 80
    swatch_y = 10

    grade_colors = {
        "vibrant": (0, 215, 255),
        "dark": (50, 50, 50),
        "bw": (200, 200, 200),
        "muted": (150, 150, 100),
        "normal": (100, 180, 200),
    }
    color_bgr = grade_colors.get(grade, (100, 100, 100))
    cv2.rectangle(frame, (swatch_x, swatch_y),
                  (swatch_x + 70, swatch_y + 20), color_bgr, -1)
    cv2.putText(frame, grade.upper(), (swatch_x + 5, swatch_y + 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0) if not bw else (0, 0, 0), 1)

    cv2.putText(frame, f"Temp: {temp}", (swatch_x, swatch_y + 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    cv2.putText(frame, f"Sat: {sat:.0f}", (swatch_x, swatch_y + 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    return frame


def render_semantic(frame: np.ndarray, events: list[dict],
                    semantic_data: Optional[list] = None) -> np.ndarray:
    """Bottom-third: speed direction + shot info."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    shot_idx = shot.get("shot_index", 0)
    h, w = frame.shape[:2]
    lines = []
    transition = next((e for e in events if e["type"] == "transition"), None)
    if transition:
        lines.append(f"Trans: {transition.get('subtype', '?')}")
    if lines:
        y = h - 40
        for line in lines:
            cv2.putText(frame, line, (10, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_SEMANTIC, 1, cv2.LINE_AA)
            y -= 20
    return frame


def render_ocr(frame: np.ndarray, events: list[dict],
               ocr_data: Optional[list] = None) -> np.ndarray:
    """OCR: shot text indicator."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    h, w = frame.shape[:2]
    cv2.putText(frame, "[OCR]", (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_TEXT, 1, cv2.LINE_AA)
    return frame


# ---------------------------------------------------------------------------
# Main renderer
# ---------------------------------------------------------------------------

def render_analysis(video_path: str, analysis: dict, output_path: str,
                    active_layers: set[str], fps: Optional[float] = None,
                    no_audio: bool = False) -> str:
    """Render overlay video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    out_fps = fps or src_fps
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / src_fps
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    timeline = build_timeline(analysis, out_fps, duration)
    semantic_data = analysis.get("standard", {}).get("shotTypes", {}).get("totalShots", 0)
    ocr_data = analysis.get("standard", {}).get("text", {})
    motion_curve = None

    # Render frames to temp directory as PNGs
    tmpdir = tempfile.mkdtemp(prefix="qa_frames_")
    print(f"Rendering {total_frames} frames ({duration:.1f}s @ {out_fps}fps)...")
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        events = timeline.get(frame_idx, [])

        if "shot_info" in active_layers:
            frame = render_shot_info(frame, events)
        if "events" in active_layers:
            frame = render_events(frame, events, frame_idx, out_fps)
        if "effects" in active_layers:
            frame = render_effects(frame, events)
        if "beats" in active_layers:
            frame = render_beats(frame, events, frame_idx, out_fps, motion_curve)
        if "color" in active_layers:
            frame = render_color_swatch(frame, events)
        if "semantic" in active_layers and semantic_data:
            frame = render_semantic(frame, events, semantic_data)
        if "ocr" in active_layers and ocr_data:
            frame = render_ocr(frame, events, ocr_data)

        frame_path = os.path.join(tmpdir, f"frame_{frame_idx:06d}.png")
        cv2.imwrite(frame_path, frame)
        frame_idx += 1

        if frame_idx % 300 == 0:
            pct = frame_idx / max(1, total_frames) * 100
            print(f"  {pct:.0f}% ({frame_idx}/{total_frames})")

    cap.release()

    # Encode frames to video via ffmpeg
    pattern = os.path.join(tmpdir, "frame_%06d.png")
    # Encode video
    video_only = output_path + ".video.mp4"
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-framerate", str(out_fps),
        "-i", pattern,
        "-c:v", "h264_videotoolbox",
        "-pix_fmt", "yuv420p",
        "-b:v", "8M",
        video_only,
    ]
    result = subprocess.run(ffmpeg_cmd, capture_output=True, timeout=600)
    if result.returncode != 0:
        err = result.stderr.decode() if result.stderr else "unknown"
        print(f"ffmpeg encode error: {err[:500]}")

    # Mux audio if available
    if not no_audio and os.path.exists(video_only):
        mux_cmd = [
            "ffmpeg", "-y",
            "-i", video_only,
            "-i", video_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            output_path,
        ]
        subprocess.run(mux_cmd, capture_output=True, timeout=120)
        os.remove(video_only)
        print("  Audio muxed")
    elif os.path.exists(video_only):
        os.rename(video_only, output_path)

    # Cleanup frames
    for f in glob.glob(os.path.join(tmpdir, "*.png")):
        os.remove(f)
    os.rmdir(tmpdir)

    print(f"  Output: {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    analysis = load_analysis(args.analysis)

    if args.only:
        active_layers = set(args.only.split(","))
        unknown = active_layers - set(LAYERS.keys())
        if unknown:
            print(f"Unknown layers: {unknown}. Available: {list(LAYERS.keys())}")
            sys.exit(1)
    else:
        active_layers = set(LAYERS.keys())

    print(f"Active layers: {', '.join(sorted(active_layers))}")

    output = args.output or os.path.splitext(args.video)[0] + "-analyzed.mp4"
    render_analysis(args.video, analysis, output, active_layers,
                    fps=args.fps, no_audio=args.no_audio)


if __name__ == "__main__":
    main()
