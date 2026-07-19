"""
Color Grade Tracker
Tracks color grade changes across shots — detects B&W→color transitions,
desaturation shifts, and temperature changes per shot.
"""

import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional

def track_color_grades(video_path: str, shots: list, profile: Optional[dict] = None) -> Dict:
    """
    Track color grade per shot, detecting B&W/color phases and transitions.
    """
    print("  Tracking color grades per shot...")
    
    _p = profile or {}
    bw_saturation = _p.get("color", {}).get("bw_saturation", 20)
    desaturated_saturation = _p.get("color", {}).get("desaturated_saturation", 35)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    shot_grades = []
    for si, shot in enumerate(shots):
        mid_time = (shot["start"] + shot["end"]) / 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(mid_time * fps))
        ret, frame = cap.read()
        if not ret:
            shot_grades.append(_default_shot_grade())
            continue

        grade = _analyze_shot_grade(frame, bw_saturation, desaturated_saturation)
        shot_grades.append(grade)

    cap.release()

    return _aggregate_grade_timeline(shot_grades, shots)


def _analyze_shot_grade(frame: np.ndarray, bw_threshold: int = 20, desat_threshold: int = 35) -> Dict:
    """Analyze color grade of a single shot from its mid-frame."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    sat_mean = float(np.mean(hsv[:, :, 1]))
    val_mean = float(np.mean(hsv[:, :, 2]))
    low_sat_pct = float(np.sum(hsv[:, :, 1] < 25) / hsv[:, :, 1].size * 100)

    # B&W detection
    is_bw = sat_mean < bw_threshold or low_sat_pct > 60

    # Grade classification
    if is_bw and val_mean < 30:
        grade = "dark_bw"
    elif is_bw:
        grade = "bw"
    elif sat_mean < desat_threshold:
        grade = "desaturated"
    elif sat_mean < 60:
        grade = "muted"
    elif sat_mean < 90:
        grade = "moderate"
    else:
        grade = "vibrant"

    # Temperature from gray-world
    b, g, r = cv2.split(frame)
    rg_ratio = float(np.mean(r) / (np.mean(g) + 1))
    if rg_ratio > 1.05:
        temp = "warm"
    elif rg_ratio < 0.95:
        temp = "cool"
    else:
        temp = "neutral"

    return {
        "grade": grade,
        "isBw": is_bw,
        "saturation": round(sat_mean, 1),
        "brightness": round(val_mean, 1),
        "lowSaturationPct": round(low_sat_pct, 1),
        "temperature": temp,
    }


def _aggregate_grade_timeline(shot_grades: List[Dict], shots: list) -> Dict:
    """Build color phase timeline and aggregate stats."""
    # Build B&W/color phases
    phases = []
    current = None
    phase_start = 0
    phase_grade = None

    for i, sg in enumerate(shot_grades):
        key = "bw" if sg["isBw"] else "color"
        if key != current:
            if current is not None:
                phases.append({
                    "type": current,
                    "start": round(phase_start, 1),
                    "end": round(shots[i-1]["end"], 1),
                    "grade": phase_grade,
                })
            current = key
            phase_start = shots[i]["start"]
            phase_grade = sg["grade"]

    phases.append({
        "type": current,
        "start": round(phase_start, 1),
        "end": round(shots[-1]["end"], 1),
        "grade": phase_grade,
    })

    # Count grades
    from collections import Counter
    grades = Counter(sg["grade"] for sg in shot_grades)
    bw_count = sum(1 for sg in shot_grades if sg["isBw"])
    color_count = len(shot_grades) - bw_count

    return {
        "phases": phases,
        "perShot": shot_grades,
        "gradeDistribution": dict(grades.most_common()),
        "bwShotCount": bw_count,
        "colorShotCount": color_count,
        "hasGradeTransition": len(phases) > 1,
    }


def _default_shot_grade() -> Dict:
    return {
        "grade": "unknown",
        "isBw": False,
        "saturation": 50,
        "brightness": 128,
        "lowSaturationPct": 0,
        "temperature": "neutral",
    }


if __name__ == "__main__":
    import sys, json
    from monet_pipeline import detect_cuts, shots_from_cuts

    video_path = sys.argv[1]
    cuts = detect_cuts(video_path)
    shots = shots_from_cuts(video_path, cuts)
    result = track_color_grades(video_path, shots)
    print(json.dumps(result, indent=2))
