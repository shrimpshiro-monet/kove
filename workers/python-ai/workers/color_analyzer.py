"""Color analysis using per-shot histogram statistics."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def classify_temperature(avg_hue: float) -> str:
    """Classify color temperature from HSV hue.

    Warm hues: 0-30 (red/orange/yellow)
    Neutral: 30-89 (yellow-green transition)
    Cool hues: 90-150 (blue/cyan)
    Warm hues: >150 (magenta/red)
    """
    if avg_hue < 30 or avg_hue > 150:
        return "warm"
    elif 90 <= avg_hue <= 150:
        return "cool"
    return "neutral"


def analyze_color(
    frame_dir: str,
    shots: list[dict],
) -> dict:
    """Analyze color profile for each shot and globally.

    Returns:
        Dict with per-shot color and global color profile
    """
    frame_files = sorted(Path(frame_dir).glob("frame_*.jpg"))

    shot_colors = []
    all_hues: list[float] = []
    all_saturations: list[float] = []
    all_brightnesses: list[float] = []

    for i, shot in enumerate(shots):
        start_frame = shot["frame_start"]
        end_frame = min(shot["frame_end"], len(frame_files) - 1)

        if start_frame >= len(frame_files):
            shot_colors.append({
                "shot_index": i,
                "dominant_hue": "90",
                "temperature": "neutral",
                "saturation": 0,
                "brightness": 0,
            })
            continue

        hues: list[float] = []
        sats: list[float] = []
        brights: list[float] = []

        for fi in range(start_frame, end_frame + 1):
            img = cv2.imread(str(frame_files[fi]))
            if img is None:
                continue
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            hues.append(float(np.mean(hsv[:, :, 0])))
            sats.append(float(np.mean(hsv[:, :, 1])) / 255.0)
            brights.append(float(np.mean(hsv[:, :, 2])) / 255.0)

        avg_hue = float(np.mean(hues)) if hues else 90
        avg_sat = float(np.mean(sats)) if sats else 0.5
        avg_bright = float(np.mean(brights)) if brights else 0.5
        temperature = classify_temperature(avg_hue)

        shot_colors.append({
            "shot_index": i,
            "dominant_hue": f"{avg_hue:.0f}",
            "temperature": temperature,
            "saturation": round(avg_sat, 4),
            "brightness": round(avg_bright, 4),
        })

        all_hues.extend(hues)
        all_saturations.extend(sats)
        all_brightnesses.extend(brights)

    global_sat = float(np.mean(all_saturations)) if all_saturations else 0.5
    global_bright = float(np.mean(all_brightnesses)) if all_brightnesses else 0.5
    global_hue = float(np.mean(all_hues)) if all_hues else 90

    brightness_std = float(np.std(all_brightnesses)) if all_brightnesses else 0.1
    contrast = 1.0 + (brightness_std * 2)

    return {
        "shots": shot_colors,
        "global": {
            "contrast": round(contrast, 4),
            "saturation": round(global_sat, 4),
            "temperature_shift": classify_temperature(global_hue),
            "shadows_tint": "neutral",
            "highlights_tint": "neutral",
        },
    }
