"""Motion analysis using optical flow between shot boundary frames."""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class ShotMotion:
    shot_index: int
    motion: str
    intensity: float
    direction_degrees: float | None


def _compute_flow_stats(img1: np.ndarray, img2: np.ndarray) -> tuple[float, float, float]:
    flow = cv2.calcOpticalFlowFarneback(img1, img2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    vx, vy = flow[..., 0], flow[..., 1]
    magnitude, angle = cv2.cartToPolar(vx, vy)

    mean_mag = float(np.mean(magnitude))

    # Weight angle by magnitude — ignore static regions (sky, walls, floors)
    mask = magnitude > np.percentile(magnitude, 75)
    dominant_angle = float(np.median(angle[mask])) if mask.any() else float(np.median(angle))

    h, w = img1.shape
    cy, cx = h / 2, w / 2
    ys, xs = np.mgrid[0:h, 0:w]
    dx = xs.astype(np.float32) - cx
    dy = ys.astype(np.float32) - cy

    dot = vx * dx + vy * dy
    radial_mag = np.sqrt(dx * dx + dy * dy)
    radial_mag[radial_mag == 0] = 1.0
    radial_norm = dot / radial_mag
    radial_fraction = float(np.mean(radial_norm > 0) if mean_mag > 0 else 0)

    return mean_mag, dominant_angle, radial_fraction


def classify_motion(
    flow_magnitude: float,
    flow_angle: float,
    radial_fraction: float,
    flow_std: float = 0.0,
) -> tuple[str, float, float | None]:
    """Classify camera motion from optical flow statistics.

    Returns:
        (motion_type, intensity, direction_degrees)
    """
    if flow_magnitude < 0.5:
        return "static", 0.0, None

    if flow_magnitude < 2.0:
        return "handheld", min(flow_magnitude / 5.0, 1.0), None

    deg = math.degrees(flow_angle) % 360
    intensity = min(flow_magnitude / 10.0, 1.0)

    if 0.6 < radial_fraction < 0.75:
        return "zoom_in", intensity, deg
    if radial_fraction > 0.75:
        return "zoom_out", intensity, deg

    if flow_std > flow_magnitude * 0.8:
        return "shake", intensity, deg

    if 315 <= deg or deg <= 45:
        return "pan_right", intensity, deg
    if 135 <= deg <= 225:
        return "pan_left", intensity, deg
    if 45 < deg < 135:
        return "tilt_up", intensity, deg
    if 225 < deg < 315:
        return "tilt_down", intensity, deg

    return "shake", intensity, deg


def analyze_motion(
    frame_dir: str,
    shots: list[dict],
) -> dict:
    """Analyze camera motion for each shot using optical flow.

    Args:
        frame_dir: Directory containing extracted frames
        shots: Shot segments from cut detection

    Returns:
        Dict with motions array
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))

    motions = []
    for i, shot in enumerate(shots):
        start_frame = shot["frame_start"]
        end_frame = shot["frame_end"]

        if start_frame >= len(frame_files) or end_frame >= len(frame_files):
            motions.append(
                {"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None}
            )
            continue

        img1 = cv2.imread(str(frame_files[start_frame]), cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imread(
            str(frame_files[min(end_frame, len(frame_files) - 1)]),
            cv2.IMREAD_GRAYSCALE,
        )

        if img1 is None or img2 is None:
            motions.append(
                {"shot_index": i, "motion": "static", "intensity": 0, "direction_degrees": None}
            )
            continue

        if img1.shape != img2.shape:
            img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        mean_mag, dominant_angle, radial_frac = _compute_flow_stats(img1, img2)

        mid_frame = (start_frame + end_frame) // 2
        flow_std = 0.0
        if 0 < start_frame < mid_frame < end_frame < len(frame_files):
            img_prev = cv2.imread(str(frame_files[mid_frame - 1]), cv2.IMREAD_GRAYSCALE)
            img_next = cv2.imread(str(frame_files[min(mid_frame + 1, len(frame_files) - 1)]), cv2.IMREAD_GRAYSCALE)
            if img_prev is not None and img_next is not None:
                if img_prev.shape != img_next.shape:
                    img_next = cv2.resize(img_next, (img_prev.shape[1], img_prev.shape[0]))
                prev_flow = cv2.calcOpticalFlowFarneback(
                    img_prev, img_next, None, 0.5, 3, 15, 3, 5, 1.2, 0
                )
                prev_mag, _ = cv2.cartToPolar(prev_flow[..., 0], prev_flow[..., 1])
                flow_std = float(np.std(prev_mag))

        motion_type, intensity, direction = classify_motion(
            mean_mag, dominant_angle, radial_frac, flow_std
        )

        motions.append(
            {
                "shot_index": i,
                "motion": motion_type,
                "intensity": round(intensity, 4),
                "direction_degrees": round(direction, 2) if direction is not None else None,
            }
        )

    return {"motions": motions}
