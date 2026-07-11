from __future__ import annotations

import importlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch


@dataclass(frozen=True)
class EstimateDepthRequest:
    file_path: str
    clip_id: str
    media_id: str
    output_dir: str
    encoder: str = "vits"
    checkpoint_path: str | None = None
    sample_every_n_frames: int = 8
    max_frames: int = 240


MODEL_CONFIGS = {
    "vits": {"encoder": "vits", "features": 64, "out_channels": [48, 96, 192, 384]},
    "vitb": {"encoder": "vitb", "features": 128, "out_channels": [96, 192, 384, 768]},
    "vitl": {"encoder": "vitl", "features": 256, "out_channels": [256, 512, 1024, 1024]},
}


def _require_depth_anything() -> Any:
    try:
        module = importlib.import_module("depth_anything_v2.dpt")
        return getattr(module, "DepthAnythingV2")
    except Exception as exc:
        raise RuntimeError(
            "Depth Anything V2 is not installed. Install with: pip install depth-anything-v2==0.1.0"
        ) from exc


def _safe_mkdir(path: str) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)


def _normalize_depth(depth: np.ndarray) -> tuple[np.ndarray, float, float]:
    depth = depth.astype(np.float32)
    min_depth = float(np.min(depth))
    max_depth = float(np.max(depth))

    if max_depth - min_depth <= 1e-8:
        normalized = np.zeros_like(depth, dtype=np.uint8)
        return normalized, min_depth, max_depth

    normalized = ((depth - min_depth) / (max_depth - min_depth) * 255.0).clip(0, 255).astype(np.uint8)
    return normalized, min_depth, max_depth


def estimate_depth(request: EstimateDepthRequest) -> dict[str, Any]:
    if not request.file_path:
        raise ValueError("file_path is required")

    if request.encoder not in MODEL_CONFIGS:
        raise ValueError(f"Unsupported Depth Anything encoder: {request.encoder}")

    checkpoint = request.checkpoint_path or os.getenv("DEPTH_ANYTHING_CHECKPOINT", "")

    if not checkpoint or not Path(checkpoint).exists():
        raise FileNotFoundError(
            f"Depth Anything checkpoint missing: {checkpoint}. Set DEPTH_ANYTHING_CHECKPOINT to a valid checkpoint."
        )

    DepthAnythingV2 = _require_depth_anything()

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model = DepthAnythingV2(**MODEL_CONFIGS[request.encoder])
    state = torch.load(checkpoint, map_location="cpu")
    model.load_state_dict(state)
    model = model.to(device).eval()

    capture = cv2.VideoCapture(request.file_path)

    if not capture.isOpened():
        raise ValueError(f"Could not open video: {request.file_path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    if width <= 0 or height <= 0:
        capture.release()
        raise ValueError("Video dimensions are invalid")

    manifest_id = f"depth-{request.clip_id}-{uuid.uuid4().hex[:10]}"
    depth_dir = str(Path(request.output_dir) / manifest_id)
    _safe_mkdir(depth_dir)

    frames: list[dict[str, Any]] = []
    global_min = float("inf")
    global_max = float("-inf")

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

            depth = model.infer_image(frame)
            normalized, min_depth, max_depth = _normalize_depth(depth)

            global_min = min(global_min, min_depth)
            global_max = max(global_max, max_depth)

            output_path = str(Path(depth_dir) / f"depth_{frame_index:06d}.png")
            ok_write = cv2.imwrite(output_path, normalized)

            if not ok_write:
                raise RuntimeError(f"Failed to write depth frame: {output_path}")

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
        raise RuntimeError("Depth Anything produced zero depth frames")

    return {
        "id": manifest_id,
        "clipId": request.clip_id,
        "mediaId": request.media_id,
        "sourceVideoPath": request.file_path,
        "frames": frames,
        "fps": fps,
        "width": width,
        "height": height,
        "generatedAt": int(__import__("time").time() * 1000),
        "engine": "depth-anything-v2",
        "minDepth": 0 if global_min == float("inf") else global_min,
        "maxDepth": 0 if global_max == float("-inf") else global_max,
    }
