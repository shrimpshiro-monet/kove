"""
Speed Direction Analyzer
Detects playback direction (forward/reverse) per shot using optical flow,
plus refined speed classification with ramp detection.
"""

import cv2
import numpy as np
import math
from typing import Dict, List, Tuple, Optional


def analyze_speed_direction(video_path: str, shots: list, profile: Optional[dict] = None) -> Dict:
    """
    Analyze speed and direction per shot.
    Detects: forward/reverse playback, speed multiplier, ramps.
    """
    print("  Analyzing speed direction...")
    
    _p = profile or {}
    farneback_static = _p.get("motion", {}).get("farneback_static", 0.01)
    farneback_pan = _p.get("motion", {}).get("farneback_pan", 0.08)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    shot_results = []
    for si, shot in enumerate(shots):
        start_frame = int(shot["start"] * fps)
        end_frame = int(shot["end"] * fps)
        n_frames = end_frame - start_frame

        if n_frames < 4:
            shot_results.append(_default_shot_speed())
            continue

        result = _analyze_shot_direction(cap, start_frame, end_frame, shot)
        shot_results.append(result)

    cap.release()
    return _aggregate_direction_results(shot_results)


def _analyze_shot_direction(cap, start_frame: int, end_frame: int, shot: dict) -> Dict:
    """Analyze direction and speed of a single shot using optical flow."""
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    n_frames = end_frame - start_frame
    sample_step = max(1, n_frames // 12)

    mags = []
    dirs = []
    prev_gray = None

    for f in range(start_frame, end_frame, sample_step):
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if prev_gray is not None:
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
            )
            mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            avg_mag = float(np.mean(mag))

            # Direction of significant motion
            significant = mag > 0.5
            if np.sum(significant) > 100:
                sig_ang = ang[significant]
                dir_hist, _ = np.histogram(
                    sig_ang, bins=36, range=(0, 2 * math.pi)
                )
                dom_idx = int(np.argmax(dir_hist))
                dir_deg = dom_idx / 36 * 360
                mags.append(avg_mag)
                dirs.append(dir_deg)

        prev_gray = gray

    if not mags:
        return _default_shot_speed()

    avg_mag = float(np.mean(mags))

    # Speed classification
    if avg_mag < farneback_static:
        spd = 0
        spd_type = "static"
    elif avg_mag < farneback_pan:
        spd = 0.5
        spd_type = "slow"
    elif avg_mag < 0.18:
        spd = 1.0
        spd_type = "normal"
    elif avg_mag < 0.30:
        spd = 1.5
        spd_type = "fast"
    elif avg_mag < 0.50:
        spd = 2.0
        spd_type = "very_fast"
    else:
        spd = 3.0
        spd_type = "extreme"

    # Reverse detection
    is_reverse = False
    reverse_confidence = 0.0
    if len(dirs) > 2:
        dir_mean = float(np.mean(dirs))
        dir_std = float(np.std(dirs))
        # Consistent direction + high motion = intentional
        if dir_std < 50 and avg_mag > 0.12:
            # 135-225 deg = leftward dominant = likely reverse in sports edit
            if 135 < dir_mean < 225:
                is_reverse = True
                reverse_confidence = min(1.0, (225 - abs(dir_mean - 180)) / 45)
            else:
                reverse_confidence = 0.0
        # Ramp: changing speed within shot
    ramp = bool(np.std(mags) > 0.20 * max(np.mean(mags), 0.01))

    # Ramp direction
    ramp_type = None
    if ramp and len(mags) > 3:
        half = len(mags) // 2
        first_half = np.mean(mags[:half])
        second_half = np.mean(mags[half:])
        if second_half > first_half * 1.3:
            ramp_type = "speed_up"
        elif first_half > second_half * 1.3:
            ramp_type = "slow_down"

    return {
        "speed": spd,
        "speedType": spd_type,
        "isReverse": is_reverse,
        "reverseConfidence": round(reverse_confidence, 2),
        "hasRamp": ramp,
        "rampType": ramp_type,
        "flowMagnitude": round(avg_mag, 3),
        "flowStd": round(float(np.std(mags)), 3),
        "directionConsistency": round(float(np.std(dirs)), 1) if len(dirs) > 1 else None,
    }


def _aggregate_direction_results(shot_results: List[Dict]) -> Dict:
    """Aggregate direction results across all shots."""
    from collections import Counter

    speed_types = Counter(s["speedType"] for s in shot_results)
    rev_count = sum(1 for s in shot_results if s["isReverse"])
    ramp_count = sum(1 for s in shot_results if s["hasRamp"])
    avg_speed = float(np.mean([s["speed"] for s in shot_results]))

    ramp_dirs = Counter(
        s["rampType"] for s in shot_results if s["rampType"]
    )

    return {
        "perShot": shot_results,
        "avgSpeed": round(avg_speed, 2),
        "dominantSpeedType": speed_types.most_common(1)[0][0] if speed_types else "normal",
        "speedDistribution": dict(
            (k, v / len(shot_results)) for k, v in speed_types.items()
        ),
        "reverseShotCount": rev_count,
        "rampShotCount": ramp_count,
        "rampRatio": round(ramp_count / max(len(shot_results), 1), 2),
        "rampDirections": dict(ramp_dirs.most_common()),
    }


def _default_shot_speed() -> Dict:
    return {
        "speed": 1.0,
        "speedType": "normal",
        "isReverse": False,
        "reverseConfidence": 0.0,
        "hasRamp": False,
        "rampType": None,
        "flowMagnitude": 0.0,
        "flowStd": 0.0,
        "directionConsistency": None,
    }


if __name__ == "__main__":
    import sys, json
    from monet_pipeline import detect_cuts, shots_from_cuts

    video_path = sys.argv[1]
    cuts = detect_cuts(video_path)
    shots = shots_from_cuts(video_path, cuts)
    result = analyze_speed_direction(video_path, shots)
    print(json.dumps(result, indent=2))
