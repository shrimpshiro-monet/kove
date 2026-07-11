"""
Color grading transfer using Reinhard's algorithm + histogram matching.
Completely free, runs on CPU, no API calls.
"""
import cv2
import numpy as np
from pathlib import Path

def extract_color_profile(video_path: str, num_frames: int = 30) -> dict:
    """Extract average color profile from video frames."""
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, total_frames // num_frames)

    saturations = []
    brightnesses = []
    contrasts = []
    color_temps = []

    for i in range(0, total_frames, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ret, frame = cap.read()
        if not ret:
            continue

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        saturations.append(np.mean(hsv[:, :, 1]) / 255.0)
        brightnesses.append(np.mean(hsv[:, :, 2]) / 255.0)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        contrasts.append(np.std(gray) / 128.0)

        b, g, r = cv2.split(frame)
        color_temps.append((np.mean(r) - np.mean(b)) / 255.0)

    cap.release()

    return {
        "avgSaturation": float(np.mean(saturations)) if saturations else 0.5,
        "avgBrightness": float(np.mean(brightnesses)) if brightnesses else 0.5,
        "avgContrast": float(np.mean(contrasts)) if contrasts else 0.5,
        "avgTemperature": float(np.mean(color_temps)) if color_temps else 0.0,
        "saturationRange": [float(np.min(saturations)), float(np.max(saturations))] if saturations else [0, 1],
        "brightnessRange": [float(np.min(brightnesses)), float(np.max(brightnesses))] if brightnesses else [0, 1],
    }

def transfer_color(source_frame: np.ndarray, target_profile: dict) -> np.ndarray:
    """Apply color profile to a frame using histogram matching."""
    lab = cv2.cvtColor(source_frame, cv2.COLOR_BGR2LAB).astype(np.float32)

    l_mean = np.mean(lab[:, :, 0])
    l_std = np.std(lab[:, :, 0])
    target_l_mean = target_profile["avgBrightness"] * 255
    target_l_std = target_profile["avgContrast"] * 128

    if l_std > 0:
        lab[:, :, 0] = (lab[:, :, 0] - l_mean) * (target_l_std / l_std) + target_l_mean
    lab[:, :, 0] = np.clip(lab[:, :, 0], 0, 255)

    b_mean = np.mean(lab[:, :, 2])
    temp_shift = target_profile["avgTemperature"] * 20
    lab[:, :, 2] = lab[:, :, 2] - b_mean + 128 + temp_shift

    lab = np.clip(lab, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python color_transfer.py <video_path>")
        sys.exit(1)

    profile = extract_color_profile(sys.argv[1])
    print(json.dumps(profile, indent=2))
