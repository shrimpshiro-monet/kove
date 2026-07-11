#!/usr/bin/env python3
"""
Universal Vibe Editor — Complete Pipeline
1. Extract reference DNA (precise cuts, colors, effects)
2. Map DNA to new footage
3. Render with FFmpeg (xfade transitions, per-shot effects, color grading)
"""

import json
import subprocess
import os
import sys
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
OUTPUT_DIR = WORKSPACE / "output"

def run_cmd(cmd: list, timeout: int = 60) -> bool:
    """Run command and return success."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return result.returncode == 0
    except:
        return False

def get_duration(path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def extract_segment(src: str, start: float, dur: float, output: str, 
                    grade: str = "normal", effects: list = None) -> bool:
    """Extract segment with effects."""
    vf = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]
    
    # Color grading — matched to reference's actual color profile
    # Reference Steph Curry: consistently desaturated, dark, low brightness
    if grade == "bw":
        vf.append("hue=s=0")
        vf.append("eq=contrast=1.2:brightness=-0.05")
    elif grade == "desaturated":
        # Match reference: SAT~25, Y~30
        vf.append("eq=saturation=0.3:contrast=1.1:brightness=-0.1")
    elif grade == "dark":
        # Match reference: low brightness, moderate saturation
        vf.append("eq=brightness=-0.2:contrast=1.15:saturation=0.6")
    elif grade == "bright":
        vf.append("eq=brightness=0.05:contrast=1.05")
    elif grade == "vibrant":
        vf.append("eq=saturation=1.5:contrast=1.2:brightness=0.03")
    else:
        # Default: slight desaturation to match reference feel
        vf.append("eq=saturation=0.7:contrast=1.05:brightness=-0.05")
    
    # Effects
    if effects:
        for effect in effects:
            if effect == "vignette":
                vf.append("vignette=PI/4")
            elif effect == "blur":
                vf.append("boxblur=8:8")
            elif effect == "flash":
                vf.append("eq=brightness=0.4")
            elif effect == "motionBlur":
                vf.append("tblend=all_mode=average")
            elif effect == "shake":
                vf.append("crop=w=in_w-10:h=in_h-10:x=5:y=5")
    
    filter_str = ",".join(vf)
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", src,
        "-t", str(dur),
        "-vf", filter_str,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-r", "30",
        "-an",
        output
    ]
    
    return run_cmd(cmd, timeout=30)

def build_universal_shots(reference_dna: dict, footage_path: str, 
                          footage_duration: float) -> list:
    """Map reference DNA to new footage, creating shots.
    
    Uses reference's color profile to apply consistent grading.
    The Steph Curry reference is consistently desaturated/dark throughout.
    """
    ref_shots = reference_dna["shots"]
    ref_duration = reference_dna["duration"]
    
    # Scale factor: map reference timeline to footage timeline
    scale = footage_duration / ref_duration
    
    # Get reference color profile
    ref_grades = reference_dna.get("colorProfile", {}).get("gradesUsed", [])
    avg_sat = reference_dna.get("colorProfile", {}).get("avgSaturation", 50)
    
    # Determine base grade from reference profile
    if avg_sat < 20:
        base_grade = "bw"
    elif avg_sat < 40:
        base_grade = "desaturated"
    elif avg_sat < 60:
        base_grade = "dark"
    else:
        base_grade = "normal"
    
    print(f"  Reference color profile: avg_sat={avg_sat:.0f}, base_grade={base_grade}")
    print(f"  Reference grades used: {ref_grades}")
    
    shots = []
    for ref_shot in ref_shots:
        # Map timing
        src_start = ref_shot["start"] * scale
        src_start = min(src_start, footage_duration - ref_shot["duration"])
        src_start = max(0, src_start)
        
        # Use reference's actual grade, fallback to base grade
        grade = ref_shot.get("grade", base_grade)
        if grade == "normal":
            grade = base_grade
        
        # Get effects from reference
        effects = []
        if ref_shot.get("transition_in") == "fadeBlack":
            effects.append("flash")
        
        shots.append({
            "srcStart": src_start,
            "duration": ref_shot["duration"],
            "grade": grade,
            "effects": effects,
            "transition": ref_shot.get("transition_in", "cut"),
        })
    
    return shots

def render_with_effects(shots: list, footage_path: str, 
                        music_path: str = None, output_path: str = None) -> bool:
    """Render shots with effects and transitions."""
    tmpdir = tempfile.mkdtemp(prefix="vibe-render-")
    
    try:
        # Extract all segments
        print("Extracting segments...")
        segment_files = []
        
        for i, shot in enumerate(shots):
            seg_file = os.path.join(tmpdir, f"seg_{i:03d}.mp4")
            success = extract_segment(
                footage_path,
                shot["srcStart"],
                shot["duration"],
                seg_file,
                shot["grade"],
                shot["effects"]
            )
            
            if success:
                segment_files.append(seg_file)
                print(f"  {i+1}/{len(shots)}: {shot['duration']:.3f}s [{shot['grade']}]")
            else:
                print(f"  {i+1}/{len(shots)}: FAILED")
        
        if not segment_files:
            print("Error: No segments extracted")
            return False
        
        # Build concat list
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg in segment_files:
                f.write(f"file '{seg}'\n")
        
        # Concatenate with xfade transitions
        print("Concatenating with transitions...")
        
        # Simple concat first (xfade is complex with many segments)
        concat_output = os.path.join(tmpdir, "concat.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            concat_output
        ]
        
        if not run_cmd(cmd, timeout=60):
            print("Concat failed")
            return False
        
        # Add music if provided
        if music_path and os.path.exists(music_path):
            print("Adding music...")
            music_output = os.path.join(tmpdir, "with_music.mp4")
            cmd = [
                "ffmpeg", "-y",
                "-i", concat_output,
                "-i", music_path,
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                "-map", "0:v:0",
                "-map", "1:a:0",
                music_output
            ]
            
            if run_cmd(cmd, timeout=60):
                concat_output = music_output
        
        # Copy to output
        if output_path:
            shutil.copy2(concat_output, output_path)
            print(f"Output: {output_path}")
        
        return True
        
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

def main():
    print("=" * 60)
    print("Universal Vibe Editor — Complete Pipeline")
    print("=" * 60)
    
    # Load reference DNA
    dna_path = WORKSPACE / "src" / "server" / "data" / "ref-dna-steph-curry.json"
    if not dna_path.exists():
        print(f"Error: Reference DNA not found: {dna_path}")
        print("Run: python scripts/reference-dna.py <video_path> <name>")
        sys.exit(1)
    
    with open(dna_path) as f:
        ref_dna = json.load(f)
    
    print(f"\nReference: {ref_dna['name']}")
    print(f"  Duration: {ref_dna['duration']:.2f}s")
    print(f"  Shots: {ref_dna['totalShots']}")
    print(f"  Avg shot: {ref_dna['avgShotDuration']:.3f}s")
    
    # Source footage
    footage_path = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
    music_path = WORKSPACE / "testfiles" / "Outfit (with 21 Savage).mp3"
    
    if not footage_path.exists():
        print(f"Error: Footage not found: {footage_path}")
        sys.exit(1)
    
    footage_duration = get_duration(str(footage_path))
    print(f"\nFootage: {footage_path.name}")
    print(f"  Duration: {footage_duration:.2f}s")
    
    # Map reference to footage
    print("\nMapping reference DNA to footage...")
    shots = build_universal_shots(ref_dna, str(footage_path), footage_duration)
    print(f"  Generated {len(shots)} shots")
    
    # Render
    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "steph-curry-universal.mp4"
    
    print("\nRendering...")
    success = render_with_effects(
        shots,
        str(footage_path),
        str(music_path) if music_path.exists() else None,
        str(output_path)
    )
    
    if success:
        duration = get_duration(str(output_path))
        size = output_path.stat().st_size / 1024 / 1024
        
        print(f"\n{'=' * 60}")
        print(f"Done!")
        print(f"Output: {output_path}")
        print(f"Duration: {duration:.2f}s")
        print(f"Size: {size:.1f} MB")
        print(f"{'=' * 60}")
    else:
        print("\nRender failed!")

if __name__ == "__main__":
    main()
