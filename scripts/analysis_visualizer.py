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


def build_timeline(analysis: dict, fps: float, duration: float) -> dict:
    """
    Build a unified frame-indexed timeline from all analyzer outputs.
    Returns dict mapping frame_number -> list of active events at that frame.
    """
    total_frames = int(duration * fps)
    timeline: dict[int, list[dict]] = {i: [] for i in range(total_frames)}

    # Shots
    for i, shot in enumerate(analysis.get("shots", [])):
        start_frame = int(shot.get("start", 0) * fps)
        end_frame = int(shot.get("end", 0) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": "shot",
                "shot_index": i,
                "shot_type": shot.get("type", "medium"),
                "camera_motion": shot.get("camera_motion", "static"),
                "motion": shot.get("motion", 0),
                "color": shot.get("color", {}),
            })

    # Transitions
    for t in analysis.get("edit_events", {}).get("transitions", []):
        t_time = t.get("time", 0)
        t_dur = t.get("duration", 0.1)
        t_type = t.get("type", "cut")
        t_conf = t.get("confidence", 0.8)
        start_frame = int(max(0, (t_time - t_dur / 2)) * fps)
        end_frame = int(min(duration, (t_time + t_dur / 2)) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": "transition",
                "subtype": t_type,
                "confidence": t_conf,
            })

    # Events (flat timeline)
    for ev in analysis.get("edit_events", {}).get("events", []):
        ev_time = ev.get("time", 0)
        ev_dur = ev.get("duration", 0.1)
        ev_type = ev.get("type", "event")
        ev_subtype = ev.get("subtype", "unknown")
        start_frame = int(max(0, (ev_time - ev_dur / 2)) * fps)
        end_frame = int(min(duration, (ev_time + ev_dur / 2)) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": ev_type,
                "subtype": ev_subtype,
                "properties": ev.get("properties", {}),
            })

    # Beats
    for beat in analysis.get("audio", {}).get("beats", []):
        beat_time = beat.get("time", 0)
        beat_frame = int(beat_time * fps)
        if beat_frame < total_frames:
            timeline[beat_frame].append({
                "type": "beat",
                "strength": beat.get("strength", 0.5),
            })

    # Effects
    for effect in analysis.get("effects", []):
        effect_time = effect.get("time", 0)
        effect_type = effect.get("type", "")
        effect_frame = int(effect_time * fps)
        if effect_frame < total_frames:
            timeline[effect_frame].append({
                "type": "effect",
                "subtype": effect_type,
                "confidence": effect.get("confidence", 0.5),
            })

    return timeline


# ---------------------------------------------------------------------------
# Overlay renderers (each takes a frame + active events, returns modified frame)
# ---------------------------------------------------------------------------

def render_shot_info(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Top-left corner: current shot type, camera motion."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    h, w = frame.shape[:2]
    lines = [
        f"Shot: {shot.get('shot_type', '?')}",
        f"Cam: {shot.get('camera_motion', '?')}",
        f"Motion: {shot.get('motion', 0):.2f}",
    ]
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
    """Corner color palette swatch + temperature label."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    color_data = shot.get("color", {})
    palette = color_data.get("dominant_palette", [])
    temp = color_data.get("color_temperature", "?")

    h, w = frame.shape[:2]
    swatch_x = w - 80
    swatch_y = 10
    swatch_w = 70
    swatch_h = 12

    for i, color in enumerate(palette[:5]):
        hex_color = color.get("hex", "#000000")
        try:
            r = int(hex_color[1:3], 16)
            g = int(hex_color[3:5], 16)
            b = int(hex_color[5:7], 16)
        except (ValueError, IndexError):
            r, g, b = 0, 0, 0
        y = swatch_y + i * (swatch_h + 2)
        cv2.rectangle(frame, (swatch_x, y),
                      (swatch_x + swatch_w, y + swatch_h), (b, g, r), -1)

    cv2.putText(frame, f"Temp: {temp}", (swatch_x, swatch_y + 80),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    return frame


def render_semantic(frame: np.ndarray, events: list[dict],
                    semantic_data: Optional[list] = None) -> np.ndarray:
    """Bottom-third semantic caption."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot or not semantic_data:
        return frame
    shot_idx = shot.get("shot_index", 0)
    if shot_idx < len(semantic_data):
        sem = semantic_data[shot_idx]
        desc = sem.get("description", "")
        emotion = sem.get("emotion", "")
        narrative = sem.get("narrative_role", "")
        label = f"{desc} | {emotion} | {narrative}"
        h, w = frame.shape[:2]
        y = h - 80
        cv2.putText(frame, label, (w // 2 - 200, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_SEMANTIC, 1, cv2.LINE_AA)
    return frame


def render_ocr(frame: np.ndarray, events: list[dict],
               ocr_data: Optional[list] = None) -> np.ndarray:
    """OCR bounding boxes + recognized text."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot or not ocr_data:
        return frame
    shot_idx = shot.get("shot_index", 0)
    if shot_idx < len(ocr_data):
        for text_item in ocr_data[shot_idx].get("texts", []):
            bbox = text_item.get("bbox", [])
            text = text_item.get("text", "")
            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                cv2.rectangle(frame, (int(x1), int(y1)),
                              (int(x2), int(y2)), COLOR_TEXT, 2)
                cv2.putText(frame, text, (int(x1), int(y1) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_TEXT, 1)
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

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, out_fps, (width, height))

    timeline = build_timeline(analysis, out_fps, duration)
    semantic_data = analysis.get("semantic_events", [])
    ocr_data = analysis.get("text_results", [])
    motion_curve = None

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

        writer.write(frame)
        frame_idx += 1

        if frame_idx % 300 == 0:
            pct = frame_idx / max(1, total_frames) * 100
            print(f"  {pct:.0f}% ({frame_idx}/{total_frames})")

    cap.release()
    writer.release()

    # Mux audio
    if not no_audio:
        temp_out = output_path + ".tmp.mp4"
        os.rename(output_path, temp_out)
        cmd = [
            "ffmpeg", "-y", "-i", temp_out, "-i", video_path,
            "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0",
            "-shortest", output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=120)
        os.remove(temp_out)
        print(f"  Audio muxed via ffmpeg")

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
