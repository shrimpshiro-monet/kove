"""
composition_analyzer.py — Geometric composition scoring.

Uses face/subject bounding boxes (from shot_type_classifier mediapipe output)
to score rule-of-thirds alignment, headroom, leading lines, and symmetry.

Designed to be cheap since detection is already done.
"""

import math
from typing import Any, Optional

import numpy as np


def analyze_composition(normalized: Any, shots: list[dict]) -> dict:
    """
    Score composition quality for each shot.

    Args:
        normalized: NormalizedVideo with width/height
        shots: List of shot dicts with face_data or subject_boxes

    Returns:
        dict with per-shot composition scores and aggregates
    """
    per_shot = []
    for i, shot in enumerate(shots):
        score = _score_shot_composition(
            shot,
            normalized.width,
            normalized.height,
        )
        per_shot.append(score)

    return {
        "perShot": per_shot,
        "avgRuleOfThirds": float(np.mean([s.get("ruleOfThirds", 0) for s in per_shot])) if per_shot else 0,
        "avgHeadroom": float(np.mean([s.get("headroom", 0) for s in per_shot])) if per_shot else 0,
        "avgSymmetry": float(np.mean([s.get("symmetry", 0) for s in per_shot])) if per_shot else 0,
    }


def _score_shot_composition(
    shot: dict,
    frame_w: int,
    frame_h: int,
) -> dict:
    """Score a single shot's composition from available face/subject data."""
    faces = shot.get("face_data", [])
    result = {
        "ruleOfThirds": 0.5,   # 0-1, higher = better alignment
        "headroom": 0.5,       # 0-1, ideal ≈ 0.7
        "leadingLines": 0.0,   # 0-1
        "symmetry": 0.5,       # 0-1
    }

    if not faces:
        return result

    # Rule-of-thirds scoring
    third_x = frame_w / 3
    third_y = frame_h / 3
    third_points = [
        (third_x, third_y),
        (third_x * 2, third_y),
        (third_x, third_y * 2),
        (third_x * 2, third_y * 2),
    ]

    best_dist = float("inf")
    for face in faces:
        cx = face.get("x", 0) + face.get("width", 0) / 2
        cy = face.get("y", 0) + face.get("height", 0) / 2
        for tx, ty in third_points:
            d = math.sqrt((cx - tx) ** 2 + (cy - ty) ** 2)
            best_dist = min(best_dist, d)

    max_dist = math.sqrt(frame_w ** 2 + frame_h ** 2) / 3
    result["ruleOfThirds"] = max(0, 1 - (best_dist / max_dist))

    # Headroom: distance from top of highest face to frame top
    if faces:
        min_y = min(f.get("y", 0) for f in faces)
        headroom_ratio = min_y / frame_h
        # Ideal headroom is ~0.1 (10% from top)
        result["headroom"] = max(0, 1 - abs(headroom_ratio - 0.1) * 5)

    # Symmetry: compare left/right face distribution
    if len(faces) >= 2:
        left_count = sum(1 for f in faces if f.get("x", 0) + f.get("width", 0) / 2 < frame_w / 2)
        right_count = len(faces) - left_count
        result["symmetry"] = 1 - abs(left_count - right_count) / max(1, len(faces))

    return result
