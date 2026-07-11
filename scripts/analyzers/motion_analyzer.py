"""
Motion Analyzer
Computes real optical flow magnitude for true editing energy.
Uses cv2.calcOpticalFlowFarneback (dense flow) as primary method.
Falls back to frame difference if cv2 is unavailable.
"""

import subprocess
import re
import json
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


def analyze_motion(video_path: str, fps: float = 10.0) -> List[Dict]:
    """
    Analyze motion using cv2 Farneback optical flow.
    Returns per-frame motion magnitude (0-1 scale).
    """
    print("  Analyzing motion (Farneback optical flow)...")
    
    # Try cv2 optical flow first
    try:
        motion_data = analyze_motion_optical_flow(video_path, fps)
        if motion_data:
            return motion_data
    except ImportError:
        logger.warning("cv2 not available, falling back to frame difference")
    except Exception as e:
        logger.warning(f"Optical flow failed: {e}, falling back to frame difference")
    
    # Fallback to frame difference
    return analyze_motion_frame_diff(video_path, fps)


def analyze_motion_optical_flow(video_path: str, fps: float = 10.0) -> List[Dict]:
    """
    Real optical flow using cv2.calcOpticalFlowFarneback.
    
    Computes dense flow between consecutive frames, then:
    1. magnitude = sqrt(flow_x^2 + flow_y^2) per pixel
    2. mean magnitude per frame
    3. Normalize to 0-1 (cap at 20 pixels/frame)
    
    Returns list of dicts: [{"time": float, "magnitude": float, "flow_method": "farneback"}]
    """
    import cv2
    import numpy as np
    import tempfile
    import os
    import shutil
    
    tmpdir = tempfile.mkdtemp(prefix="flow-")
    frame_pattern = os.path.join(tmpdir, "frame_%04d.jpg")
    
    # Extract frames
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={fps},scale=320:240",
        "-q:v", "5",
        frame_pattern
    ]
    subprocess.run(cmd, capture_output=True, timeout=120)
    
    # Read frames
    frames = []
    times = []
    i = 1
    while True:
        frame_path = os.path.join(tmpdir, f"frame_{i:04d}.jpg")
        if not os.path.exists(frame_path):
            break
        
        try:
            img = cv2.imread(frame_path, cv2.IMREAD_GRAYSCALE)
            if img is not None:
                frames.append(img)
                times.append(i / fps)
        except Exception as e:
            print(f"    Warning: Could not read frame {i}: {e}")
        
        i += 1
    
    shutil.rmtree(tmpdir, ignore_errors=True)
    
    if len(frames) < 2:
        return []
    
    print(f"    Read {len(frames)} frames, computing optical flow...")
    
    # Compute optical flow between consecutive frames
    motion_data = []
    
    # Farneback parameters (from OpenCV docs)
    # pyr_scale=0.5, levels=3, winsize=15, iterations=3, poly_n=5, poly_sigma=1.2, flags=0
    prev_gray = frames[0]
    
    for i in range(1, len(frames)):
        curr_gray = frames[i]
        time = times[i] if i < len(times) else i / fps
        
        # Compute dense optical flow
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray,
            None,           # flow output
            pyr_scale=0.5,  # pyramid scale
            levels=3,       # pyramid levels
            winsize=15,     # averaging window size
            iterations=3,   # iterations per pyramid level
            poly_n=5,       # pixel neighborhood for polynomial expansion
            poly_sigma=1.2, # gaussian std for polynomial expansion
            flags=0         # flags
        )
        
        # Compute magnitude: sqrt(flow_x^2 + flow_y^2) per pixel
        magnitude = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
        
        # Mean magnitude across all pixels
        mean_mag = float(magnitude.mean())
        
        # Normalize to 0-1 (cap at 20 pixels/frame)
        # At 320x240, 20px motion is substantial (~6% of frame width)
        normalized = min(1.0, mean_mag / 20.0)
        
        motion_data.append({
            "time": time,
            "magnitude": normalized,
            "raw_magnitude": mean_mag,
            "flow_method": "farneback",
        })
        
        prev_gray = curr_gray
    
    print(f"    Computed flow for {len(motion_data)} frame pairs")
    return motion_data


def analyze_motion_frame_diff(video_path: str, fps: float = 10.0) -> List[Dict]:
    """
    Fallback motion analysis using frame difference.
    Computes average absolute difference between consecutive frames.
    
    WARNING: This conflates lighting changes, compression artifacts,
    and cuts with actual motion. Use optical flow when possible.
    """
    print("    Using frame difference fallback (less accurate)...")
    
    import numpy as np
    import tempfile
    import os
    import shutil
    from PIL import Image
    
    tmpdir = tempfile.mkdtemp(prefix="motion-")
    frame_pattern = os.path.join(tmpdir, "frame_%04d.jpg")
    
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={fps},scale=160:120",
        "-q:v", "5",
        frame_pattern
    ]
    subprocess.run(cmd, capture_output=True, timeout=120)
    
    # Read all frames
    frames = []
    times = []
    i = 1
    while True:
        frame_path = os.path.join(tmpdir, f"frame_{i:04d}.jpg")
        if not os.path.exists(frame_path):
            break
        
        try:
            img = Image.open(frame_path).convert('L')
            arr = np.array(img, dtype=np.float32)
            frames.append(arr)
            times.append(i / fps)
        except Exception as e:
            print(f"    Warning: Could not read frame {i}: {e}")
        
        i += 1
    
    shutil.rmtree(tmpdir, ignore_errors=True)
    
    if len(frames) < 2:
        return []
    
    motion_data = []
    for i in range(1, len(frames)):
        diff = np.abs(frames[i] - frames[i-1]).mean()
        time = times[i] if i < len(times) else i / fps
        
        # Normalize to 0-1 (cap at 30 for frame diff)
        magnitude = min(1.0, diff / 30.0)
        
        motion_data.append({
            "time": time,
            "magnitude": magnitude,
            "raw_diff": float(diff),
            "flow_method": "frame_diff",
        })
    
    return motion_data


def compute_motion_stats(motion_data: List[Dict]) -> Dict:
    """Compute statistics from motion data."""
    if not motion_data:
        return {
            "avg_magnitude": 0.0,
            "peak_magnitude": 0.0,
            "variance": 0.0,
            "peak_time": 0.0,
            "high_motion_segments": [],
            "flow_method": "none",
        }
    
    magnitudes = [m["magnitude"] for m in motion_data]
    avg = sum(magnitudes) / len(magnitudes)
    peak = max(magnitudes)
    peak_time = motion_data[magnitudes.index(peak)]["time"]
    
    # Compute variance
    variance = sum((m - avg) ** 2 for m in magnitudes) / len(magnitudes)
    
    # Find high motion segments (above 1.5x average)
    threshold = avg * 1.5
    high_motion = []
    in_segment = False
    segment_start = 0
    
    for m in motion_data:
        if m["magnitude"] > threshold:
            if not in_segment:
                segment_start = m["time"]
                in_segment = True
        else:
            if in_segment:
                high_motion.append({
                    "start": segment_start,
                    "end": m["time"],
                    "duration": m["time"] - segment_start,
                })
                in_segment = False
    
    # Detect flow method from data
    flow_method = motion_data[0].get("flow_method", "unknown") if motion_data else "none"
    
    return {
        "avg_magnitude": avg,
        "peak_magnitude": peak,
        "peak_time": peak_time,
        "variance": variance,
        "high_motion_segments": high_motion,
        "flow_method": flow_method,
        "motion_curve": motion_data,
    }


def classify_camera_motion(motion_data: List[Dict], shot_duration: float) -> str:
    """
    Classify dominant camera motion from motion vectors.
    
    Thresholds tuned for Farneback optical flow (0-1 normalized scale):
    - Static: avg < 0.01 (nearly no pixel movement)
    - Pan: avg 0.01-0.08 (moderate consistent motion)
    - Tracking: avg 0.08-0.20 (significant consistent motion)
    - Handheld: variance > 0.002 (inconsistent motion pattern)
    
    For frame_diff fallback, these thresholds will be less accurate
    since frame_diff conflates lighting with motion.
    """
    if not motion_data or len(motion_data) < 3:
        return "static"
    
    magnitudes = [m["magnitude"] for m in motion_data]
    avg_mag = sum(magnitudes) / len(magnitudes)
    
    # Compute variance for handheld detection
    variance = sum((m - avg_mag) ** 2 for m in magnitudes) / len(magnitudes)
    
    # Check flow method for threshold adjustment
    flow_method = motion_data[0].get("flow_method", "unknown")
    
    if flow_method == "farneback":
        # Farneback thresholds (calibrated against Curry reference)
        # Curry avg_magnitude: ~0.35-0.45 range
        
        # Static: very little motion
        if avg_mag < 0.01:
            return "static"
        
        # Handheld: high variance in motion
        if variance > 0.002:
            return "handheld"
        
        # Tracking: significant, consistent motion
        if avg_mag > 0.08:
            return "tracking"
        
        # Pan: moderate motion
        return "pan"
    
    else:
        # Frame_diff thresholds (legacy, less accurate)
        # These were calibrated against inflated frame-diff values
        
        # Static: very little motion
        if avg_mag < 0.05:
            return "static"
        
        # Handheld: high variance
        if variance > 0.01:
            return "handheld"
        
        # Tracking: significant motion
        if avg_mag > 0.2:
            return "tracking"
        
        # Pan: moderate motion
        return "pan"


def classify_subject_motion(motion_data: List[Dict], shot_duration: float) -> str:
    """
    Classify subject motion from motion intensity patterns.
    
    Thresholds tuned for Farneback optical flow (0-1 normalized scale):
    - Standing: avg < 0.02
    - Walking: avg 0.02-0.08
    - Running/Celebrating: avg > 0.08 or peak > 0.15
    
    For frame_diff fallback, thresholds are adjusted upward.
    """
    if not motion_data:
        return "standing"
    
    magnitudes = [m["magnitude"] for m in motion_data]
    avg_mag = sum(magnitudes) / len(magnitudes)
    peak_mag = max(magnitudes)
    
    flow_method = motion_data[0].get("flow_method", "unknown")
    
    if flow_method == "farneback":
        # Farneback thresholds
        
        # Very high motion (peak) = running/jumping
        if peak_mag > 0.15:
            return "running"
        
        # High average motion = celebrating/gesturing
        if avg_mag > 0.08:
            return "celebrating"
        
        # Moderate motion = walking/dribbling
        if avg_mag > 0.02:
            return "walking"
        
        # Low motion = standing
        return "standing"
    
    else:
        # Frame_diff thresholds (legacy)
        
        # Very high motion = running/jumping
        if peak_mag > 0.5:
            return "running"
        
        # High motion = celebrating/gesturing
        if avg_mag > 0.2:
            return "celebrating"
        
        # Moderate motion = walking/dribbling
        if avg_mag > 0.1:
            return "walking"
        
        # Low motion = standing
        return "standing"


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python motion_analyzer.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    motion_data = analyze_motion(video_path)
    stats = compute_motion_stats(motion_data)
    
    print(f"\nMotion Analysis:")
    print(f"  Method: {stats['flow_method']}")
    print(f"  Avg magnitude: {stats['avg_magnitude']:.4f}")
    print(f"  Peak magnitude: {stats['peak_magnitude']:.4f}")
    print(f"  Peak time: {stats['peak_time']:.2f}s")
    print(f"  Variance: {stats['variance']:.6f}")
    print(f"  High motion segments: {len(stats['high_motion_segments'])}")
