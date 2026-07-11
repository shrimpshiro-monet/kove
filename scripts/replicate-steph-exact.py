#!/usr/bin/env python3
"""
Steph Curry Reference Edit — 1:1 Replication
Maps the exact shot structure from the reference edit onto raw footage.
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
RAW_FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
REFERENCE = WORKSPACE / "reference-edits-2" / "steph curry.MP4"
OUTPUT_DIR = WORKSPACE / "output"
TMPDIR = Path(tempfile.mkdtemp(prefix="steph-replicate-"))

# ── Exact Shot Map from Reference Analysis ───────────────────────────
# Each shot: (ref_start, ref_duration, shot_type, grade, notes)
REFERENCE_SHOTS = [
    # ACT 1: Opening broadcast footage (0.0s - 4.8s)
    (0.0,  4.8,  "broadcast",  "normal",    "Long continuous broadcast shot with text overlay"),
    
    # ACT 2: Rapid cuts (4.8s - 7.9s)
    (4.8,  1.3,  "broadcast",  "normal",    "Different broadcast angle"),
    (6.1,  0.03, "flash",      "normal",    "Single-frame Curry screaming flash cut"),
    (6.13, 0.7,  "broadcast",  "normal",    "Wide broadcast action"),
    (6.83, 0.6,  "closeup",    "normal",    "Curry celebration close-up"),
    (7.43, 0.03, "flash",      "blur",      "Single-frame blur/flash transition"),
    (7.46, 0.03, "titlecard",  "bw",        "B&W title card STEPEN CURRY"),
    
    # ACT 3: Biography section (7.9s - 10.3s)
    (7.49, 0.9,  "portrait",   "bw",        "B&W portrait with bio text"),
    (8.39, 1.4,  "textcard",   "dark",      "IM NOT YOUR AVERAGE text card with flag"),
    (9.79, 0.03, "flash",      "blur",      "Motion blur transition"),
    (9.82, 0.2,  "flash",      "bw",        "B&W flash callback"),
    
    # ACT 4: Reaction montage (10.0s - 11.9s)
    (10.02, 0.6, "reaction",   "desaturated", "Disbelief reaction"),
    (10.62, 0.4, "action",     "dark",      "Bent over on court"),
    (11.02, 0.4, "celebration","dark",      "Night night celebration"),
    
    # ACT 5: Stats & climax (12.0s - 15.9s)
    (11.42, 0.2, "transition", "wipe",      "Wipe transition"),
    (11.62, 0.5, "action",     "bw",        "Curry clapping B&W"),
    (12.12, 0.9, "stats",      "bw",        "Stats overlay with NIGHT typography"),
    (13.02, 0.8, "closeup",    "bw",        "Night night close-up with text"),
    (13.82, 0.03, "flash",     "normal",    "Flash callback"),
    (13.85, 0.6, "climax",     "color",     "COLOR screaming - emotional peak"),
    (14.45, 0.8, "closeup",    "bw",        "Night night close-up continued"),
    
    # ACT 6: Closing (16.0s - 19.1s)
    (15.25, 0.03, "textcard",  "desaturated", "Text card single frame"),
    (15.28, 0.4, "action",     "desaturated", "Dribbling action"),
    (15.68, 0.9, "celebration","desaturated", "Celebration climax"),
    (16.58, 0.5, "tag",        "black",     "AZRO tag first appearance"),
    (17.08, 0.5, "black",      "black",     "Black pause"),
    (17.58, 0.6, "tag",        "black",     "AZRO tag reappears"),
]

def get_video_duration(path: str) -> float:
    """Get video duration in seconds."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def get_video_info(path: str) -> dict:
    """Get video width, height, fps."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", str(path)],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    for s in data.get("streams", []):
        if s["codec_type"] == "video":
            return {
                "width": s["width"],
                "height": s["height"],
                "fps": s.get("r_frame_rate", "30/1"),
                "codec": s["codec_name"]
            }
    return {}

def extract_segment(src: str, start: float, duration: float, output: str,
                    width: int = 576, height: int = 576, 
                    grade: str = "normal") -> bool:
    """Extract a segment from source video with optional color grading."""
    
    # Ensure minimum duration
    if duration < 1/30:
        # For very short durations, just extract 1 frame and loop
        duration = 1/30
    
    # Build video filter chain
    vf_parts = []
    
    # Scale/pad to target resolution
    vf_parts.append(
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
    )
    
    # Apply color grading
    if grade == "bw":
        vf_parts.append("hue=s=0")
        vf_parts.append("eq=contrast=1.3:brightness=-0.05")
    elif grade == "dark":
        vf_parts.append("eq=brightness=-0.2:contrast=1.2:saturation=0.7")
    elif grade == "desaturated":
        vf_parts.append("eq=saturation=0.4:contrast=1.1")
    elif grade == "color":
        vf_parts.append("eq=saturation=1.5:contrast=1.3:brightness=0.05")
    elif grade == "blur":
        vf_parts.append("boxblur=10:10")
    elif grade == "wipe":
        vf_parts.append("eq=brightness=-0.1:saturation=0.3")
    elif grade == "black":
        pass  # Just black background for tags
    
    vf = ",".join(vf_parts)
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", src,
        "-t", str(duration),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an",
        output
    ]
    
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"  Warning: Failed to extract {start:.2f}s: {e}")
        return False

def create_text_overlay(input_path: str, output_path: str, text: str,
                        fontsize: int = 24, y: str = "center",
                        color: str = "white") -> bool:
    """Add text overlay to video segment."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", f"drawtext=text='{text}':fontsize={fontsize}:fontcolor={color}:x=(w-text_w)/2:y={y}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        output_path
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def create_black_frame(output: str, duration: float, width: int = 576, height: int = 576):
    """Create a black frame/segment."""
    # Ensure minimum duration of 1 frame (1/30 = 0.034s)
    dur = max(duration, 1/30)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d={dur}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-t", str(duration),
        output
    ]
    subprocess.run(cmd, capture_output=True, check=True)

def create_text_frame(output: str, text: str, duration: float,
                      width: int = 576, height: int = 576,
                      fontsize: int = 48, color: str = "white",
                      bg: str = "black"):
    """Create a text frame on solid background (uses drawbox since drawtext may not be available)."""
    dur = max(duration, 1/30)
    # Create a white rectangle in center as placeholder for text
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c={bg}:s={width}x{height}:d={dur}",
        "-vf", f"drawbox=x={width//4}:y={height//2-20}:w={width//2}:h=40:color=white:t=fill",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-t", str(duration),
        output
    ]
    subprocess.run(cmd, capture_output=True, check=True)

def render_edit():
    """Render the complete 1:1 replication."""
    print("=" * 60)
    print("Steph Curry Reference Edit — 1:1 Replication")
    print("=" * 60)
    
    raw_duration = get_video_duration(str(RAW_FOOTAGE))
    ref_duration = get_video_duration(str(REFERENCE))
    raw_info = get_video_info(str(RAW_FOOTAGE))
    
    print(f"Raw footage: {raw_duration:.1f}s, {raw_info.get('width')}x{raw_info.get('height')}")
    print(f"Reference: {ref_duration:.1f}s")
    print(f"Shots to create: {len(REFERENCE_SHOTS)}")
    print()
    
    segment_files = []
    
    for i, (ref_start, ref_dur, shot_type, grade, notes) in enumerate(REFERENCE_SHOTS):
        print(f"Shot {i+1}/{len(REFERENCE_SHOTS)}: {shot_type} ({ref_dur:.2f}s) [{grade}] — {notes}")
        
        # Map reference timing to raw footage
        # The raw footage is ~19.2s and reference is ~19.155s, so 1:1 mapping works
        raw_start = min(ref_start, raw_duration - ref_dur)
        raw_start = max(0, raw_start)
        
        segment_file = str(TMPDIR / f"shot_{i:03d}.mp4")
        
        if shot_type == "black":
            create_black_frame(segment_file, ref_dur)
        elif shot_type == "titlecard":
            create_text_frame(segment_file, "STEPHEN CURRY", ref_dur, fontsize=36)
        elif shot_type == "tag":
            # AZRO tag - create black with text
            create_text_frame(segment_file, "EDIT", ref_dur, fontsize=48, color="white")
        elif shot_type == "textcard":
            create_text_frame(segment_file, "NOT YOUR AVERAGE", ref_dur, fontsize=32)
        else:
            # Extract from raw footage
            success = extract_segment(
                str(RAW_FOOTAGE), raw_start, ref_dur, segment_file,
                grade=grade
            )
            if not success:
                # Fallback: create black frame
                create_black_frame(segment_file, ref_dur)
        
        segment_files.append(segment_file)
    
    print(f"\nExtracted {len(segment_files)} segments")
    
    # Create concat list
    concat_file = str(TMPDIR / "concat.txt")
    with open(concat_file, "w") as f:
        for seg in segment_files:
            f.write(f"file '{seg}'\n")
    
    # Concatenate all segments
    print("Concatenating segments...")
    concat_output = str(TMPDIR / "concat.mp4")
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c", "copy",
        concat_output
    ]
    subprocess.run(concat_cmd, capture_output=True, check=True)
    
    # Verify duration
    final_duration = get_video_duration(concat_output)
    print(f"Concatenated duration: {final_duration:.2f}s (target: {ref_duration:.2f}s)")
    
    # Copy to output
    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "steph-curry-replica.mp4"
    shutil.copy2(concat_output, str(output_path))
    
    print(f"\n{'=' * 60}")
    print(f"Done! Output: {output_path}")
    print(f"Duration: {final_duration:.2f}s")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    try:
        render_edit()
    finally:
        # Cleanup temp directory
        shutil.rmtree(TMPDIR, ignore_errors=True)
