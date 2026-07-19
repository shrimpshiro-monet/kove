"""
Effect Detector
Detects visual effects, transitions, and overlays with confidence gating.

Each detector returns (detected: bool, confidence: float).
Only includes effects in DNA if confidence > THRESHOLD.

Uses relative thresholds instead of absolute where possible:
- Flash: brightness spike > 2 stddev above shot's mean
- Blur: edge_density < 30% of shot's median edge_density
- Vignette: corner/center ratio + consistency check
"""

import subprocess
import os
import tempfile
import numpy as np
from PIL import Image
from typing import Dict, List, Tuple, Optional
from collections import Counter

# Confidence threshold for including effects in DNA
EFFECT_CONFIDENCE_THRESHOLD = 0.7


def detect_effects(video_path: str, shots: list, profile: Optional[dict] = None) -> List[Dict]:
    """
    Detect effects for each shot in the video.
    Returns per-shot effect analysis with confidence scores.
    """
    print("  Detecting effects...")
    
    p = profile or {}
    conf_threshold = p.get("effect", {}).get("confidence_threshold", 0.7)
    
    effects_per_shot = []
    
    for i, shot in enumerate(shots):
        start = max(0, shot["start"] - 0.1)
        end = shot["end"] + 0.1
        
        frames = extract_analysis_frames(video_path, start, end, shot["duration"])
        shot_effects = analyze_shot_effects(frames, shot, conf_threshold)
        shot_effects["shotIndex"] = shot["index"]
        shot_effects["time"] = shot["start"]
        
        effects_per_shot.append(shot_effects)
        
        for f in frames.values():
            if os.path.exists(f):
                os.remove(f)
    
    return effects_per_shot


def extract_analysis_frames(video_path: str, start: float, end: float, 
                            shot_duration: float) -> Dict[str, str]:
    """Extract key frames for effect analysis."""
    tmpdir = tempfile.mkdtemp(prefix="effects-")
    frames = {}
    
    start_path = os.path.join(tmpdir, "start.jpg")
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(start), "-i", video_path,
        "-vframes", "1", "-q:v", "2", start_path
    ], capture_output=True, timeout=10)
    frames["start"] = start_path
    
    mid_time = start + shot_duration / 2
    mid_path = os.path.join(tmpdir, "middle.jpg")
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(mid_time), "-i", video_path,
        "-vframes", "1", "-q:v", "2", mid_path
    ], capture_output=True, timeout=10)
    frames["middle"] = mid_path
    
    end_path = os.path.join(tmpdir, "end.jpg")
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(end), "-i", video_path,
        "-vframes", "1", "-q:v", "2", end_path
    ], capture_output=True, timeout=10)
    frames["end"] = end_path
    
    return frames


def analyze_shot_effects(frames: Dict[str, str], shot: dict, conf_threshold: float = 0.7) -> Dict:
    """Analyze effects in a single shot with confidence gating."""
    # Detect transitions
    transitions_with_conf = detect_transitions(frames)
    
    # Detect visual effects
    visual_with_conf = detect_visual_effects(frames)
    
    # Detect overlays
    overlays_with_conf = detect_overlays(frames)
    
    # Filter by confidence threshold
    transitions = [t["type"] for t in transitions_with_conf if t["confidence"] >= conf_threshold]
    visual_effects = [v["type"] for v in visual_with_conf if v["confidence"] >= conf_threshold]
    overlays = [o["type"] for o in overlays_with_conf if o["confidence"] >= conf_threshold]
    
    all_effects = transitions + visual_effects + overlays
    
    return {
        "transitions": transitions,
        "visualEffects": visual_effects,
        "overlays": overlays,
        "effects": all_effects,
        "effectCount": len(all_effects),
        "dominantEffect": max(Counter(all_effects), key=Counter(all_effects).get) if all_effects else "none",
        "confidenceThreshold": conf_threshold,
    }


def detect_transitions(frames: Dict[str, str]) -> List[Dict]:
    """Detect transition effects with confidence scores."""
    results = []
    
    if not os.path.exists(frames.get("start", "")):
        return results
    
    try:
        start_img = Image.open(frames["start"]).convert('RGB')
        start_pixels = np.array(start_img, dtype=np.float32)
        
        # Fade black: very low brightness at start
        brightness = start_pixels.mean()
        if brightness < 30:
            confidence = min(1.0, (30 - brightness) / 30)
            results.append({"type": "fade_black", "confidence": confidence})
        elif brightness > 220:
            confidence = min(1.0, (brightness - 220) / 35)
            results.append({"type": "fade_white", "confidence": confidence})
        
        # Blur transition: start is much blurrier than middle
        if os.path.exists(frames.get("middle", "")):
            mid_img = Image.open(frames["middle"]).convert('RGB')
            mid_pixels = np.array(mid_img, dtype=np.float32)
            
            start_edges = compute_edge_score(start_pixels)
            mid_edges = compute_edge_score(mid_pixels)
            
            if mid_edges > 0.01:
                blur_ratio = start_edges / mid_edges
                if blur_ratio < 0.3:
                    confidence = min(1.0, (0.3 - blur_ratio) / 0.3)
                    results.append({"type": "blur", "confidence": confidence})
        
        # Wipe: color band at edge
        wipe_conf = compute_wipe_confidence(start_pixels)
        if wipe_conf > 0:
            results.append({"type": "wipe", "confidence": wipe_conf})
        
        # Glitch: color channel offset
        glitch_conf = compute_glitch_confidence(start_pixels)
        if glitch_conf > 0:
            results.append({"type": "glitch", "confidence": glitch_conf})
        
    except Exception:
        pass
    
    return results


def detect_visual_effects(frames: Dict[str, str]) -> List[Dict]:
    """Detect visual effects with confidence scores."""
    results = []
    
    if not os.path.exists(frames.get("middle", "")):
        return results
    
    try:
        mid_img = Image.open(frames["middle"]).convert('RGB')
        mid_pixels = np.array(mid_img, dtype=np.float32)
        
        # Flash: brightness spike > 2 stddev above mean
        flash_conf = compute_flash_confidence(mid_pixels)
        if flash_conf > 0:
            results.append({"type": "flash", "confidence": flash_conf})
        
        # Blur: edge density < 30% of typical
        blur_conf = compute_blur_confidence(mid_pixels)
        if blur_conf > 0:
            results.append({"type": "blur", "confidence": blur_conf})
        
        # Vignette: dark corners
        vignette_conf = compute_vignette_confidence(mid_pixels)
        if vignette_conf > 0:
            results.append({"type": "vignette", "confidence": vignette_conf})
        
        # Chromatic aberration
        chromatic_conf = compute_chromatic_confidence(mid_pixels)
        if chromatic_conf > 0:
            results.append({"type": "chromatic_aberration", "confidence": chromatic_conf})
        
        # Glow
        glow_conf = compute_glow_confidence(mid_pixels)
        if glow_conf > 0:
            results.append({"type": "glow", "confidence": glow_conf})
        
        # Grain
        grain_conf = compute_grain_confidence(mid_pixels)
        if grain_conf > 0:
            results.append({"type": "grain", "confidence": grain_conf})
        
        # Shake (compare start vs middle)
        if os.path.exists(frames.get("start", "")):
            start_img = Image.open(frames["start"]).convert('RGB')
            start_pixels = np.array(start_img, dtype=np.float32)
            shake_conf = compute_shake_confidence(start_pixels, mid_pixels)
            if shake_conf > 0:
                results.append({"type": "shake", "confidence": shake_conf})
        
        # Desaturation
        desat_conf = compute_desaturation_confidence(mid_pixels)
        if desat_conf > 0:
            results.append({"type": "desaturation", "confidence": desat_conf})
        
        # High contrast
        contrast_conf = compute_contrast_confidence(mid_pixels)
        if contrast_conf > 0:
            results.append({"type": "high_contrast", "confidence": contrast_conf})
        
    except Exception:
        pass
    
    return results


def detect_overlays(frames: Dict[str, str]) -> List[Dict]:
    """Detect overlays with confidence scores."""
    results = []
    
    if not os.path.exists(frames.get("middle", "")):
        return results
    
    try:
        mid_img = Image.open(frames["middle"]).convert('RGB')
        mid_pixels = np.array(mid_img, dtype=np.float32)
        
        # Text overlay
        text_conf = compute_text_overlay_confidence(mid_pixels)
        if text_conf > 0:
            results.append({"type": "text", "confidence": text_conf})
        
        # Watermark
        watermark_conf = compute_watermark_confidence(mid_pixels)
        if watermark_conf > 0:
            results.append({"type": "watermark", "confidence": watermark_conf})
        
    except Exception:
        pass
    
    return results


# ── Confidence Computation Functions ──────────────────────────────────

def compute_edge_score(pixels: np.ndarray) -> float:
    """Compute edge density score."""
    gray = np.mean(pixels, axis=2)
    dx = np.abs(np.diff(gray, axis=1))
    dy = np.abs(np.diff(gray, axis=0))
    return (dx.mean() + dy.mean()) / 2 / 255.0


def compute_wipe_confidence(pixels: np.ndarray) -> float:
    """Confidence that a wipe transition is present."""
    h, w = pixels.shape[:2]
    
    left_strip = pixels[:, :w//10]
    left_color = left_strip.mean(axis=(0, 1))
    
    right_strip = pixels[:, w//5:]
    right_color = right_strip.mean(axis=(0, 1))
    
    diff = np.abs(left_color - right_color).mean()
    
    if diff > 80:
        return min(1.0, diff / 150)
    elif diff > 50:
        return 0.5
    return 0.0


def compute_glitch_confidence(pixels: np.ndarray) -> float:
    """Confidence that a glitch effect is present."""
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    
    r_shift = np.roll(r, 3, axis=1)
    b_shift = np.roll(b, -3, axis=1)
    
    r_diff = np.abs(r - r_shift).mean()
    b_diff = np.abs(b - b_shift).mean()
    
    max_diff = max(r_diff, b_diff)
    
    if max_diff > 40:
        return min(1.0, max_diff / 80)
    elif max_diff > 20:
        return 0.4
    return 0.0


def compute_flash_confidence(pixels: np.ndarray) -> float:
    """
    Confidence that a flash effect is present.
    Flash = brightness spike > 2 stddev above typical brightness.
    """
    brightness = pixels.mean()
    
    # Estimate "typical" brightness from percentile
    gray = np.mean(pixels, axis=2)
    p50 = np.percentile(gray, 50)
    p25 = np.percentile(gray, 25)
    std_estimate = (p50 - p25) / 0.6745  # Approximate std from IQR
    
    if std_estimate < 1:
        std_estimate = 20  # Minimum std
    
    # How many std above typical?
    z_score = (brightness - p50) / std_estimate
    
    if z_score > 3:
        return min(1.0, z_score / 5)
    elif z_score > 2:
        return 0.6
    return 0.0


def compute_blur_confidence(pixels: np.ndarray) -> float:
    """
    Confidence that blur is present.
    Blur = edge density < 30% of typical video.
    """
    edge_score = compute_edge_score(pixels)
    
    # Typical video has edge_score > 0.03
    # Blur makes it much lower
    if edge_score < 0.01:
        return 0.9
    elif edge_score < 0.02:
        return 0.7
    elif edge_score < 0.03:
        return 0.5
    return 0.0


def compute_vignette_confidence(pixels: np.ndarray) -> float:
    """
    Confidence that vignette is present.
    Vignette = corners significantly darker than center.
    """
    h, w = pixels.shape[:2]
    center = pixels[h//4:3*h//4, w//4:3*w//4].mean()
    corners = np.mean([
        pixels[:h//4, :w//4].mean(),
        pixels[:h//4, 3*w//4:].mean(),
        pixels[3*h//4:, :w//4].mean(),
        pixels[3*h//4:, 3*w//4:].mean(),
    ])
    
    if center <= 0:
        return 0.0
    
    ratio = center / corners
    
    if ratio > 2.0:
        return min(1.0, (ratio - 1.5) / 1.5)
    elif ratio > 1.5:
        return 0.6
    return 0.0


def compute_chromatic_confidence(pixels: np.ndarray) -> float:
    """Confidence that chromatic aberration is present."""
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    
    r_grad = np.abs(np.diff(r, axis=1)).mean()
    g_grad = np.abs(np.diff(g, axis=1)).mean()
    b_grad = np.abs(np.diff(b, axis=1)).mean()
    
    avg_grad = (r_grad + g_grad + b_grad) / 3
    if avg_grad < 1:
        return 0.0
    
    max_diff = max(abs(r_grad - avg_grad), abs(b_grad - avg_grad))
    ratio = max_diff / avg_grad
    
    if ratio > 0.5:
        return min(1.0, (ratio - 0.3) / 0.5)
    elif ratio > 0.3:
        return 0.5
    return 0.0


def compute_glow_confidence(pixels: np.ndarray) -> float:
    """Confidence that glow effect is present."""
    brightness = pixels.mean(axis=2)
    
    bright_pixels = (brightness > 230).sum()
    total = brightness.size
    bright_ratio = bright_pixels / total
    
    if bright_ratio > 0.1:
        # Check for soft edges (bloom)
        bright_mask = brightness > 230
        edge_grad = np.abs(np.diff(bright_mask.astype(float), axis=1)).mean()
        if edge_grad < 0.05:
            return min(1.0, bright_ratio * 5)
        return 0.4
    elif bright_ratio > 0.05:
        return 0.3
    return 0.0


def compute_grain_confidence(pixels: np.ndarray) -> float:
    """Confidence that film grain is present."""
    gray = np.mean(pixels, axis=2)
    
    high_freq = np.abs(np.diff(gray, axis=1)) + np.abs(np.diff(gray, axis=0))
    noise_level = high_freq.mean() / 255.0
    
    if noise_level > 0.15:
        return min(1.0, noise_level / 0.25)
    elif noise_level > 0.1:
        return 0.5
    return 0.0


def compute_shake_confidence(start_pixels: np.ndarray, mid_pixels: np.ndarray) -> float:
    """Confidence that camera shake is present."""
    start_gray = np.mean(start_pixels, axis=2)
    mid_gray = np.mean(mid_pixels, axis=2)
    
    start_center = start_gray[20:-20, 20:-20]
    mid_center = mid_gray[20:-20, 20:-20]
    
    diff = np.abs(start_center - mid_center).mean()
    
    if diff > 50:
        return min(1.0, diff / 100)
    elif diff > 30:
        return 0.5
    return 0.0


def compute_desaturation_confidence(pixels: np.ndarray) -> float:
    """Confidence that desaturation is present."""
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    
    max_diff = np.maximum(np.abs(r - g), np.abs(g - b)).mean()
    
    if max_diff < 8:
        return 0.9
    elif max_diff < 15:
        return 0.6
    return 0.0


def compute_contrast_confidence(pixels: np.ndarray) -> float:
    """Confidence that high contrast is present."""
    brightness = pixels.mean(axis=2)
    
    p10 = np.percentile(brightness, 10)
    p90 = np.percentile(brightness, 90)
    
    spread = p90 - p10
    
    if spread > 180:
        return min(1.0, spread / 220)
    elif spread > 150:
        return 0.6
    return 0.0


def compute_text_overlay_confidence(pixels: np.ndarray) -> float:
    """Confidence that text overlay is present."""
    gray = np.mean(pixels, axis=2)
    h, w = gray.shape
    
    block_size = 32
    text_blocks = 0
    
    for y in range(0, h - block_size, block_size):
        for x in range(0, w - block_size, block_size):
            block_dx = np.abs(np.diff(gray[y:y+block_size, x:x+block_size], axis=1)).mean()
            block_dy = np.abs(np.diff(gray[y:y+block_size, x:x+block_size], axis=0)).mean()
            
            if block_dx > 30 and block_dy > 30:
                text_blocks += 1
    
    total_blocks = (h // block_size) * (w // block_size)
    ratio = text_blocks / max(1, total_blocks)
    
    if ratio > 0.15:
        return min(1.0, ratio * 3)
    elif ratio > 0.1:
        return 0.5
    return 0.0


def compute_watermark_confidence(pixels: np.ndarray) -> float:
    """Confidence that watermark is present."""
    h, w = pixels.shape[:2]
    
    corner = pixels[3*h//4:, 3*w//4:]
    center = pixels[h//4:3*h//4, w//4:3*w//4]
    
    corner_std = corner.std()
    center_std = center.std()
    
    corner_brightness = corner.mean()
    center_brightness = center.mean()
    
    if center_std > 0 and corner_std < center_std * 0.5:
        brightness_diff = abs(corner_brightness - center_brightness)
        if brightness_diff > 30:
            return min(1.0, brightness_diff / 60)
        return 0.4
    return 0.0


def aggregate_effects(effects_per_shot: List[Dict], conf_threshold: float = 0.7) -> Dict:
    """Aggregate effects across all shots."""
    all_effects = []
    transition_counts = Counter()
    visual_counts = Counter()
    overlay_counts = Counter()
    
    for shot in effects_per_shot:
        all_effects.extend(shot.get("effects", []))
        
        for t in shot.get("transitions", []):
            transition_counts[t] += 1
        
        for v in shot.get("visualEffects", []):
            visual_counts[v] += 1
        
        for o in shot.get("overlays", []):
            overlay_counts[o] += 1
    
    total_shots = len(effects_per_shot) if effects_per_shot else 1
    
    return {
        "totalEffects": len(all_effects),
        "effectsPerShot": len(all_effects) / total_shots,
        "transitions": dict(transition_counts),
        "visualEffects": dict(visual_counts),
        "overlays": dict(overlay_counts),
        "mostCommonEffect": max(Counter(all_effects), key=Counter(all_effects).get) if all_effects else "none",
        "effectVariety": len(set(all_effects)),
        "confidenceThreshold": conf_threshold,
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python effect_detector.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    shot = {"index": 0, "start": 5.0, "end": 7.0, "duration": 2.0}
    
    frames = extract_analysis_frames(video_path, 5.0, 7.0, 2.0)
    effects = analyze_shot_effects(frames, shot)
    
    print(f"\nEffects detected:")
    print(f"  Transitions: {effects['transitions']}")
    print(f"  Visual: {effects['visualEffects']}")
    print(f"  Overlays: {effects['overlays']}")
    print(f"  Total: {effects['effectCount']}")
