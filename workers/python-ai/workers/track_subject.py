from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import mediapipe as mp
import numpy as np


@dataclass(frozen=True)
class TrackSubjectRequest:
    file_path: str
    sample_every_n_frames: int = 5
    max_frames: int = 900


def _safe_bbox_from_landmarks(
    landmarks: Any,
    width: int,
    height: int,
) -> dict[str, float] | None:
    points = []

    for landmark in landmarks:
        x = float(landmark.x) * width
        y = float(landmark.y) * height

        if np.isfinite(x) and np.isfinite(y):
            points.append((x, y))

    if not points:
        return None

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]

    x1 = max(0.0, min(xs))
    y1 = max(0.0, min(ys))
    x2 = min(float(width), max(xs))
    y2 = min(float(height), max(ys))

    box_width = max(1.0, x2 - x1)
    box_height = max(1.0, y2 - y1)

    return {
        "x": x1 / width,
        "y": y1 / height,
        "width": box_width / width,
        "height": box_height / height,
        "centerX": (x1 + box_width / 2.0) / width,
        "centerY": (y1 + box_height / 2.0) / height,
    }


def track_subject(request: TrackSubjectRequest) -> dict[str, Any]:
    if not request.file_path:
        raise ValueError("file_path is required")

    capture = cv2.VideoCapture(request.file_path)

    if not capture.isOpened():
        raise ValueError(f"Could not open video: {request.file_path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    if width <= 0 or height <= 0:
        capture.release()
        raise ValueError("Video has invalid dimensions")

    pose = mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    face = mp.solutions.face_detection.FaceDetection(
        model_selection=1,
        min_detection_confidence=0.45,
    )

    frames: list[dict[str, Any]] = []

    frame_index = 0
    sampled = 0

    try:
        while True:
            ok, frame = capture.read()

            if not ok:
                break

            if frame_index % request.sample_every_n_frames != 0:
                frame_index += 1
                continue

            if sampled >= request.max_frames:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            pose_result = pose.process(rgb)
            face_result = face.process(rgb)

            bbox = None
            source = None
            confidence = 0.0

            if pose_result.pose_landmarks:
                bbox = _safe_bbox_from_landmarks(
                    pose_result.pose_landmarks.landmark,
                    width,
                    height,
                )
                source = "pose"
                confidence = 0.7

            if face_result.detections:
                detection = face_result.detections[0]
                relative_box = detection.location_data.relative_bounding_box
                bbox = {
                    "x": max(0.0, float(relative_box.xmin)),
                    "y": max(0.0, float(relative_box.ymin)),
                    "width": min(1.0, float(relative_box.width)),
                    "height": min(1.0, float(relative_box.height)),
                    "centerX": float(relative_box.xmin + relative_box.width / 2.0),
                    "centerY": float(relative_box.ymin + relative_box.height / 2.0),
                }
                source = "face"
                confidence = max(confidence, float(detection.score[0] if detection.score else 0.5))

            if bbox:
                frames.append({
                    "time": frame_index / fps,
                    "frame": frame_index,
                    "bbox": bbox,
                    "source": source,
                    "confidence": confidence,
                })
                sampled += 1

            frame_index += 1
    finally:
        capture.release()
        pose.close()
        face.close()

    return {
        "frames": frames,
        "fps": fps,
        "width": width,
        "height": height,
        "frameCount": frame_count,
        "sampledCount": len(frames),
    }
