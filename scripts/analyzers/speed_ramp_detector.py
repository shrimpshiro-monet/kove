"""
Speed Ramp Detector
Detects speed changes in video:
- Slow motion (0.25x - 0.75x)
- Normal (0.9x - 1.1x)
- Fast motion (1.25x - 3x)
- Speed ramps (gradual changes)
- Ramp points (where speed changes)
"""

import subprocess
import os
import tempfile
import numpy as np
from typing import Dict, List, Tuple
from collections import Counter

def detect_speed_ramps(video_path: str, shots: list) -> List[Dict]:
    """
    Detect speed ramps for each shot.
    Returns per-shot speed analysis.
    """
    print("  Detecting speed ramps...")
    
    speed_per_shot = []
    
    for i, shot in enumerate(shots):
        # Analyze shot speed
        shot_speed = analyze_shot_speed(video_path, shot)
        shot_speed["shotIndex"] = shot["index"]
        shot_speed["time"] = shot["start"]
        
        speed_per_shot.append(shot_speed)
    
    return speed_per_shot

def analyze_shot_speed(video_path: str, shot: dict) -> Dict:
    """Analyze speed of a single shot."""
    result = {
        "avgSpeed": 1.0,
        "speedType": "normal",
        "hasRamp": False,
        "rampPoints": [],
        "speedCurve": [],
    }
    
    try:
        # Extract motion data for this shot
        motion_data = extract_motion_for_speed(video_path, shot["start"], shot["end"])
        
        if len(motion_data) < 3:
            return result
        
        # Analyze motion pattern
        magnitudes = [m["magnitude"] for m in motion_data]
        times = [m["time"] for m in motion_data]
        
        # Calculate speed indicators
        # 1. Motion consistency (low variance = constant speed)
        variance = np.var(magnitudes)
        
        # 2. Motion magnitude (high = fast, low = slow)
        avg_magnitude = np.mean(magnitudes)
        
        # 3. Motion changes (gradual changes = ramp)
        diffs = np.diff(magnitudes)
        max_change = np.max(np.abs(diffs))
        
        # Determine speed type
        if avg_magnitude < 0.03:
            speed_type = "slow_motion"
            avg_speed = 0.5
        elif avg_magnitude < 0.08:
            speed_type = "slow"
            avg_speed = 0.75
        elif avg_magnitude < 0.15:
            speed_type = "normal"
            avg_speed = 1.0
        elif avg_magnitude < 0.25:
            speed_type = "fast"
            avg_speed = 1.5
        else:
            speed_type = "very_fast"
            avg_speed = 2.0
        
        # Detect ramp (gradual speed change)
        has_ramp = False
        ramp_points = []
        
        if len(magnitudes) > 5:
            # Check for linear trend
            x = np.arange(len(magnitudes))
            slope = np.polyfit(x, magnitudes, 1)[0]
            
            # If significant slope, it's a ramp
            if abs(slope) > 0.005:
                has_ramp = True
                
                # Find ramp direction
                if slope > 0:
                    ramp_type = "speed_up"
                else:
                    ramp_type = "slow_down"
                
                # Find ramp points (where speed changes significantly)
                threshold = np.std(diffs) * 1.5
                for j, d in enumerate(diffs):
                    if abs(d) > threshold:
                        ramp_points.append({
                            "time": times[j],
                            "from_speed": "slow" if magnitudes[j] < 0.1 else "fast",
                            "to_speed": "slow" if magnitudes[j+1] < 0.1 else "fast",
                        })
        
        # Build speed curve
        speed_curve = []
        for m in motion_data:
            # Map magnitude to speed estimate
            if m["magnitude"] < 0.03:
                speed = 0.5
            elif m["magnitude"] < 0.08:
                speed = 0.75
            elif m["magnitude"] < 0.15:
                speed = 1.0
            elif m["magnitude"] < 0.25:
                speed = 1.5
            else:
                speed = 2.0
            
            speed_curve.append({
                "time": m["time"],
                "speed": speed,
                "magnitude": m["magnitude"],
            })
        
        result = {
            "avgSpeed": avg_speed,
            "speedType": speed_type,
            "hasRamp": has_ramp,
            "rampType": ramp_type if has_ramp else None,
            "rampPoints": ramp_points,
            "speedCurve": speed_curve,
            "variance": float(variance),
            "avgMagnitude": float(avg_magnitude),
        }
        
    except Exception as e:
        pass
    
    return result

def extract_motion_for_speed(video_path: str, start: float, end: float) -> List[Dict]:
    """Extract motion data for speed analysis."""
    import tempfile
    import shutil
    
    tmpdir = tempfile.mkdtemp(prefix="speed-")
    frame_pattern = os.path.join(tmpdir, "frame_%04d.jpg")
    
    duration = end - start
    
    # Extract frames at high fps for precise speed detection
    cmd = [
        "ffmpeg", "-y", "-ss", str(start), "-i", video_path,
        "-t", str(duration),
        "-vf", "fps=10,scale=80:60",
        "-q:v", "5",
        frame_pattern
    ]
    subprocess.run(cmd, capture_output=True, timeout=30)
    
    # Read frames and compute motion
    import numpy as np
    from PIL import Image
    
    frames = []
    i = 1
    while True:
        frame_path = os.path.join(tmpdir, f"frame_{i:04d}.jpg")
        if not os.path.exists(frame_path):
            break
        
        try:
            img = Image.open(frame_path).convert('L')
            arr = np.array(img, dtype=np.float32)
            frames.append(arr)
        except:
            pass
        
        i += 1
    
    # Compute frame differences
    motion_data = []
    for j in range(1, len(frames)):
        diff = np.abs(frames[j] - frames[j-1]).mean()
        time = start + (j / 10.0)  # fps=10
        
        motion_data.append({
            "time": time,
            "magnitude": min(1.0, diff / 30.0),
            "raw_diff": float(diff),
        })
    
    shutil.rmtree(tmpdir, ignore_errors=True)
    
    return motion_data

def aggregate_speed_results(speed_per_shot: List[Dict]) -> Dict:
    """Aggregate speed ramp results across all shots."""
    if not speed_per_shot:
        return {
            "avgSpeed": 1.0,
            "speedDistribution": {},
            "shotsWithRamps": 0,
            "hasSlowMotion": False,
            "hasFastMotion": False,
        }
    
    speeds = [s["avgSpeed"] for s in speed_per_shot]
    speed_types = [s["speedType"] for s in speed_per_shot]
    
    # Speed distribution
    type_counts = Counter(speed_types)
    speed_dist = {k: v / len(speed_types) for k, v in type_counts.items()}
    
    # Ramp detection
    shots_with_ramps = sum(1 for s in speed_per_shot if s.get("hasRamp", False))
    
    return {
        "avgSpeed": np.mean(speeds),
        "speedDistribution": speed_dist,
        "shotsWithRamps": shots_with_ramps,
        "rampRatio": shots_with_ramps / len(speed_per_shot),
        "hasSlowMotion": any(s < 0.75 for s in speeds),
        "hasFastMotion": any(s > 1.25 for s in speeds),
        "hasRamps": shots_with_ramps > 0,
        "dominantSpeed": max(type_counts, key=type_counts.get) if type_counts else "normal",
    }

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python speed_ramp_detector.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    # Create dummy shot
    shot = {"index": 0, "start": 10.0, "end": 12.0, "duration": 2.0}
    
    result = analyze_shot_speed(video_path, shot)
    
    print(f"\nSpeed Analysis:")
    print(f"  Avg speed: {result['avgSpeed']:.2f}x")
    print(f"  Speed type: {result['speedType']}")
    print(f"  Has ramp: {result['hasRamp']}")
    print(f"  Ramp points: {result['rampPoints']}")
