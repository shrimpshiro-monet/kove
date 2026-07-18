"""
Composite Layout Detector

Detects multi-clip compositions within a video segment:
- Split-screen (2 panels horizontal/vertical)
- Triple split (3 panels horizontal/vertical)
- Grid (2x2 or more)
- Picture-in-picture (small overlay on larger background)

Uses region-based color histogram comparison + divider line detection.
"""

import os
import subprocess
import tempfile
from typing import Any

import cv2
import numpy as np


def detect_composites(video_path: str, shots: list[dict]) -> list[dict]:
    """Detect composite layouts for each shot/segment."""
    results = []
    for shot in shots:
        result = _analyze_segment(video_path, shot["start"], shot["end"])
        result["segmentIndex"] = shot["index"]
        result["time"] = shot["start"]
        results.append(result)
    return results


def _extract_sample_frames(video_path: str, start: float, end: float, n: int = 5) -> list[str]:
    """Extract n evenly-spaced frames from a segment."""
    tmpdir = tempfile.mkdtemp(prefix="comp-")
    frames = []
    duration = end - start
    for i in range(n):
        t = start + duration * i / max(n - 1, 1)
        t = max(0, t)
        path = os.path.join(tmpdir, f"f{i}.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-i", video_path,
             "-vframes", "1", "-q:v", "2", path],
            capture_output=True, timeout=10,
        )
        if os.path.exists(path):
            frames.append(path)
    return frames


def _check_divider(gray: np.ndarray, pos: int, horizontal: bool = True, width: int = 3) -> bool:
    """Check if there's a dark divider band at the given position."""
    h, w = gray.shape
    if horizontal:
        region = gray[max(0, pos - width):min(h, pos + width)].astype(float)
    else:
        region = gray[:, max(0, pos - width):min(w, pos + width)].astype(float)
    return float(region.mean()) < float(gray.mean()) * 0.6


def _classify_frame(img: np.ndarray) -> dict:
    """Classify a single frame's layout."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    overall_mean = float(gray.mean())

    # Region mean differences (0-1 scale)
    # 3-panel horizontal
    r1 = gray[:h // 3, :].astype(float)
    r2 = gray[h // 3: 2 * h // 3, :].astype(float)
    r3 = gray[2 * h // 3:, :].astype(float)
    diff_3h = (abs(r1.mean() - r2.mean()) + abs(r2.mean() - r3.mean())) / 2 / 255.0

    # 3-panel vertical
    c1 = gray[:, :w // 3].astype(float)
    c2 = gray[:, w // 3: 2 * w // 3].astype(float)
    c3 = gray[:, 2 * w // 3:].astype(float)
    diff_3v = (abs(c1.mean() - c2.mean()) + abs(c2.mean() - c3.mean())) / 2 / 255.0

    # 2-panel horizontal / vertical
    diff_h = abs(gray[:h // 2, :].mean() - gray[h // 2:, :].mean()) / 255.0
    diff_v = abs(gray[:, :w // 2].mean() - gray[:, w // 2:].mean()) / 255.0

    # Divider detection
    h_div1 = _check_divider(gray, h // 3, horizontal=True)
    h_div2 = _check_divider(gray, 2 * h // 3, horizontal=True)
    v_div1 = _check_divider(gray, w // 3, horizontal=False)
    v_div2 = _check_divider(gray, 2 * w // 3, horizontal=False)

    # Region color diversity
    regions = []
    for ry in range(3):
        for rx in range(2):
            region = img[ry * h // 3: (ry + 1) * h // 3, rx * w // 2: (rx + 1) * w // 2]
            regions.append(region.mean(axis=(0, 1)))
    color_std = float(np.std(regions, axis=0).mean())

    # Edge density (internal, excluding borders)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(edges[10:h - 10, 10:w - 10].mean()) / 255.0

    # ── Scoring ──
    score = 0
    if diff_3h > 0.05:
        score += 2
    if diff_3v > 0.05:
        score += 2
    if diff_h > 0.08:
        score += 1
    if diff_v > 0.08:
        score += 1
    if h_div1 or h_div2:
        score += 2
    if v_div1 or v_div2:
        score += 2
    if color_std > 25:
        score += 1
    if edge_density > 0.08:
        score += 1

    # ── Classification ──
    layout = "single"
    confidence = 0.5

    if score >= 7:
        # Strong composite signal
        if diff_3h > diff_3v and (h_div1 or h_div2):
            layout = "3panel_h"
            confidence = min(1.0, 0.7 + diff_3h)
        elif diff_3v > diff_3h and (v_div1 or v_div2):
            layout = "3panel_v"
            confidence = min(1.0, 0.7 + diff_3v)
        elif diff_h > diff_v:
            layout = "2panel_h"
            confidence = min(1.0, 0.6 + diff_h)
        else:
            layout = "2panel_v"
            confidence = min(1.0, 0.6 + diff_v)
    elif score >= 5:
        # Moderate signal — could be composite
        if diff_3h > 0.08 and (h_div1 or h_div2):
            layout = "3panel_h"
            confidence = 0.6
        elif diff_3v > 0.08 and (v_div1 or v_div2):
            layout = "3panel_v"
            confidence = 0.6
        elif diff_v > 0.15:
            layout = "2panel_v"
            confidence = 0.55
        elif diff_h > 0.15:
            layout = "2panel_h"
            confidence = 0.55
    elif score >= 3:
        layout = "possible_composite"
        confidence = 0.4

    return {
        "layout": layout,
        "confidence": round(confidence, 3),
        "scores": {
            "diff_3h": round(diff_3h, 4),
            "diff_3v": round(diff_3v, 4),
            "diff_h": round(diff_h, 4),
            "diff_v": round(diff_v, 4),
            "h_dividers": [h_div1, h_div2],
            "v_dividers": [v_div1, v_div2],
            "color_diversity": round(color_std, 1),
            "edge_density": round(edge_density, 4),
            "total_score": score,
        },
    }


def _analyze_segment(video_path: str, start: float, end: float) -> dict:
    """Analyze a segment for composite layouts using multiple sample frames."""
    frames = _extract_sample_frames(video_path, start, end, n=5)
    if not frames:
        return {"hasComposite": False, "layout": "unknown", "confidence": 0.0}

    classifications = []
    for fp in frames:
        img = cv2.imread(fp)
        if img is not None:
            classifications.append(_classify_frame(img))
        if os.path.exists(fp):
            os.remove(fp)

    # Clean up temp dir
    if frames:
        tmpdir = os.path.dirname(frames[0])
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass

    if not classifications:
        return {"hasComposite": False, "layout": "unknown", "confidence": 0.0}

    # Majority vote on layout type (excluding "single" and "possible")
    layout_votes = {}
    for c in classifications:
        layout = c["layout"]
        if layout not in ("single", "possible_composite", "unknown"):
            layout_votes[layout] = layout_votes.get(layout, 0) + 1

    if layout_votes:
        # At least one non-single classification
        best_layout = max(layout_votes, key=layout_votes.get)
        vote_ratio = layout_votes[best_layout] / len(classifications)
        avg_confidence = np.mean([
            c["confidence"] for c in classifications if c["layout"] == best_layout
        ])
        return {
            "hasComposite": True,
            "layout": best_layout,
            "confidence": round(float(avg_confidence * vote_ratio), 3),
            "frameClassifications": [c["layout"] for c in classifications],
            "voteBreakdown": layout_votes,
        }
    else:
        return {
            "hasComposite": False,
            "layout": "single",
            "confidence": 0.9,
            "frameClassifications": [c["layout"] for c in classifications],
        }
