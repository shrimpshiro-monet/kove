"""
Shot Type Classifier
Classifies shots as wide/medium/close/extreme close using:
- Face detection (MediaPipe, primary) or YCbCr (fallback)
- Edge density analysis
- Subject size estimation
- Background complexity

Deterministic: uses fixed seeds and evenly-spaced sampling.
"""

import subprocess
import os
import tempfile
import logging
import numpy as np
from PIL import Image
from typing import Dict, List, Optional
from collections import Counter

logger = logging.getLogger(__name__)

# Fixed seed for deterministic results
SEED = 42

# Detection method
DETECTION_METHOD = "unknown"

# Module-level flag: warn once per run if mediapipe is missing
_MEDIPIPE_WARNED = False

# Pre-check mediapipe availability at import time
try:
    import mediapipe as mp  # noqa: F401
    _ = mp.solutions.face_detection
    _MEDIPIPE_AVAILABLE = True
except Exception:
    _MEDIPIPE_AVAILABLE = False

# Cached MediaPipe face detector (lazy init)
_FACE_DETECTOR = None


def classify_shot_type(video_path: str, shots: list, sample_rate: float = 2.0, profile: Optional[dict] = None) -> List[Dict]:
    """
    Classify shot types for all shots in video.
    Returns list of shot type classifications.
    """
    print("  Classifying shot types...")
    
    _p = profile or {}
    min_shot_dur = _p.get("cut_detection", {}).get("min_shot_duration", 0.034)
    valid_shots = [s for s in shots if s.get("duration", 0) >= min_shot_dur]
    
    # Extract frames at shot midpoints
    frame_times = [shot["start"] + shot["duration"] / 2 for shot in valid_shots]
    
    # Extract frames
    frames = extract_frames(video_path, frame_times, sample_rate=1.0)
    
    # Classify each frame
    classifications = []
    for i, (shot, frame_path) in enumerate(zip(valid_shots, frames)):
        if os.path.exists(frame_path):
            shot_type = classify_single_frame(frame_path)
            classifications.append({
                "shotIndex": shot["index"],
                "time": shot["start"],
                "shotType": shot_type["dominant"],
                "scores": shot_type["scores"],
                "confidence": shot_type["confidence"],
                "detection_method": shot_type.get("detection_method", "unknown"),
            })
            os.remove(frame_path)
        else:
            classifications.append({
                "shotIndex": shot["index"],
                "time": shot["start"],
                "shotType": "medium",
                "scores": {},
                "confidence": 0.0,
                "detection_method": "none",
            })
    
    return classifications


def extract_frames(video_path: str, times: List[float], sample_rate: float = 1.0) -> List[str]:
    """Extract frames at specified times."""
    tmpdir = tempfile.mkdtemp(prefix="shottype-")
    frame_paths = []
    
    for i, t in enumerate(times):
        output = os.path.join(tmpdir, f"frame_{i:04d}.jpg")
        cmd = [
            "ffmpeg", "-y", "-ss", str(t),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            output
        ]
        subprocess.run(cmd, capture_output=True, timeout=10)
        frame_paths.append(output)
    
    return frame_paths


def classify_single_frame(frame_path: str) -> Dict:
    """
    Classify a single frame's shot type.
    Uses multiple heuristics and combines them.
    """
    global DETECTION_METHOD
    
    try:
        img = Image.open(frame_path).convert('RGB')
        pixels = np.array(img, dtype=np.float32)
        
        h, w = pixels.shape[:2]
        
        # 1. Face detection (primary) or skin detection (fallback)
        face_ratio, detection_method = detect_face_or_skin(frame_path, pixels)
        DETECTION_METHOD = detection_method
        
        # 2. Edge density
        edge_density = detect_edge_density(img)
        
        # 3. Subject size (central region dominance)
        subject_size = detect_subject_size(pixels)
        
        # 4. Background complexity
        complexity = detect_complexity(pixels)
        
        # 5. Color concentration
        color_concentration = detect_color_concentration(pixels)
        
        # Score each shot type based on face_ratio
        # Thresholds documented with reasoning
        
        scores = {}
        
        # Extreme close: face fills >40% of frame
        # At this ratio, the face dominates the composition
        # Typical: interview headshot, tight reaction shot
        scores["extreme_close"] = (
            min(1.0, face_ratio / 0.4) * 0.4 +      # Face ratio contribution
            min(1.0, subject_size / 0.6) * 0.3 +     # Central dominance
            max(0, 1.0 - edge_density * 5) * 0.3     # Smooth background
        )
        
        # Close: face fills 15-40% of frame
        # Face is prominent but not dominant
        # Typical: medium close-up, character focus
        scores["close"] = (
            min(1.0, face_ratio / 0.25) * 0.3 +     # Face ratio contribution
            min(1.0, subject_size / 0.4) * 0.3 +     # Central dominance
            max(0, 1.0 - edge_density * 3) * 0.2 +   # Moderate background
            max(0, color_concentration - 0.3) * 0.2  # Few dominant colors
        )
        
        # Medium: face fills 5-15% of frame
        # Face visible but not dominant, body/environment visible
        # Typical: waist-up shot, two-shot, medium wide
        scores["medium"] = (
            min(1.0, face_ratio / 0.1) * 0.25 +     # Face ratio contribution
            min(1.0, subject_size / 0.2) * 0.25 +    # Some central focus
            edge_density * 0.25 +                     # Moderate detail
            complexity * 0.25                         # Some scene complexity
        )
        
        # Wide: face <5% or no face, high edges, high complexity
        # No dominant face, lots of environment
        # Typical: establishing shot, crowd, landscape
        scores["wide"] = (
            max(0, 1.0 - face_ratio * 20) * 0.25 +   # Low/no face
            max(0, 1.0 - subject_size * 3) * 0.25 +  # No dominant subject
            min(1.0, edge_density * 3) * 0.25 +      # High detail
            min(1.0, complexity * 2) * 0.25           # Complex scene
        )
        
        # Normalize scores
        total = sum(scores.values())
        if total > 0:
            scores = {k: v / total for k, v in scores.items()}
        
        # Get dominant type
        dominant = max(scores, key=scores.get)
        confidence = scores[dominant]
        
        return {
            "dominant": dominant,
            "scores": scores,
            "confidence": confidence,
            "detection_method": detection_method,
            "metrics": {
                "face_ratio": face_ratio,
                "edge_density": edge_density,
                "subject_size": subject_size,
                "complexity": complexity,
                "color_concentration": color_concentration,
            }
        }
        
    except Exception as e:
        print(f"    Warning: Classification failed: {e}")
        return {
            "dominant": "medium",
            "scores": {"medium": 1.0},
            "confidence": 0.0,
            "detection_method": "error",
        }


def detect_face_or_skin(frame_path: str, pixels: np.ndarray) -> tuple:
    """
    Detect face ratio using MediaPipe (primary) or YCbCr skin (fallback).
    Returns (ratio, method_name).
    """
    global _MEDIPIPE_WARNED
    
    # Try MediaPipe first
    if _MEDIPIPE_AVAILABLE:
        try:
            ratio = detect_faces_mediapipe(frame_path)
            return ratio, "mediapipe"
        except Exception as e:
            logger.warning(f"mediapipe face detection failed: {e}, falling back to YCbCr")
    elif not _MEDIPIPE_WARNED:
        logger.warning("mediapipe not installed — using YCbCr skin detection (biased). Install: pip install mediapipe opencv-python")
        _MEDIPIPE_WARNED = True
    
    # Fallback to YCbCr skin detection
    ratio = detect_skin_ratio(pixels)
    return ratio, "ycbcr_fallback"


def detect_faces_mediapipe(frame_path: str) -> float:
    """
    Detect faces using MediaPipe face detection.
    Returns face_ratio = sum(face_bbox_areas) / total_frame_area.
    
    Uses model_selection=1 (full range, better for varied distances).
    Caches the model at module level to avoid reloading per frame.
    """
    import cv2
    global _FACE_DETECTOR
    
    if _FACE_DETECTOR is None:
        import mediapipe as mp
        _FACE_DETECTOR = mp.solutions.face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.5
        )
    
    img = cv2.imread(frame_path)
    if img is None:
        return 0.0
    
    h, w = img.shape[:2]
    total_area = h * w
    
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    results = _FACE_DETECTOR.process(img_rgb)
    
    if not results.detections:
        return 0.0
    
    total_face_area = 0
    for detection in results.detections:
        bbox = detection.location_data.relative_bounding_box
        face_w = bbox.width * w
        face_h = bbox.height * h
        face_area = face_w * face_h
        total_face_area += face_area
    
    return total_face_area / total_area


def detect_skin_ratio(pixels: np.ndarray) -> float:
    """
    Detect skin/face region ratio using YCbCr color space.
    Fallback when MediaPipe is unavailable.
    
    WARNING: Biased against darker skin tones, triggers false positives
    on wood, sand, beige walls. Use MediaPipe when possible.
    """
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    
    # Convert to YCbCr
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.169 * r - 0.331 * g + 0.500 * b
    cr = 128 + 0.500 * r - 0.419 * g - 0.081 * b
    
    # Skin tone ranges (approximate, biased toward lighter skin)
    skin_mask = (
        (y > 80) & (y < 230) &
        (cb > 85) & (cb < 135) &
        (cr > 130) & (cr < 175)
    )
    
    return float(skin_mask.sum() / skin_mask.size)


def detect_edge_density(img: Image.Image) -> float:
    """
    Detect edge density using simple edge detection.
    High edge density = wide shot (buildings, crowds, details).
    Low edge density = close-up (smooth skin, simple background).
    """
    gray = img.convert('L')
    pixels = np.array(gray, dtype=np.float32)
    
    dx = np.abs(np.diff(pixels, axis=1))
    dy = np.abs(np.diff(pixels, axis=0))
    
    edge_h = dx.mean() / 255.0
    edge_v = dy.mean() / 255.0
    
    return (edge_h + edge_v) / 2


def detect_subject_size(pixels: np.ndarray) -> float:
    """
    Detect subject size by analyzing central region dominance.
    Close-ups have a large, uniform central region.
    """
    h, w = pixels.shape[:2]
    
    cy, cx = h // 4, w // 4
    center = pixels[cy:h-cy, cx:w-cx]
    
    top = pixels[:cy, :]
    bottom = pixels[h-cy:, :]
    left = pixels[:, :cx]
    right = pixels[:, w-cx:]
    
    center_var = np.var(center)
    edge_var = np.var(np.concatenate([top.flatten(), bottom.flatten(), 
                                       left.flatten(), right.flatten()]))
    
    if edge_var > 0:
        ratio = 1.0 - (center_var / (edge_var + 1))
        return max(0.0, min(1.0, ratio))
    
    return 0.5


def detect_complexity(pixels: np.ndarray) -> float:
    """
    Detect scene complexity (number of distinct regions).
    Wide shots have more complexity (buildings, crowds, multiple subjects).
    """
    quantized = (pixels / 16).astype(np.uint8)
    
    h, w, c = quantized.shape
    flat = quantized.reshape(-1, c)
    
    if len(flat) > 10000:
        # Deterministic sampling: evenly spaced indices
        indices = np.linspace(0, len(flat) - 1, 10000).astype(int)
        flat = flat[indices]
    
    unique_colors = len(set(map(tuple, flat)))
    
    return min(1.0, unique_colors / 1500)


def detect_color_concentration(pixels: np.ndarray) -> float:
    """
    Detect color concentration (how many dominant colors).
    Close-ups tend to have 1-2 dominant colors.
    Wide shots have many colors.
    """
    flat = pixels.reshape(-1, 3).astype(np.float32)
    
    if len(flat) > 5000:
        # Deterministic sampling: evenly spaced indices
        indices = np.linspace(0, len(flat) - 1, 5000).astype(int)
        flat = flat[indices]
    
    # Deterministic initialization: evenly spaced indices
    centroids = flat[np.linspace(0, len(flat) - 1, 3).astype(int)]
    
    for _ in range(3):
        distances = np.linalg.norm(flat[:, np.newaxis] - centroids, axis=2)
        labels = np.argmin(distances, axis=1)
        
        for i in range(3):
            mask = labels == i
            if mask.any():
                centroids[i] = flat[mask].mean(axis=0)
    
    counts = Counter(labels)
    total = len(labels)
    
    largest_cluster = max(counts.values()) / total
    
    return largest_cluster


def aggregate_shot_types(classifications: List[Dict]) -> Dict:
    """Aggregate shot type classifications into summary."""
    types = [c["shotType"] for c in classifications]
    type_counts = Counter(types)
    
    total = len(types)
    
    # Get dominant detection method
    methods = [c.get("detection_method", "unknown") for c in classifications]
    method_counts = Counter(methods)
    dominant_method = max(method_counts, key=method_counts.get) if method_counts else "unknown"
    
    return {
        "totalShots": total,
        "distribution": {k: v / total for k, v in type_counts.items()},
        "counts": dict(type_counts),
        "dominantType": max(type_counts, key=type_counts.get) if type_counts else "medium",
        "variedFraming": len(type_counts) >= 3,
        "detectionMethod": dominant_method,
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python shot_type_classifier.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    tmpdir = tempfile.mkdtemp()
    frame_path = os.path.join(tmpdir, "test.jpg")
    
    subprocess.run([
        "ffmpeg", "-y", "-ss", "5", "-i", video_path,
        "-vframes", "1", "-q:v", "2", frame_path
    ], capture_output=True)
    
    if os.path.exists(frame_path):
        result = classify_single_frame(frame_path)
        print(f"\nShot Type: {result['dominant']}")
        print(f"Confidence: {result['confidence']:.2f}")
        print(f"Detection: {result['detection_method']}")
        print(f"Scores: {result['scores']}")
        print(f"Metrics: {result['metrics']}")
        os.remove(frame_path)
    
    import shutil
    shutil.rmtree(tmpdir)
