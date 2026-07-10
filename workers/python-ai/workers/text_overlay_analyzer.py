"""
Text Overlay Analyzer — PaddleOCR-based text detection + animation approximation.

Detects text regions in video frames, tracks them across time, and estimates
animation types based on position/scale/opacity changes between frames.

Usage:
    python text_overlay_analyzer.py <video_path>
    Or via subprocess import: from text_overlay_analyzer import analyze_text_overlays
"""

import json
import sys
import os
import subprocess
import tempfile
from pathlib import Path

def extract_frames(video_path: str, output_dir: str, interval: float = 0.1) -> list:
    """Extract frames at regular intervals for text detection."""
    pattern = os.path.join(output_dir, "frame_%06d.jpg")
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval}",
        "-q:v", "3",
        pattern,
        "-y", "-loglevel", "error"
    ]
    subprocess.run(cmd, timeout=60, check=False)
    frames = sorted(Path(output_dir).glob("frame_*.jpg"))
    return [(str(f), i * interval) for i, f in enumerate(frames)]

def classify_font_vibe(bbox_w: float, bbox_h: float, text: str) -> str:
    """Classify font vibe from bounding box and text characteristics."""
    aspect = bbox_w / max(bbox_h, 0.001)
    char_count = len(text)

    if char_count <= 3 and aspect < 3:
        return "bold_sans"
    elif aspect > 6 and char_count > 10:
        return "condensed_sans"
    elif any(c in text for c in ["", "'", "`"]):
        return "serif"
    elif all(c in "0123456789:./-" for c in text):
        return "monospace"
    elif aspect > 2 and bbox_h < 0.03:
        return "handwritten"
    else:
        return "bold_sans"

def classify_position(x: float, y: float, w: float, h: float) -> str:
    """Classify text position from normalized bbox coordinates."""
    center_y = y + h / 2
    if center_y < 0.35:
        return "upper_third"
    elif center_y > 0.65:
        return "lower_third"
    else:
        return "center"

def estimate_animation(prev_bbox: dict, curr_bbox: dict, prev_opacity: float, curr_opacity: float) -> str:
    """Estimate animation type from bbox changes between frames."""
    dx = abs(curr_bbox["x"] - prev_bbox["x"])
    dy = abs(curr_bbox["y"] - prev_bbox["y"])
    dw = abs(curr_bbox["w"] - prev_bbox["w"])
    dh = abs(curr_bbox["h"] - prev_bbox["h"])
    opacity_change = abs(curr_opacity - prev_opacity)

    scale_change = (dw + dh) / max(prev_bbox["w"] + prev_bbox["h"], 0.001)

    if scale_change > 0.3:
        return "pop_scale"
    elif dy > 0.05 and dx < 0.02:
        return "slide_up"
    elif opacity_change > 0.4:
        return "fade_in"
    elif dx > 0.03:
        return "slide_up"
    else:
        return "static_caption"

def analyze_text_overlays(video_path: str) -> dict:
    """
    Main entry point. Detects text overlays in a video and returns
    a structured trace with positions, animations, and font vibes.
    """
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        # Fallback: return empty if PaddleOCR not installed
        return {"overlays": [], "error": "paddleocr not installed"}

    try:
        import cv2
    except ImportError:
        return {"overlays": [], "error": "opencv-python not installed"}

    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

    with tempfile.TemporaryDirectory() as tmp_dir:
        frames = extract_frames(video_path, tmp_dir, interval=0.1)
        if not frames:
            return {"overlays": []}

        cap = cv2.VideoCapture(video_path)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
        cap.release()

        # Track text regions across frames
        active_texts = {}  # text_content -> {first_seen, last_seen, bboxes, positions}
        all_detections = []

        for frame_path, timestamp in frames:
            try:
                result = ocr.ocr(frame_path, cls=True)
                if not result or not result[0]:
                    continue

                for line in result[0]:
                    bbox_points = line[0]
                    text = line[1][0]
                    conf = line[1][1]

                    if conf < 0.5 or len(text.strip()) < 1:
                        continue

                    # Convert polygon to normalized bbox
                    xs = [p[0] for p in bbox_points]
                    ys = [p[1] for p in bbox_points]
                    x_min, x_max = min(xs) / frame_width, max(xs) / frame_width
                    y_min, y_max = min(ys) / frame_height, max(ys) / frame_height
                    w = x_max - x_min
                    h = y_max - y_min

                    bbox_norm = {"x": x_min, "y": y_min, "w": w, "h": h}

                    all_detections.append({
                        "text": text.strip(),
                        "timestamp": timestamp,
                        "bbox": bbox_norm,
                        "confidence": conf,
                    })

                    # Track this text across frames
                    key = text.strip().lower()
                    if key not in active_texts:
                        active_texts[key] = {
                            "text": text.strip(),
                            "first_seen": timestamp,
                            "last_seen": timestamp,
                            "bboxes": [bbox_norm],
                            "timestamps": [timestamp],
                            "confidences": [conf],
                        }
                    else:
                        active_texts[key]["last_seen"] = timestamp
                        active_texts[key]["bboxes"].append(bbox_norm)
                        active_texts[key]["timestamps"].append(timestamp)
                        active_texts[key]["confidences"].append(conf)

            except Exception:
                continue

        # Build overlay traces from tracked texts
        overlays = []
        for key, track in active_texts.items():
            if len(track["bboxes"]) < 2:
                continue

            duration = track["last_seen"] - track["first_seen"]
            if duration < 0.05:
                continue

            # Analyze motion
            bboxes = track["bboxes"]
            first_bbox = bboxes[0]
            last_bbox = bboxes[-1]
            dx = last_bbox["x"] - first_bbox["x"]
            dy = last_bbox["y"] - first_bbox["y"]
            dw = last_bbox["w"] - first_bbox["w"]
            dh = last_bbox["h"] - first_bbox["h"]

            # Estimate animation
            if len(bboxes) >= 3:
                mid_idx = len(bboxes) // 2
                animation = estimate_animation(bboxes[0], bboxes[mid_idx], 1.0, 1.0)
            else:
                animation = "static_caption"

            # Classify position
            avg_x = sum(b["x"] for b in bboxes) / len(bboxes)
            avg_y = sum(b["y"] for b in bboxes) / len(bboxes)
            avg_w = sum(b["w"] for b in bboxes) / len(bboxes)
            avg_h = sum(b["h"] for b in bboxes) / len(bboxes)
            position = classify_position(avg_x, avg_y, avg_w, avg_h)

            # Font vibe
            font_vibe = classify_font_vibe(avg_w, avg_h, track["text"])

            avg_conf = sum(track["confidences"]) / len(track["confidences"])

            overlays.append({
                "startTime": round(track["first_seen"], 3),
                "endTime": round(track["last_seen"], 3),
                "text": track["text"],
                "bbox": {
                    "x": round(avg_x, 4),
                    "y": round(avg_y, 4),
                    "w": round(avg_w, 4),
                    "h": round(avg_h, 4),
                },
                "position": position,
                "animation": animation,
                "motion": {
                    "dx": round(dx, 4),
                    "dy": round(dy, 4),
                    "scaleStart": round(max(0.1, 1.0 - (dw + dh) / max(avg_w + avg_h, 0.01)), 3),
                    "scaleEnd": 1.0,
                    "opacityCurve": "fast_in" if animation in ["pop_scale", "fade_in"] else "linear",
                },
                "fontVibe": font_vibe,
                "confidence": round(avg_conf, 3),
            })

        overlays.sort(key=lambda o: o["startTime"])
        return {"overlays": overlays}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python text_overlay_analyzer.py <video_path>"}))
        sys.exit(1)
    result = analyze_text_overlays(sys.argv[1])
    print(json.dumps(result))
