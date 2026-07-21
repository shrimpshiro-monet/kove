"""Cut detection using histogram difference between consecutive frames."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class CutPoint:
    frame_index: int
    timestamp_s: float
    confidence: float


@dataclass
class ShotSegment:
    start_s: float
    end_s: float
    frame_start: int
    frame_end: int


def detect_cuts(
    frame_dir: str,
    fps: float = 3.0,
    threshold: float = 0.3,
    min_shot_duration_s: float = 0.2,
) -> dict:
    """Detect scene cuts by comparing histograms of consecutive frames.

    Args:
        frame_dir: Directory containing extracted frames
        fps: Frame rate used during extraction
        threshold: Histogram diff threshold for cut detection (0-1)
        min_shot_duration_s: Minimum shot duration in seconds

    Returns:
        Dict with cuts and shots arrays
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))

    if len(frame_files) < 2:
        return {
            "cuts": [],
            "shots": [
                {"start_s": 0.0, "end_s": 0.0, "frame_start": 0, "frame_end": 0}
            ],
        }

    # Compute histogram for each frame
    histograms = []
    for frame_path in frame_files:
        img = cv2.imread(str(frame_path))
        if img is None:
            continue
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        histograms.append(hist)

    if len(histograms) < 2:
        return {
            "cuts": [],
            "shots": [
                {"start_s": 0.0, "end_s": 0.0, "frame_start": 0, "frame_end": 0}
            ],
        }

    # Compare consecutive frames
    cuts: list[CutPoint] = []
    for i in range(1, len(histograms)):
        diff = cv2.compareHist(
            histograms[i - 1], histograms[i], cv2.HISTCMP_BHATTACHARYYA
        )
        if diff > threshold:
            cuts.append(
                CutPoint(
                    frame_index=i,
                    timestamp_s=round(i / fps, 4),
                    confidence=round(min(diff, 1.0), 4),
                )
            )

    # Build shot segments
    shots: list[ShotSegment] = []
    start_frame = 0
    for cut in cuts:
        shots.append(
            ShotSegment(
                start_s=round(start_frame / fps, 4),
                end_s=cut.timestamp_s,
                frame_start=start_frame,
                frame_end=cut.frame_index,
            )
        )
        start_frame = cut.frame_index

    # Final shot
    shots.append(
        ShotSegment(
            start_s=round(start_frame / fps, 4),
            end_s=round(len(histograms) / fps, 4),
            frame_start=start_frame,
            frame_end=len(histograms) - 1,
        )
    )

    # Filter shots below minimum duration
    shots = [s for s in shots if (s.end_s - s.start_s) >= min_shot_duration_s]

    return {
        "cuts": [
            {"frame_index": c.frame_index, "timestamp_s": c.timestamp_s, "confidence": c.confidence}
            for c in cuts
        ],
        "shots": [
            {"start_s": s.start_s, "end_s": s.end_s, "frame_start": s.frame_start, "frame_end": s.frame_end}
            for s in shots
        ],
    }
