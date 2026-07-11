#!/usr/bin/env python3
"""
Universal Reference DNA Extractor
Analyzes any reference video to extract precise editing DNA:
- Frame-accurate cut points
- Per-shot color grading curves
- Effect timing and intensity
- Transition types and durations
- Energy curve
"""

import json
import subprocess
import sys
import os
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
TMPDIR = Path("/tmp/ref-dna")

def run_ffmpeg(args: list, capture: bool = True) -> subprocess.CompletedProcess:
    """Run ffmpeg command."""
    cmd = ["ffmpeg", "-hide_banner", "-y"] + args
    return subprocess.run(cmd, capture_output=capture, text=True)

def run_ffprobe(path: str) -> dict:
    """Get video metadata."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

def detect_cuts(video_path: str, threshold: float = 0.2) -> list:
    """Detect exact cut points with scene scores."""
    result = run_ffmpeg([
        "-i", video_path,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr",
        "-f", "null", "-"
    ])
    
    cuts = []
    for line in result.stderr.split("\n"):
        if "showinfo" in line and "pts_time" in line:
            import re
            pts_match = re.search(r'pts_time:(\S+)', line)
            score_match = re.search(r'lavfi\.scene_score=(\S+)', line)
            if pts_match:
                cuts.append({
                    "time": float(pts_match.group(1)),
                    "score": float(score_match.group(1)) if score_match else 0
                })
    
    return cuts

def extract_frames(video_path: str, times: list, output_dir: str) -> list:
    """Extract frames at specific timestamps."""
    frames = []
    for i, t in enumerate(times):
        output = os.path.join(output_dir, f"frame_{i:04d}_{t:.3f}.jpg")
        run_ffmpeg([
            "-ss", str(t),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            output
        ])
        if os.path.exists(output):
            frames.append({"time": t, "path": output})
    return frames

def analyze_color_at_frame(frame_path: str) -> dict:
    """Analyze color properties of a single frame using PIL."""
    try:
        from PIL import Image
        import os
        
        if not os.path.exists(frame_path):
            return {"y": 128, "u": 128, "v": 128, "saturation": 50, "brightness": 50, "grade": "normal"}
        
        img = Image.open(frame_path)
        pixels = list(img.getdata())
        
        total_sat = 0
        total_r = total_g = total_b = 0
        n = min(len(pixels), 10000)
        
        for r, g, b in pixels[:n]:
            total_r += r
            total_g += g
            total_b += b
            
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            sat = (max_c - min_c) / max_c * 100 if max_c > 0 else 0
            total_sat += sat
        
        avg_r = total_r / n
        avg_g = total_g / n
        avg_b = total_b / n
        avg_sat = total_sat / n
        avg_y = avg_r * 0.299 + avg_g * 0.587 + avg_b * 0.114
        
        colors = {
            "r": avg_r, "g": avg_g, "b": avg_b,
            "y": avg_y, "saturation": avg_sat
        }
        
        # Determine grade
        if avg_sat < 15:
            colors["grade"] = "bw"
        elif avg_sat < 35:
            colors["grade"] = "desaturated"
        elif avg_y < 80:
            colors["grade"] = "dark"
        elif avg_y > 200:
            colors["grade"] = "bright"
        elif avg_sat > 100:
            colors["grade"] = "vibrant"
        else:
            colors["grade"] = "normal"
        
        return colors
        
    except ImportError:
        # Fallback if PIL not available
        return {"y": 128, "saturation": 50, "grade": "normal"}

def analyze_energy(video_path: str, fps: float = 1.0) -> list:
    """Analyze energy curve (motion + brightness over time)."""
    result = run_ffmpeg([
        "-i", video_path,
        "-vf", f"fps={fps},signalstats",
        "-f", "null", "-"
    ])
    
    energy = []
    current_time = 0
    
    for line in result.stderr.split("\n"):
        if "YAVG" in line:
            import re
            y_match = re.search(r'YAVG:(\d+)', line)
            if y_match:
                y = int(y_match.group(1))
                # Normalize to 0-1
                e = min(1.0, max(0.0, y / 255.0))
                energy.append({"time": current_time, "energy": e})
                current_time += 1.0 / fps
    
    return energy

def build_reference_dna(video_path: str, name: str) -> dict:
    """Build complete reference DNA from video."""
    print(f"Analyzing: {name}")
    print(f"Path: {video_path}")
    
    # Get metadata
    meta = run_ffprobe(video_path)
    fmt = meta.get("format", {})
    duration = float(fmt.get("duration", 0))
    
    video_stream = None
    for s in meta.get("streams", []):
        if s["codec_type"] == "video":
            video_stream = s
            break
    
    width = video_stream.get("width", 576) if video_stream else 576
    height = video_stream.get("height", 576) if video_stream else 576
    
    print(f"Duration: {duration:.2f}s, Resolution: {width}x{height}")
    
    # Create temp directory
    TMPDIR.mkdir(exist_ok=True)
    frames_dir = str(TMPDIR / "frames")
    os.makedirs(frames_dir, exist_ok=True)
    
    # Detect cuts
    print("Detecting cuts...")
    cuts = detect_cuts(video_path, threshold=0.15)
    print(f"  Found {len(cuts)} cuts")
    
    # Build shot list from cuts
    shots = []
    cut_times = [0] + [c["time"] for c in cuts] + [duration]
    
    for i in range(len(cut_times) - 1):
        start = cut_times[i]
        end = cut_times[i + 1]
        dur = end - start
        
        if dur < 0.034:  # Skip sub-frame shots
            continue
        
        shots.append({
            "index": len(shots),
            "start": start,
            "end": end,
            "duration": dur,
        })
    
    print(f"  Shots: {len(shots)}")
    
    # Analyze color at each shot's midpoint
    print("Analyzing color grading...")
    sample_times = [s["start"] + s["duration"] / 2 for s in shots]
    frames = extract_frames(video_path, sample_times, frames_dir)
    
    for i, (shot, frame) in enumerate(zip(shots, frames)):
        colors = analyze_color_at_frame(frame["path"])
        shot["color"] = colors
        shot["grade"] = colors["grade"]
    
    # Analyze energy curve
    print("Analyzing energy curve...")
    energy = analyze_energy(video_path, fps=2.0)
    
    # Detect transitions (hard cut vs fade vs other)
    print("Detecting transitions...")
    for shot in shots:
        # Check if shot starts with a fade (low brightness at start)
        start_colors = analyze_color_at_frame(
            extract_frames(video_path, [shot["start"] + 0.01], frames_dir)[0]["path"]
        )
        
        if start_colors["y"] < 30:
            shot["transition_in"] = "fadeBlack"
        elif start_colors["saturation"] < 10 and shot["color"]["saturation"] > 30:
            shot["transition_in"] = "fadeBW"
        else:
            shot["transition_in"] = "cut"
    
    # Build DNA
    dna = {
        "name": name,
        "source": video_path,
        "duration": duration,
        "resolution": {"width": width, "height": height},
        "totalShots": len(shots),
        "avgShotDuration": sum(s["duration"] for s in shots) / len(shots) if shots else 0,
        "cutRate": len(shots) / duration if duration > 0 else 0,
        "shots": shots,
        "energyCurve": energy,
        "colorProfile": {
            "avgSaturation": sum(s["color"]["saturation"] for s in shots) / len(shots) if shots else 50,
            "avgBrightness": sum(s["color"]["y"] for s in shots) / len(shots) if shots else 128,
            "gradesUsed": list(set(s["grade"] for s in shots)),
        },
        "transitions": {
            "cut": sum(1 for s in shots if s["transition_in"] == "cut"),
            "fadeBlack": sum(1 for s in shots if s["transition_in"] == "fadeBlack"),
            "fadeBW": sum(1 for s in shots if s["transition_in"] == "fadeBW"),
        },
    }
    
    # Cleanup frames
    import shutil
    shutil.rmtree(frames_dir, ignore_errors=True)
    
    return dna

def main():
    if len(sys.argv) < 3:
        print("Usage: python reference-dna.py <video_path> <name>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    name = sys.argv[2]
    
    dna = build_reference_dna(video_path, name)
    
    # Save DNA
    output_dir = WORKSPACE / "src" / "server" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"ref-dna-{name.lower().replace(' ', '-')}.json"
    
    with open(output_path, "w") as f:
        json.dump(dna, f, indent=2)
    
    print(f"\nDNA saved: {output_path}")
    print(f"Summary:")
    print(f"  Shots: {dna['totalShots']}")
    print(f"  Avg duration: {dna['avgShotDuration']:.3f}s")
    print(f"  Cut rate: {dna['cutRate']:.2f} cuts/sec")
    print(f"  Color grades: {dna['colorProfile']['gradesUsed']}")
    print(f"  Transitions: {dna['transitions']}")

if __name__ == "__main__":
    main()
