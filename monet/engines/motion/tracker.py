# monet/engines/motion/tracker.py
from __future__ import annotations
import asyncio
import json
import os
import tempfile
import uuid
from typing import List, Tuple

async def track_subject(video_path: str, init_bbox: Tuple[int, int, int, int]) -> List[Tuple[float, int, int, int, int]]:
    """
    Run CSRT tracker (opencv) on video. Returns (time, x, y, w, h) per frame.
    init_bbox: (x, y, w, h) on first frame.
    Fallback to whole-frame center if cv2 missing.
    """
    try:
        import cv2
    except ImportError:
        # Graceful fallback: return empty list or mock tracking points
        return []

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    tracker = cv2.TrackerCSRT_create()
    ok, frame = cap.read()
    if not ok:
        return []
    tracker.init(frame, init_bbox)
    track: List[Tuple[float, int, int, int, int]] = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        ok, bbox = tracker.update(frame)
        if ok:
            x, y, w, h = [int(v) for v in bbox]
            track.append((idx/fps, x, y, w, h))
        idx += 1
    cap.release()
    return track
