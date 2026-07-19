"""
Transition Classifier
Classifies transitions between shots: hard cuts, fade to/from black,
flash cuts, dissolves, wipes.
"""

import cv2
import numpy as np
from typing import Dict, List, Optional



def classify_transitions(video_path: str, shots: list, profile: Optional[dict] = None) -> Dict:
    """
    Classify transition type between each pair of consecutive shots.
    """
    print("  Classifying transitions...")
    
    _p = profile or {}
    cut_threshold = _p.get("cut_detection", {}).get("threshold", 0.15)
    bw_saturation = _p.get("color", {}).get("bw_saturation", 15)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    transitions = []
    for i in range(len(shots) - 1):
        curr = shots[i]
        nxt = shots[i + 1]

        end_frame = int(curr["end"] * fps)
        start_next = int(nxt["start"] * fps)

        # Sample frames around boundary
        gap_start = max(0, end_frame - 2)
        gap_end = min(start_next + 2, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))

        brights = []
        cap.set(cv2.CAP_PROP_POS_FRAMES, gap_start)
        for _ in range(gap_end - gap_start):
            ret, frame = cap.read()
            if not ret:
                break
            brights.append(float(np.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))))

        if len(brights) < 3:
            continue

        trans = _classify_transition(brights, curr, nxt)
        transitions.append(trans)

    cap.release()
    return _aggregate_transitions(transitions)


def _classify_transition(brights: List[float], curr: dict, nxt: dict) -> Dict:
    """Classify a single transition from brightness curve."""
    mid = len(brights) // 2
    mid_bright = brights[mid]
    max_bright = max(brights)
    min_bright = min(brights)
    start_bright = brights[0]
    end_bright = brights[-1]

    if max_bright > 230 and min_bright < 30:
        tt = "flash_cut"
    elif mid_bright < 20 and start_bright - mid_bright > 50:
        tt = "fade_to_black"
    elif mid_bright < 20 and end_bright - mid_bright > 50:
        tt = "fade_from_black"
    elif max_bright - min_bright > 100:
        tt = "flash_transition"
    elif start_bright - end_bright > 40:
        tt = "fade_out"
    elif end_bright - start_bright > 40:
        tt = "fade_in"
    else:
        tt = "hard_cut"

    return {
        "fromShot": curr.get("index", 0),
        "toShot": nxt.get("index", 0),
        "time": round(curr["end"], 2),
        "type": tt,
        "brightnessCurve": [round(b, 1) for b in brights],
        "maxBrightness": round(max_bright, 1),
        "minBrightness": round(min_bright, 1),
        "midBrightness": round(mid_bright, 1),
    }


def _aggregate_transitions(transitions: List[Dict]) -> Dict:
    """Aggregate transition types across the edit."""
    from collections import Counter

    types = Counter(t["type"] for t in transitions)
    return {
        "transitions": transitions,
        "transitionCounts": dict(types.most_common()),
        "totalTransitions": len(transitions),
    }


if __name__ == "__main__":
    import sys, json
    from monet_pipeline import detect_cuts, shots_from_cuts

    video_path = sys.argv[1]
    cuts = detect_cuts(video_path)
    shots = shots_from_cuts(video_path, cuts)
    result = classify_transitions(video_path, shots)
    print(json.dumps(result, indent=2))
