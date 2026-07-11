#!/usr/bin/env python3
"""
Steph Curry 1:1 Edit — FFmpeg xfade Renderer
Uses FFmpeg's native xfade transitions instead of gl-transitions.
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
RAW_FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
MUSIC = WORKSPACE / "testfiles" / "Outfit (with 21 Savage).mp3"
OUTPUT_DIR = WORKSPACE / "output"

def get_video_duration(path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def extract_segment(src: str, start: float, duration: float, output: str,
                    grade: str = "normal") -> bool:
    """Extract a segment with optional color grading."""
    
    # Build filter chain
    vf_parts = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]
    
    if grade == "bw":
        vf_parts.append("hue=s=0")
        vf_parts.append("eq=contrast=1.3:brightness=-0.02")
    elif grade == "desaturated":
        vf_parts.append("eq=saturation=0.35:contrast=1.1")
    elif grade == "dark":
        vf_parts.append("eq=brightness=-0.15:contrast=1.2:saturation=0.7")
    elif grade == "vignette":
        vf_parts.append("vignette=PI/4")
    elif grade == "flash":
        vf_parts.append("eq=brightness=0.4")
    elif grade == "blur":
        vf_parts.append("boxblur=8:8")
    elif grade == "motionBlur":
        vf_parts.append("tblend=all_mode=average")
    elif grade == "vibrant":
        vf_parts.append("eq=saturation=1.8:contrast=1.3:brightness=0.05")
    
    vf = ",".join(vf_parts)
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", src,
        "-t", str(duration),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-r", "30",
        "-an",
        output
    ]
    
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=60)
        return True
    except subprocess.CalledProcessError as e:
        print(f"  Warning: Failed segment: {e}")
        return False

def build_shot_list():
    """Build shot list from reference analysis."""
    return [
        # (timeline_start, duration, source_start, grade, transition_type, transition_dur)
        # ACT 1: Opening broadcast (0-4.8s)
        (0.0,   4.8,   0.0,   "normal",    "none", 0),
        
        # ACT 2: Rapid cuts (4.8-7.9s)
        (4.8,   1.3,   4.8,   "normal",    "fade", 0.05),
        (6.1,   0.034, 6.1,   "flash",     "none", 0),
        (6.134, 0.7,   6.134, "normal",    "fade", 0.03),
        (6.834, 0.6,   6.834, "vignette",  "fade", 0.03),
        (7.434, 0.034, 7.434, "blur",      "fadeBlack", 0.05),
        (7.468, 0.034, 7.468, "bw",        "none", 0),
        
        # ACT 3: Biography section (7.9-10.3s)
        (7.502, 0.9,   7.502, "bw",        "fade", 0.05),
        (8.402, 1.4,   8.402, "desaturated","fade", 0.05),
        (9.802, 0.034, 9.802, "blur",      "fadeBlack", 0.05),
        (9.836, 0.2,   9.836, "bw",        "none", 0),
        
        # ACT 4: Reaction montage (10.0-11.9s)
        (10.036, 0.6,  10.036, "desaturated","fade", 0.03),
        (10.636, 0.4,  10.636, "dark",      "fade", 0.03),
        (11.036, 0.4,  11.036, "dark",      "fade", 0.03),
        
        # ACT 5: Stats & climax (12.0-15.9s)
        (11.436, 0.2,  11.436, "motionBlur", "wipeleft", 0.05),
        (11.636, 0.5,  11.636, "bw",        "fade", 0.03),
        (12.136, 0.9,  12.136, "bw",        "fade", 0.05),
        (13.036, 0.8,  13.036, "bw",        "fade", 0.05),
        (13.836, 0.034, 13.836, "flash",    "none", 0),
        (13.87,  0.6,  13.87,  "vibrant",   "fade", 0.03),
        (14.47,  0.8,  14.47,  "bw",        "fade", 0.05),
        
        # ACT 6: Closing (16.0-19.1s)
        (15.27,  0.034, 15.27, "desaturated","none", 0),
        (15.304, 0.4,  15.304, "desaturated","fade", 0.03),
        (15.704, 0.9,  15.704, "dark",      "fade", 0.05),
        (16.604, 0.5,  16.604, "normal",    "fade", 0.1),
        (17.104, 0.5,  17.104, "normal",    "none", 0),
        (17.604, 0.6,  17.604, "normal",    "fade", 0.1),
    ]

def render_with_xfade(shots, tmpdir):
    """Render using FFmpeg xfade transitions."""
    print("Extracting segments...")
    
    # Extract all segments
    segment_files = []
    for i, (tl_start, dur, src_start, grade, trans_type, trans_dur) in enumerate(shots):
        seg_file = os.path.join(tmpdir, f"seg_{i:03d}.mp4")
        success = extract_segment(str(RAW_FOOTAGE), src_start, dur, seg_file, grade)
        if success:
            segment_files.append((seg_file, dur, trans_type, trans_dur))
            print(f"  {i+1}/{len(shots)}: {dur:.3f}s [{grade}] [{trans_type}]")
        else:
            print(f"  {i+1}/{len(shots)}: FAILED")
    
    if not segment_files:
        print("Error: No segments extracted")
        return None
    
    print(f"\nApplying xfade transitions...")
    
    # Build FFmpeg complex filter for xfade
    # We need to chain xfade filters sequentially
    inputs = []
    filter_parts = []
    
    for i, (seg_file, dur, trans_type, trans_dur) in enumerate(segment_files):
        inputs.extend(["-i", seg_file])
    
    # Build xfade chain
    n = len(segment_files)
    if n == 1:
        # Single segment, no transitions needed
        output_file = segment_files[0][0]
    else:
        # Chain xfade filters
        prev_label = "[0:v]"
        cumulative_offset = 0
        
        for i in range(1, n):
            seg_dur = segment_files[i-1][1]
            trans_type = segment_files[i][2]
            trans_dur = segment_files[i][3]
            
            # Skip very short transitions
            if trans_dur <= 0 or trans_type == "none":
                cumulative_offset += seg_dur
                prev_label = f"[{i}:v]"
                continue
            
            # Map transition type to xfade transition name
            xfade_transition = "fade"
            if trans_type == "fade":
                xfade_transition = "fade"
            elif trans_type == "fadeBlack":
                xfade_transition = "fadeblack"
            elif trans_type == "wipeleft":
                xfade_transition = "wipeleft"
            elif trans_type == "wipeup":
                xfade_transition = "wipeup"
            elif trans_type == "slideright":
                xfade_transition = "slideright"
            elif trans_type == "circleopen":
                xfade_transition = "circleopen"
            elif trans_type == "dissolve":
                xfade_transition = "dissolve"
            
            # Calculate offset (where transition starts)
            offset = cumulative_offset + seg_dur - trans_dur
            
            out_label = f"[xf{i}]"
            filter_parts.append(
                f"{prev_label}[{i}:v]xfade=transition={xfade_transition}:duration={trans_dur}:offset={offset:.3f}{out_label}"
            )
            prev_label = out_label
            cumulative_offset += seg_dur - trans_dur
        
        # Final output label
        final_label = prev_label if filter_parts else f"[0:v]"
        
        # Build complete filter
        filter_complex = ";".join(filter_parts) if filter_parts else None
        
        # Create output
        output_file = os.path.join(tmpdir, "output.mp4")
        
        cmd = ["ffmpeg", "-y"] + inputs
        
        if filter_complex:
            cmd.extend(["-filter_complex", filter_complex])
            cmd.extend(["-map", final_label])
        else:
            # No transitions, just concat
            concat_file = os.path.join(tmpdir, "concat.txt")
            with open(concat_file, "w") as f:
                for seg_file, _, _, _ in segment_files:
                    f.write(f"file '{seg_file}'\n")
            
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_file,
                "-c", "copy",
                output_file
            ]
        
        cmd.extend([
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-r", "30",
            output_file
        ])
        
        print(f"  Running FFmpeg with {len(filter_parts)} xfade transitions...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            print(f"  FFmpeg error: {result.stderr[:500]}")
            # Fallback to simple concat
            print("  Falling back to simple concat...")
            concat_file = os.path.join(tmpdir, "concat.txt")
            with open(concat_file, "w") as f:
                for seg_file, _, _, _ in segment_files:
                    f.write(f"file '{seg_file}'\n")
            
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_file,
                "-c", "copy",
                output_file
            ]
            subprocess.run(cmd, capture_output=True, check=True, timeout=120)
    
    return output_file

def add_music(video_path: str, output_path: str):
    """Add music track to video."""
    print("Adding music...")
    
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", str(MUSIC),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-map", "0:v:0",
        "-map", "1:a:0",
        output_path
    ]
    
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=120)
        return True
    except subprocess.CalledProcessError as e:
        print(f"  Music add failed: {e}")
        return False

def main():
    print("=" * 60)
    print("Steph Curry 1:1 Edit — FFmpeg xfade Renderer")
    print("=" * 60)
    
    # Get shot list
    shots = build_shot_list()
    total_dur = sum(dur for _, dur, _, _, _, _ in shots)
    print(f"\nShots: {len(shots)}")
    print(f"Target duration: {total_dur:.2f}s")
    
    # Create temp directory
    tmpdir = tempfile.mkdtemp(prefix="steph-xfade-")
    
    try:
        # Render segments with transitions
        video_only = render_with_xfade(shots, tmpdir)
        
        if not video_only:
            print("Error: Render failed")
            return
        
        # Add music
        OUTPUT_DIR.mkdir(exist_ok=True)
        output_path = OUTPUT_DIR / "steph-curry-xfade.mp4"
        
        if add_music(video_only, str(output_path)):
            duration = get_video_duration(str(output_path))
            size = output_path.stat().st_size / 1024 / 1024
            
            print(f"\n{'=' * 60}")
            print(f"Done! Output: {output_path}")
            print(f"Duration: {duration:.2f}s")
            print(f"Size: {size:.1f} MB")
            print(f"{'=' * 60}")
        else:
            # Just use video without music
            shutil.copy2(video_only, str(output_path))
            print(f"\nOutput (no music): {output_path}")
    
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

if __name__ == "__main__":
    main()
