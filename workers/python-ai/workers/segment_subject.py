from __future__ import annotations

import importlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np


@dataclass(frozen=True)
class SegmentSubjectRequest:
    file_path: str
    clip_id: str
    media_id: str
    output_dir: str
    sample_every_n_frames: int = 8
    max_frames: int = 240
    checkpoint_path: str | None = None
    model_config: str | None = None


def _require_sam2() -> tuple[Any, Any]:
    try:
        build_module = importlib.import_module("sam2.build_sam")
        predictor_module = importlib.import_module("sam2.sam2_image_predictor")
        return build_module, predictor_module
    except Exception as exc:
        raise RuntimeError(
            "SAM2 is not installed. Install with: pip install sam2==1.1.0 and configure model checkpoint."
        ) from exc


def _safe_mkdir(path: str) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)


def _default_prompt(width: int, height: int) -> np.ndarray:
    return np.array([[width / 2.0, height / 2.0]], dtype=np.float32)


def _normalize_mask(mask: np.ndarray) -> np.ndarray:
    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8) * 255

    if mask.ndim == 3:
        mask = mask[0]

    return mask


def segment_subject(request: SegmentSubjectRequest) -> dict[str, Any]:
    if not request.file_path:
        raise ValueError("file_path is required")

    if not request.clip_id:
        raise ValueError("clip_id is required")

    if not request.media_id:
        raise ValueError("media_id is required")

    checkpoint = request.checkpoint_path or os.getenv("SAM2_CHECKPOINT", "")
    model_config = request.model_config or os.getenv("SAM2_CONFIG", "")

    if not checkpoint or not Path(checkpoint).exists():
        raise FileNotFoundError(
            f"SAM2 checkpoint missing: {checkpoint}. Set SAM2_CHECKPOINT to a valid checkpoint path."
        )

    if not model_config:
        raise ValueError("SAM2_CONFIG is required")

    build_module, predictor_module = _require_sam2()

    build_sam2 = getattr(build_module, "build_sam2")
    SAM2ImagePredictor = getattr(predictor_module, "SAM2ImagePredictor")

    model = build_sam2(model_config, checkpoint)
    predictor = SAM2ImagePredictor(model)

    capture = cv2.VideoCapture(request.file_path)

    if not capture.isOpened():
        raise ValueError(f"Could not open video: {request.file_path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    if width <= 0 or height <= 0:
        capture.release()
        raise ValueError("Video dimensions are invalid")

    manifest_id = f"mask-{request.clip_id}-{uuid.uuid4().hex[:10]}"
    mask_dir = str(Path(request.output_dir) / manifest_id)
    _safe_mkdir(mask_dir)

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
            predictor.set_image(rgb)

            point_coords = _default_prompt(width, height)
            point_labels = np.array([1], dtype=np.int32)

            masks, scores, _logits = predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                multimask_output=True,
            )

            if masks is None or len(masks) == 0:
                raise RuntimeError(f"SAM2 produced no masks at frame {frame_index}")

            best_index = int(np.argmax(scores))
            mask = _normalize_mask(masks[best_index])

            output_path = str(Path(mask_dir) / f"mask_{frame_index:06d}.png")
            ok_write = cv2.imwrite(output_path, mask)

            if not ok_write:
                raise RuntimeError(f"Failed to write mask frame: {output_path}")

            frames.append(
                {
                    "time": frame_index / fps,
                    "frame": frame_index,
                    "path": output_path,
                    "width": width,
                    "height": height,
                }
            )

            sampled += 1
            frame_index += 1
    finally:
        capture.release()

    if not frames:
        raise RuntimeError("SAM2 segmentation produced zero mask frames")

    return {
        "id": manifest_id,
        "clipId": request.clip_id,
        "mediaId": request.media_id,
        "sourceVideoPath": request.file_path,
        "maskType": "subject",
        "frames": frames,
        "fps": fps,
        "width": width,
        "height": height,
        "generatedAt": int(__import__("time").time() * 1000),
        "engine": "sam2",
    }
