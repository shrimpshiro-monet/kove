"""
Color Analyzer
Advanced color analysis using k-means clustering for dominant palette extraction.
Replaces crude average RGB with proper colorist-level analysis.

Deterministic: uses fixed seed and evenly-spaced centroid initialization.
"""

import subprocess
import json
import os
import tempfile
import numpy as np
from typing import List, Dict, Tuple
from collections import Counter

try:
    from PIL import Image
except ImportError:
    raise ImportError("PIL required for color analyzer. Install with: pip install Pillow")

# Fixed seed for deterministic results
SEED = 42

def analyze_color(video_path: str, sample_rate: float = 2.0) -> Dict:
    """
    Analyze color properties of video.
    Returns dominant palette, histograms, and grade classification.
    """
    print("  Analyzing color (k-means clustering)...")
    
    # Extract sample frames
    frames = extract_sample_frames(video_path, sample_rate)
    
    if not frames:
        print("  ERROR: Color analysis failed — 0 frames extracted")
        return get_default_color()
    
    # Analyze each frame
    frame_colors = []
    for frame_path in frames:
        colors = analyze_frame_color(frame_path)
        frame_colors.append(colors)
    
    # Check for empty or all-default results
    default = get_default_color()
    all_defaults = all(
        c.get("grade", "") == default["grade"] and c.get("saturation_mean", 0) == default["saturation_mean"]
        for c in frame_colors
    )
    if not frame_colors or all_defaults:
        print("  ERROR: Color analysis failed — got 0 valid frames or all defaults")
    
    # Aggregate results
    result = aggregate_color_data(frame_colors)
    
    # Cleanup
    for f in frames:
        os.remove(f)
    
    return result

def extract_sample_frames(video_path: str, sample_rate: float = 2.0) -> List[str]:
    """Extract frames at specified rate."""
    tmpdir = tempfile.mkdtemp(prefix="color-")
    frame_pattern = os.path.join(tmpdir, "frame_%04d.jpg")
    
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={sample_rate},scale=64:64",
        "-q:v", "5",
        frame_pattern
    ]
    subprocess.run(cmd, capture_output=True, timeout=60)
    
    frames = sorted([
        os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith(".jpg")
    ])
    
    return frames

def analyze_frame_color(frame_path: str) -> Dict:
    """Analyze color of a single frame using k-means-like clustering."""
    try:
        from PIL import Image
        import numpy as np
        
        img = Image.open(frame_path).convert('RGB')
        pixels = np.array(img).reshape(-1, 3).astype(np.float32)
        
        # Simple k-means clustering (5 clusters)
        k = 5
        centroids = kmeans_simple(pixels, k)
        
        # Count pixels per cluster
        labels = assign_clusters(pixels, centroids)
        counts = Counter(labels)
        total = len(labels)
        
        # Build dominant palette
        palette = []
        for i in range(k):
            r, g, b = centroids[i]
            percentage = counts[i] / total * 100
            palette.append({
                "r": int(r),
                "g": int(g),
                "b": int(b),
                "hex": f"#{int(r):02x}{int(g):02x}{int(b):02x}",
                "percentage": percentage,
            })
        
        # Sort by percentage
        palette.sort(key=lambda x: x["percentage"], reverse=True)
        
        # Calculate statistics
        luminance = 0.299 * pixels[:, 0] + 0.587 * pixels[:, 1] + 0.114 * pixels[:, 2]
        
        # Saturation
        max_c = np.max(pixels, axis=1)
        min_c = np.min(pixels, axis=1)
        saturation = np.where(max_c > 0, (max_c - min_c) / max_c * 100, 0)
        
        # Contrast (std dev of luminance)
        contrast = float(np.std(luminance))
        
        # Black/white points
        black_point = float(np.percentile(luminance, 5))
        white_point = float(np.percentile(luminance, 95))
        
        # Hue distribution
        hue_dist = compute_hue_distribution(pixels)
        
        # Skin tone detection
        skin_tone = detect_skin_tone(pixels)
        
        # Color temperature
        avg_r = float(np.mean(pixels[:, 0]))
        avg_b = float(np.mean(pixels[:, 2]))
        if avg_r > avg_b + 10:
            temp = "warm"
        elif avg_b > avg_r + 10:
            temp = "cool"
        else:
            temp = "neutral"
        
        # Grade classification
        avg_sat = float(np.mean(saturation))
        avg_lum = float(np.mean(luminance))
        
        if avg_sat < 15:
            grade = "bw"
        elif avg_sat < 35:
            grade = "desaturated"
        elif avg_lum < 60:
            grade = "dark"
        elif avg_lum > 200:
            grade = "bright"
        elif avg_sat > 100:
            grade = "vibrant"
        else:
            grade = "normal"
        
        return {
            "dominant_palette": palette[:5],
            "luminance_mean": avg_lum,
            "luminance_std": contrast,
            "contrast": contrast,
            "black_point": black_point,
            "white_point": white_point,
            "saturation_mean": avg_sat,
            "saturation_std": float(np.std(saturation)),
            "hue_distribution": hue_dist,
            "skin_tone": skin_tone,
            "color_temperature": temp,
            "grade": grade,
        }
        
    except ImportError:
        return get_default_color()

def kmeans_simple(pixels: np.ndarray, k: int, max_iters: int = 10) -> np.ndarray:
    """
    Simple k-means clustering with deterministic initialization.
    
    Uses evenly-spaced indices for centroid initialization instead of random.
    This ensures the same input always produces the same output.
    """
    # Deterministic initialization: evenly spaced indices
    n = len(pixels)
    indices = np.linspace(0, n - 1, k).astype(int)
    centroids = pixels[indices].copy()
    
    for _ in range(max_iters):
        # Assign clusters
        labels = assign_clusters(pixels, centroids)
        
        # Update centroids
        new_centroids = np.zeros_like(centroids)
        for i in range(k):
            mask = labels == i
            if mask.any():
                new_centroids[i] = pixels[mask].mean(axis=0)
            else:
                new_centroids[i] = centroids[i]
        
        # Check convergence
        if np.allclose(centroids, new_centroids, atol=1):
            break
        
        centroids = new_centroids
    
    return centroids

def assign_clusters(pixels: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    """Assign each pixel to nearest centroid."""
    import numpy as np
    
    distances = np.linalg.norm(pixels[:, np.newaxis] - centroids, axis=2)
    return np.argmin(distances, axis=1)

def compute_hue_distribution(pixels: np.ndarray) -> Dict[str, float]:
    """Compute hue distribution (0-360 degrees)."""
    import numpy as np
    
    # Convert RGB to HSV
    r, g, b = pixels[:, 0] / 255.0, pixels[:, 1] / 255.0, pixels[:, 2] / 255.0
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    diff = max_c - min_c
    
    # Hue
    hue = np.zeros(len(pixels))
    mask_r = (max_c == r) & (diff > 0)
    mask_g = (max_c == g) & (diff > 0)
    mask_b = (max_c == b) & (diff > 0)
    
    hue[mask_r] = 60 * ((g[mask_r] - b[mask_r]) / diff[mask_r] % 6)
    hue[mask_g] = 60 * ((b[mask_g] - r[mask_g]) / diff[mask_g] + 2)
    hue[mask_b] = 60 * ((r[mask_b] - g[mask_b]) / diff[mask_b] + 4)
    
    # Convert to degrees
    hue = (hue + 360) % 360
    
    # Categorize
    categories = {
        "red": 0, "orange": 0, "yellow": 0, "green": 0,
        "cyan": 0, "blue": 0, "purple": 0, "pink": 0,
    }
    
    for h in hue:
        if h < 15 or h >= 345:
            categories["red"] += 1
        elif h < 45:
            categories["orange"] += 1
        elif h < 75:
            categories["yellow"] += 1
        elif h < 165:
            categories["green"] += 1
        elif h < 195:
            categories["cyan"] += 1
        elif h < 255:
            categories["blue"] += 1
        elif h < 285:
            categories["purple"] += 1
        else:
            categories["pink"] += 1
    
    # Normalize to percentages
    total = len(hue)
    return {k: v / total * 100 for k, v in categories.items()}

def detect_skin_tone(pixels: np.ndarray) -> Dict[str, float]:
    """Detect skin tone range in image."""
    import numpy as np
    
    # Simple skin tone detection (YCbCr space)
    r, g, b = pixels[:, 0].astype(float), pixels[:, 1].astype(float), pixels[:, 2].astype(float)
    
    # Convert to YCbCr
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.169 * r - 0.331 * g + 0.500 * b
    cr = 128 + 0.500 * r - 0.419 * g - 0.081 * b
    
    # Skin tone ranges (approximate)
    skin_mask = (
        (y > 80) & (y < 230) &
        (cb > 85) & (cb < 135) &
        (cr > 130) & (cr < 175)
    )
    
    skin_percentage = float(skin_mask.sum() / len(skin_mask) * 100)
    
    return {
        "presence": skin_percentage,
        "is_present": skin_percentage > 5,
    }

def aggregate_color_data(frame_colors: List[Dict]) -> Dict:
    """Aggregate color data across all frames."""
    if not frame_colors:
        return get_default_color()
    
    # Average statistics
    avg_sat = sum(c.get("saturation_mean", 50) for c in frame_colors) / len(frame_colors)
    avg_lum = sum(c.get("luminance_mean", 128) for c in frame_colors) / len(frame_colors)
    avg_contrast = sum(c.get("contrast", 0) for c in frame_colors) / len(frame_colors)
    
    # Most common grade
    grades = [c.get("grade", "normal") for c in frame_colors]
    most_common_grade = Counter(grades).most_common(1)[0][0]
    
    # Most common temperature
    temps = [c.get("color_temperature", "neutral") for c in frame_colors]
    most_common_temp = Counter(temps).most_common(1)[0][0]
    
    # Merge dominant palettes
    all_palette = []
    for c in frame_colors:
        all_palette.extend(c.get("dominant_palette", [])[:3])
    
    # Count palette occurrences
    palette_counts = Counter()
    for color in all_palette:
        hex_key = color.get("hex", "#000000")
        palette_counts[hex_key] = palette_counts.get(hex_key, 0) + 1
    
    # Top 5 colors
    top_colors = palette_counts.most_common(5)
    dominant_palette = []
    for hex_color, count in top_colors:
        for c in all_palette:
            if c.get("hex") == hex_color:
                dominant_palette.append({
                    **c,
                    "percentage": count / len(frame_colors) * 33
                })
                break
    
    return {
        "dominant_palette": dominant_palette,
        "contrast": avg_contrast,
        "black_point": sum(c.get("black_point", 0) for c in frame_colors) / len(frame_colors),
        "white_point": sum(c.get("white_point", 255) for c in frame_colors) / len(frame_colors),
        "saturation_mean": avg_sat,
        "luminance_mean": avg_lum,
        "color_temperature": most_common_temp,
        "grade": most_common_grade,
        "skin_tone": frame_colors[0].get("skin_tone", {"presence": 0, "is_present": False}),
    }

def get_default_color() -> Dict:
    """Return default color analysis."""
    return {
        "dominant_palette": [],
        "contrast": 0,
        "black_point": 0,
        "white_point": 255,
        "saturation_mean": 50,
        "luminance_mean": 128,
        "color_temperature": "neutral",
        "grade": "normal",
        "skin_tone": {"presence": 0, "is_present": False},
    }

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python color_analyzer.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    result = analyze_color(video_path)
    
    print(f"\nColor Analysis:")
    print(f"  Grade: {result['grade']}")
    print(f"  Temperature: {result['color_temperature']}")
    print(f"  Saturation: {result['saturation_mean']:.1f}")
    print(f"  Contrast: {result['contrast']:.1f}")
    print(f"  Black point: {result['black_point']:.1f}")
    print(f"  White point: {result['white_point']:.1f}")
    print(f"  Dominant palette:")
    for color in result["dominant_palette"][:3]:
        print(f"    {color['hex']} ({color['percentage']:.1f}%)")
