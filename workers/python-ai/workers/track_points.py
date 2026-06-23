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
class TrackPointsRequest:
    file_path: str
    clip_id: str
    media_id: str
    output_dir: str
    grid_size: int = 10
    max_frames: int = 120
    checkpoint_path: str | None = None
    commercial_verified: bool = False


def _research_enabled(request: TrackPointsRequest) -> bool:
    if request.commercial_verified:
        return True

    return os.getenv("MONET_ENABLE_RESEARCH_TRACKING", "false").lower() == "true"


def _require_cotracker() -> Any:
    try:
        module = importlib.import_module("cotracker.predictor")
        return getattr(module, "CoTrackerPredictor")
    except Exception as exc:
        raise RuntimeError(
            "CoTracker is not installed. Install and verify license before use."
        ) from exc


def _read_video_tensor(path: str, max_frames: int) -> tuple[torch.Tensor, float, int, int]:
    capture = cv2.VideoCapture(path)

    if not capture.isOpened():
        raise ValueError(f"Could not open video: {path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    frames: list[np.ndarray] = []

    try:
        while len(frames) < max_frames:
            ok, frame = capture.read()
            if not ok:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(rgb)
    finally:
        capture.release()

    if not frames:
        raise RuntimeError("Could not decode frames for CoTracker")

    video_np = np.stack(frames, axis=0)
    video_tensor = torch.from_numpy(video_np).permute(0, 3, 1, 2)[None].float()
    return video_tensor, fps, width, height


def track_points(request: TrackPointsRequest) -> dict[str, Any]:
    if not _research_enabled(request):
        raise PermissionError(
            "CoTracker integration is disabled because model licensing may be research/non-commercial. "
            "Set MONET_ENABLE_RESEARCH_TRACKING=true for research mode, or pass commercialVerified=true after license review."
        )

    checkpoint = request.checkpoint_path or os.getenv("COTRACKER_CHECKPOINT", "")

    if not checkpoint or not Path(checkpoint).exists():
        raise FileNotFoundError(
            f"CoTracker checkpoint missing: {checkpoint}. Set COTRACKER_CHECKPOINT to a valid checkpoint."
        )

    CoTrackerPredictor = _require_cotracker()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    video, fps, width, height = _read_video_tensor(request.file_path, request.max_frames)
    video = video.to(device)

    model = CoTrackerPredictor(checkpoint=checkpoint).to(device).eval()

    with torch.no_grad():
        pred_tracks, pred_visibility = model(video, grid_size=request.grid_size)

    tracks_np = pred_tracks[0].detach().cpu().numpy()
    visibility_np = pred_visibility[0].detach().cpu().numpy()

    manifest_id = f"points-{request.clip_id}-{uuid.uuid4().hex[:10]}"
    point_tracks: list[dict[str, Any]] = []

    total_frames = tracks_np.shape[0]
    total_points = tracks_np.shape[1]

    for point_index in range(total_points):
        samples: list[dict[str, Any]] = []

        query_x = float(tracks_np[0, point_index, 0])
        query_y = float(tracks_np[0, point_index, 1])

        for frame_index in range(total_frames):
            x = float(tracks_np[frame_index, point_index, 0])
            y = float(tracks_np[frame_index, point_index, 1])
            visible_raw = visibility_np[frame_index, point_index]

            visible = bool(visible_raw > 0.5)
            confidence = float(visible_raw)

            samples.append(
                {
                    "time": frame_index / fps,
                    "frame": frame_index,
                    "x": x,
                    "y": y,
                    "visible": visible,
                    "confidence": confidence,
                }
            )

        point_tracks.append(
            {
                "id": f"pt-{point_index}",
                "queryFrame": 0,
                "queryX": query_x,
                "queryY": query_y,
                "samples": samples,
            }
        )

    return {
        "id": manifest_id,
        "clipId": request.clip_id,
        "mediaId": request.media_id,
        "sourceVideoPath": request.file_path,
        "tracks": point_tracks,
        "fps": fps,
        "width": width,
        "height": height,
        "generatedAt": int(__import__("time").time() * 1000),
        "engine": "cotracker",
        "licenseMode": "commercial-verified" if request.commercial_verified else "research-only",
    }
