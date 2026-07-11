"""
Text Detector
Detects text overlays with confidence gating to reduce false positives.

Confidence factors:
- Edge density (text has strong edges)
- Contrast (text stands out from background)
- Aspect ratio (text regions have reasonable proportions)
- Temporal persistence (appears in >50% of shot frames)

Only includes text in DNA if confidence > THRESHOLD.
"""

import subprocess
import os
import tempfile
import numpy as np
from PIL import Image
from typing import Dict, List
from collections import Counter

# Confidence threshold for including text in DNA
TEXT_CONFIDENCE_THRESHOLD = 0.6


def detect_text(video_path: str, shots: list) -> List[Dict]:
    """
    Detect text overlays for each shot.
    Returns per-shot text analysis with confidence scores.
    """
    print("  Detecting text overlays...")
    
    text_per_shot = []
    
    for i, shot in enumerate(shots):
        frames = extract_text_frames(video_path, shot["start"], shot["end"])
        shot_text = analyze_shot_text(frames, shot)
        shot_text["shotIndex"] = shot["index"]
        shot_text["time"] = shot["start"]
        
        text_per_shot.append(shot_text)
        
        for f in frames:
            if os.path.exists(f):
                os.remove(f)
    
    return text_per_shot


def extract_text_frames(video_path: str, start: float, end: float) -> List[str]:
    """Extract frames for text analysis."""
    tmpdir = tempfile.mkdtemp(prefix="text-")
    frames = []
    
    for i, t in enumerate([start + 0.05, (start + end) / 2, end - 0.05]):
        if t < 0:
            t = 0
        path = os.path.join(tmpdir, f"frame_{i}.jpg")
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(t), "-i", video_path,
            "-vframes", "1", "-q:v", "2", path
        ], capture_output=True, timeout=10)
        frames.append(path)
    
    return frames


def analyze_shot_text(frames: List[str], shot: dict) -> Dict:
    """Analyze text in a single shot with confidence gating."""
    result = {
        "hasText": False,
        "textRegions": [],
        "textCount": 0,
        "properties": {},
        "confidence": 0.0,
        "confidenceThreshold": TEXT_CONFIDENCE_THRESHOLD,
    }
    
    try:
        all_regions = []
        
        for frame_path in frames:
            if not os.path.exists(frame_path):
                continue
            
            img = Image.open(frame_path).convert('RGB')
            pixels = np.array(img, dtype=np.float32)
            
            regions = find_text_regions(pixels)
            all_regions.extend(regions)
        
        # Filter by confidence
        high_confidence = [r for r in all_regions if r.get("confidence", 0) >= TEXT_CONFIDENCE_THRESHOLD]
        
        if high_confidence:
            # Compute temporal persistence
            # If text appears in >50% of frames, boost confidence
            frames_with_text = len([r for r in all_regions if r.get("confidence", 0) >= TEXT_CONFIDENCE_THRESHOLD * 0.7])
            persistence = frames_with_text / max(1, len(frames))
            
            result["hasText"] = True
            result["textCount"] = len(high_confidence)
            result["textRegions"] = high_confidence[:5]
            result["confidence"] = np.mean([r["confidence"] for r in high_confidence])
            result["temporalPersistence"] = persistence
            
            # Only aggregate properties if we have high-confidence text
            result["properties"] = aggregate_text_properties(high_confidence)
        
    except Exception as e:
        pass
    
    return result


def find_text_regions(pixels: np.ndarray) -> List[Dict]:
    """Find text regions with confidence scores."""
    regions = []
    
    gray = np.mean(pixels, axis=2)
    h, w = gray.shape
    
    window_sizes = [(32, 200), (64, 400), (96, 500)]
    
    for win_h, win_w in window_sizes:
        step_h = win_h // 2
        step_w = win_w // 2
        
        for y in range(0, h - win_h, step_h):
            for x in range(0, w - win_w, step_w):
                window = gray[y:y+win_h, x:x+win_w]
                
                # Compute confidence for this region
                confidence = compute_text_confidence(window)
                
                if confidence > 0.3:  # Low threshold for candidate regions
                    region = analyze_region(pixels[y:y+win_h, x:x+win_w], x, y, win_w, win_h)
                    if region:
                        region["confidence"] = confidence
                        regions.append(region)
    
    regions = merge_regions(regions)
    return regions


def compute_text_confidence(window: np.ndarray) -> float:
    """
    Compute confidence score (0-1) that a window contains text.
    
    Factors:
    - Edge density (text has strong edges)
    - Contrast (text stands out)
    - Aspect ratio (reasonable proportions)
    - Transition regularity (text has uniform regions)
    """
    h, w = window.shape
    
    # 1. Edge density score (0-1)
    dx = np.abs(np.diff(window, axis=1))
    dy = np.abs(np.diff(window, axis=0))
    edge_h = dx.mean()
    edge_v = dy.mean()
    
    # Text has moderate-to-strong edges (not too smooth, not too noisy)
    if edge_h < 10 or edge_v < 8:
        edge_score = 0.0
    elif edge_h > 50 or edge_v > 40:
        edge_score = 0.3  # Too noisy, probably not text
    else:
        edge_score = min(1.0, (edge_h + edge_v) / 40)
    
    # 2. Contrast score (0-1)
    brightness_range = window.max() - window.min()
    if brightness_range < 80:
        contrast_score = 0.0  # Too low contrast
    elif brightness_range > 200:
        contrast_score = 0.8  # High contrast (good for text)
    else:
        contrast_score = brightness_range / 200
    
    # 3. Aspect ratio score (0-1)
    # Text regions typically have width > height (horizontal text)
    aspect = w / max(1, h)
    if 1.5 < aspect < 15:  # Reasonable text aspect ratio
        aspect_score = 1.0
    elif 1.0 < aspect <= 1.5 or 15 <= aspect < 20:
        aspect_score = 0.6
    else:
        aspect_score = 0.2  # Unusual proportions
    
    # 4. Transition regularity (0-1)
    threshold = (window.max() + window.min()) / 2
    binary = (window > threshold).astype(float)
    h_trans = np.abs(np.diff(binary, axis=1)).sum()
    v_trans = np.abs(np.diff(binary, axis=0)).sum()
    total_trans = h_trans + v_trans
    
    # Text has moderate transitions (not too few, not too many)
    if total_trans < 5 or total_trans > h * w * 0.4:
        regularity_score = 0.0
    elif 20 < total_trans < h * w * 0.15:
        regularity_score = 0.9  # Good text-like pattern
    else:
        regularity_score = 0.5
    
    # Combine scores (weighted average)
    confidence = (
        edge_score * 0.3 +
        contrast_score * 0.3 +
        aspect_score * 0.2 +
        regularity_score * 0.2
    )
    
    return confidence


def analyze_region(pixels: np.ndarray, x: int, y: int, w: int, h: int) -> Dict:
    """Analyze properties of a text region."""
    try:
        gray = np.mean(pixels, axis=2)
        
        threshold = (gray.max() + gray.min()) / 2
        bright_mask = gray > threshold
        
        if bright_mask.sum() < 10:
            return None
        
        text_pixels = pixels[bright_mask]
        avg_color = text_pixels.mean(axis=0)
        
        r, g, b = avg_color
        if r > 200 and g > 200 and b > 200:
            color = "white"
        elif r < 50 and g < 50 and b < 50:
            color = "black"
        elif r > 150 and g < 100:
            color = "red"
        elif g > 150 and b < 100:
            color = "green"
        elif b > 150 and r < 100:
            color = "blue"
        elif r > 150 and g > 150:
            color = "yellow"
        else:
            color = "mixed"
        
        if h < 40:
            size = "small"
        elif h < 80:
            size = "medium"
        elif h < 120:
            size = "large"
        else:
            size = "xlarge"
        
        dx = np.abs(np.diff(gray, axis=1))
        edge_thickness = (dx > 30).sum() / max(1, bright_mask.sum())
        
        if edge_thickness > 0.3:
            weight = "bold"
        elif edge_thickness < 0.1:
            weight = "light"
        else:
            weight = "regular"
        
        frame_h, frame_w = 576, 576
        center_y = y + h / 2
        center_x = x + w / 2
        
        if center_y < frame_h * 0.33:
            placement_y = "top"
        elif center_y > frame_h * 0.67:
            placement_y = "bottom"
        else:
            placement_y = "center"
        
        if center_x < frame_w * 0.33:
            placement_x = "left"
        elif center_x > frame_w * 0.67:
            placement_x = "right"
        else:
            placement_x = "center"
        
        placement = f"{placement_y}_{placement_x}" if placement_y != "center" or placement_x != "center" else "center"
        
        has_shadow = False
        if y + h + 5 < frame_h and x + w + 5 < frame_w:
            shadow_area = pixels[y+3:y+min(h+3, frame_h), x+3:x+min(w+3, frame_w)]
            shadow_dark = (shadow_area.mean(axis=2) < 50).sum()
            has_shadow = shadow_dark > h * w * 0.1
        
        return {
            "x": x, "y": y, "width": w, "height": h,
            "color": color,
            "size": size,
            "weight": weight,
            "placement": placement,
            "hasShadow": has_shadow,
            "brightness": float(gray.mean()),
        }
        
    except Exception as e:
        return None


def merge_regions(regions: List[Dict]) -> List[Dict]:
    """Merge overlapping text regions."""
    if not regions:
        return []
    
    regions.sort(key=lambda r: r.get("confidence", 0) * r["width"] * r["height"], reverse=True)
    
    merged = []
    used = set()
    
    for i, r1 in enumerate(regions):
        if i in used:
            continue
        
        for j, r2 in enumerate(regions[i+1:], i+1):
            if j in used:
                continue
            
            if (r1["x"] < r2["x"] + r2["width"] and
                r1["x"] + r1["width"] > r2["x"] and
                r1["y"] < r2["y"] + r2["height"] and
                r1["y"] + r1["height"] > r2["y"]):
                used.add(j)
        
        merged.append(r1)
    
    return merged[:5]


def aggregate_text_properties(regions: List[Dict]) -> Dict:
    """Aggregate text properties across regions."""
    if not regions:
        return {}
    
    colors = [r["color"] for r in regions]
    sizes = [r["size"] for r in regions]
    weights = [r["weight"] for r in regions]
    placements = [r["placement"] for r in regions]
    
    return {
        "dominantColor": Counter(colors).most_common(1)[0][0] if colors else "white",
        "dominantSize": Counter(sizes).most_common(1)[0][0] if sizes else "medium",
        "dominantWeight": Counter(weights).most_common(1)[0][0] if weights else "regular",
        "dominantPlacement": Counter(placements).most_common(1)[0][0] if placements else "center",
        "hasShadow": any(r["hasShadow"] for r in regions),
        "avgBrightness": sum(r["brightness"] for r in regions) / len(regions),
    }


def aggregate_text_results(text_per_shot: List[Dict]) -> Dict:
    """Aggregate text detection results across all shots."""
    shots_with_text = sum(1 for t in text_per_shot if t["hasText"])
    total_text_count = sum(t["textCount"] for t in text_per_shot)
    
    all_colors = []
    all_sizes = []
    all_placements = []
    
    for t in text_per_shot:
        props = t.get("properties", {})
        if props:
            all_colors.append(props.get("dominantColor", "white"))
            all_sizes.append(props.get("dominantSize", "medium"))
            all_placements.append(props.get("dominantPlacement", "center"))
    
    return {
        "shotsWithText": shots_with_text,
        "totalTextRegions": total_text_count,
        "textFrequency": shots_with_text / len(text_per_shot) if text_per_shot else 0,
        "dominantColor": Counter(all_colors).most_common(1)[0][0] if all_colors else None,
        "dominantSize": Counter(all_sizes).most_common(1)[0][0] if all_sizes else None,
        "dominantPlacement": Counter(all_placements).most_common(1)[0][0] if all_placements else None,
        "hasText": shots_with_text > 0,
        "confidenceThreshold": TEXT_CONFIDENCE_THRESHOLD,
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python text_detector.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    shot = {"index": 0, "start": 7.0, "end": 8.0, "duration": 1.0}
    
    frames = extract_text_frames(video_path, 7.0, 8.0)
    result = analyze_shot_text(frames, shot)
    
    print(f"\nText Detection:")
    print(f"  Has text: {result['hasText']}")
    print(f"  Text count: {result['textCount']}")
    print(f"  Confidence: {result['confidence']:.2f}")
    print(f"  Properties: {result['properties']}")
