"""
Subject Tracker — YOLO + ByteTrack for multi-object tracking.

Detects subjects (people, cars, etc.) and tracks them across frames,
providing stable IDs, motion paths, and velocity data.

Usage:
    python subject_tracker.py <video_path>
    Or via subprocess import: from subject_tracker import track_subjects
"""

import json
import sys
import os
import subprocess
import tempfile
from pathlib import Path

def extract_frames(video_path: str, output_dir: str, interval: float = 0.2) -> list:
    """Extract frames at regular intervals."""
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

def classify_motion_path(positions: list) -> str:
    """Classify the dominant motion path from a list of center positions."""
    if len(positions) < 2:
        return "unknown"

    total_dx = positions[-1]["x"] - positions[0]["x"]
    total_dy = positions[-1]["y"] - positions[0]["y"]

    if abs(total_dx) < 0.05 and abs(total_dy) < 0.05:
        return "static"

    if abs(total_dx) > abs(total_dy):
        return "left_to_right" if total_dx > 0 else "right_to_left"
    else:
        # Check for circular motion
        mid = len(positions) // 2
        curvature = abs(
            (positions[mid]["x"] - positions[0]["x"]) * (positions[-1]["y"] - positions[0]["y"]) -
            (positions[mid]["y"] - positions[0]["y"]) * (positions[-1]["x"] - positions[0]["x"])
        )
        if curvature > 0.1:
            return "circular"
        return "diagonal"

def detect_velocity_peaks(positions: list, timestamps: list) -> list:
    """Detect timestamps where velocity peaks (fastest motion)."""
    if len(positions) < 3:
        return []

    velocities = []
    for i in range(1, len(positions)):
        dt = timestamps[i] - timestamps[i-1]
        if dt <= 0:
            continue
        dx = positions[i]["x"] - positions[i-1]["x"]
        dy = positions[i]["y"] - positions[i-1]["y"]
        vel = (dx*dx + dy*dy) ** 0.5 / dt
        velocities.append({"time": timestamps[i], "velocity": vel})

    if not velocities:
        return []

    avg_vel = sum(v["velocity"] for v in velocities) / len(velocities)
    peaks = [round(v["time"], 3) for v in velocities if v["velocity"] > avg_vel * 1.5]
    return peaks[:5]  # Top 5 peaks

def detect_occlusions(positions: list, timestamps: list, confidence_curve: list) -> list:
    """Detect potential occlusion events (low confidence + motion continues)."""
    occlusions = []
    in_occlusion = False
    start_time = 0

    for i, conf in enumerate(confidence_curve):
        if conf < 0.4 and not in_occlusion:
            in_occlusion = True
            start_time = timestamps[i]
        elif conf >= 0.4 and in_occlusion:
            in_occlusion = False
            occlusions.append({
                "startTime": round(start_time, 3),
                "endTime": round(timestamps[i], 3),
            })

    return occlusions

def track_subjects(video_path: str) -> dict:
    """
    Main entry point. Detects and tracks subjects using YOLO + ByteTrack.
    Returns stable track IDs, motion paths, and velocity data.
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        return {"tracks": [], "error": "ultralytics not installed"}

    try:
        from ultralytics.trackers import BYTETracker
    except ImportError:
        # Fallback: basic YOLO detection without tracking
        return _basic_detection(video_path)

    try:
        import cv2
    except ImportError:
        return {"tracks": [], "error": "opencv-python not installed"}

    model = YOLO("yolov8n.pt")  # Nano model for speed

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Track data across frames
    track_data = {}  # track_id -> {positions, timestamps, confidences, class_name}

    frame_interval = max(1, int(fps * 0.2))  # Process every 0.2s
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval != 0:
            frame_idx += 1
            continue

        timestamp = frame_idx / fps

        # Run detection + tracking
        results = model.track(frame, persist=True, tracker="bytetrack.yaml", verbose=False)

        if results and results[0].boxes is not None:
            boxes = results[0].boxes
            if boxes.id is not None:
                for i, box_id in enumerate(boxes.id.cpu().numpy()):
                    tid = int(box_id)
                    cls = int(boxes.cls.cpu().numpy()[i])
                    conf = float(boxes.conf.cpu().numpy()[i])
                    xyxy = boxes.xyxy.cpu().numpy()[i]

                    class_name = model.names.get(cls, "unknown")
                    if class_name not in ["person", "car", "truck", "bicycle", "motorcycle", "dog", "cat"]:
                        continue

                    # Normalized center
                    cx = ((xyxy[0] + xyxy[2]) / 2) / frame_width
                    cy = ((xyxy[1] + xyxy[3]) / 2) / frame_height

                    if tid not in track_data:
                        track_data[tid] = {
                            "positions": [],
                            "timestamps": [],
                            "confidences": [],
                            "class_name": class_name,
                        }

                    track_data[tid]["positions"].append({"x": round(cx, 4), "y": round(cy, 4)})
                    track_data[tid]["timestamps"].append(round(timestamp, 3))
                    track_data[tid]["confidences"].append(round(conf, 3))

        frame_idx += 1

    cap.release()

    # Build track summaries
    tracks = []
    for tid, data in track_data.items():
        if len(data["positions"]) < 3:
            continue

        duration = data["timestamps"][-1] - data["timestamps"][0]
        if duration < 0.3:
            continue

        avg_conf = sum(data["confidences"]) / len(data["confidences"])

        avg_x = sum(p["x"] for p in data["positions"]) / len(data["positions"])
        avg_y = sum(p["y"] for p in data["positions"]) / len(data["positions"])

        tracks.append({
            "trackId": f"subject_{tid}",
            "className": data["class_name"],
            "startTime": data["timestamps"][0],
            "endTime": data["timestamps"][-1],
            "avgCenter": {"x": round(avg_x, 4), "y": round(avg_y, 4)},
            "motionPath": classify_motion_path(data["positions"]),
            "velocityPeaks": detect_velocity_peaks(data["positions"], data["timestamps"]),
            "occlusionEvents": detect_occlusions(data["positions"], data["timestamps"], data["confidences"]),
            "faceLikelyVisible": data["class_name"] == "person" and avg_y > 0.3 and avg_y < 0.8,
            "confidence": round(avg_conf, 3),
        })

    tracks.sort(key=lambda t: t["startTime"])
    return {"tracks": tracks}


def _basic_detection(video_path: str) -> dict:
    """Fallback: YOLO detection without ByteTrack tracking."""
    try:
        from ultralytics import YOLO
        import cv2
    except ImportError:
        return {"tracks": [], "error": "ultralytics not installed"}

    model = YOLO("yolov8n.pt")
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    detections = []
    frame_interval = max(1, int(fps * 0.5))
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval != 0:
            frame_idx += 1
            continue

        timestamp = frame_idx / fps
        results = model(frame, verbose=False)

        if results and results[0].boxes is not None:
            for box in results[0].boxes:
                cls = int(box.cls.cpu().numpy()[0])
                conf = float(box.conf.cpu().numpy()[0])
                class_name = model.names.get(cls, "unknown")

                if class_name == "person" and conf > 0.5:
                    xyxy = box.xyxy.cpu().numpy()[0]
                    cx = ((xyxy[0] + xyxy[2]) / 2) / frame.shape[1]
                    cy = ((xyxy[1] + xyxy[3]) / 2) / frame.shape[0]
                    detections.append({
                        "trackId": f"det_{len(detections)}",
                        "className": class_name,
                        "startTime": round(timestamp, 3),
                        "endTime": round(timestamp, 3),
                        "avgCenter": {"x": round(cx, 4), "y": round(cy, 4)},
                        "motionPath": "unknown",
                        "velocityPeaks": [],
                        "occlusionEvents": [],
                        "faceLikelyVisible": cy > 0.3 and cy < 0.8,
                        "confidence": round(conf, 3),
                    })

        frame_idx += 1

    cap.release()
    return {"tracks": detections}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python subject_tracker.py <video_path>"}))
        sys.exit(1)
    result = track_subjects(sys.argv[1])
    print(json.dumps(result))
