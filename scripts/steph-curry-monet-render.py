#!/usr/bin/env python3
"""
Steph Curry 1:1 Edit — Using Monet's Editly Pipeline
Generates a proper MonetEDL and renders via Editly with real effects.
"""

import json
import os
import subprocess
import sys
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
RAW_FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
REFERENCE = WORKSPACE / "reference-edits-2" / "steph curry.MP4"
OUTPUT_DIR = WORKSPACE / "output"
EDITLY_DIR = WORKSPACE / "editly"

def get_video_duration(path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def get_video_info(path: str) -> dict:
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
            }
    return {}

def build_monet_edl() -> dict:
    """Build a proper MonetEDL matching the Steph Curry reference edit."""
    
    footage_id = "steph-curry-raw"
    
    # Shot map from reference analysis (27 shots)
    # Format: (timeline_start, duration, source_start, grade, effects, transition)
    shots = [
        # ACT 1: Opening broadcast (0-4.8s)
        (0.0,   4.8,   0.0,   "normal",    [], "cut"),
        
        # ACT 2: Rapid cuts (4.8-7.9s)
        (4.8,   1.3,   4.8,   "normal",    [], "cut"),
        (6.1,   0.034, 6.1,   "normal",    ["impact_flash"], "cut"),
        (6.134, 0.7,   6.134, "normal",    [], "cut"),
        (6.834, 0.6,   6.834, "normal",    ["vignette_pro"], "cut"),
        (7.434, 0.034, 7.434, "normal",    ["blur"], "flash"),
        (7.468, 0.034, 7.468, "normal",    ["bw_toggle"], "cut"),
        
        # ACT 3: Biography section (7.9-10.3s)
        (7.502, 0.9,   7.502, "normal",    ["bw_toggle", "vignette_pro"], "cut"),
        (8.402, 1.4,   8.402, "normal",    ["desaturate", "vignette_pro"], "cut"),
        (9.802, 0.034, 9.802, "normal",    ["blur"], "flash"),
        (9.836, 0.2,   9.836, "normal",    ["bw_toggle"], "cut"),
        
        # ACT 4: Reaction montage (10.0-11.9s)
        (10.036, 0.6,  10.036, "normal",   ["desaturate"], "cut"),
        (10.636, 0.4,  10.636, "normal",   ["desaturate", "vignette_pro"], "cut"),
        (11.036, 0.4,  11.036, "normal",   ["desaturate", "vignette_pro"], "cut"),
        
        # ACT 5: Stats & climax (12.0-15.9s)
        (11.436, 0.2,  11.436, "normal",   ["motion_blur"], "whip-pan"),
        (11.636, 0.5,  11.636, "normal",   ["bw_toggle"], "cut"),
        (12.136, 0.9,  12.136, "normal",   ["bw_toggle", "vignette_pro"], "cut"),
        (13.036, 0.8,  13.036, "normal",   ["bw_toggle", "vignette_pro"], "cut"),
        (13.836, 0.034, 13.836, "normal",  ["impact_flash"], "cut"),
        (13.87,  0.6,  13.87,  "normal",   ["color_grade"], "cut"),
        (14.47,  0.8,  14.47,  "normal",   ["bw_toggle", "vignette_pro"], "cut"),
        
        # ACT 6: Closing (16.0-19.1s)
        (15.27,  0.034, 15.27, "normal",   ["desaturate"], "cut"),
        (15.304, 0.4,  15.304, "normal",   ["desaturate"], "cut"),
        (15.704, 0.9,  15.704, "normal",   ["desaturate", "vignette_pro"], "cut"),
        (16.604, 0.5,  16.604, "normal",   [], "cut"),
        (17.104, 0.5,  17.104, "normal",   [], "cut"),
        (17.604, 0.6,  17.604, "normal",   [], "cut"),
    ]
    
    # Build clips array
    clips = []
    for i, (tl_start, dur, src_start, grade, effects, transition) in enumerate(shots):
        clip = {
            "id": f"clip-{i:03d}",
            "mediaId": footage_id,
            "startTime": tl_start,
            "duration": dur,
            "inPoint": src_start,
            "outPoint": src_start + dur,
            "speed": 1.0,
            "transforms": {
                "position": [{"time": 0, "x": 0, "y": 0}],
                "scale": [{"time": 0, "value": 1}],
                "rotation": [{"time": 0, "value": 0}],
            },
            "audio": {"gain": 1},
            "effects": [],
        }
        
        # Add effects
        for effect_type in effects:
            effect = {
                "id": f"effect-{i:03d}-{effect_type}",
                "type": effect_type,
                "start": 0,
                "duration": dur,
                "params": {}
            }
            
            # Set effect-specific params
            if effect_type == "bw_toggle":
                effect["params"] = {"enabled": True}
            elif effect_type == "desaturate":
                effect["params"] = {"amount": 0.7}
            elif effect_type == "impact_flash":
                effect["params"] = {"intensity": 0.8, "duration": 0.1}
            elif effect_type == "vignette_pro":
                effect["params"] = {"intensity": 0.6}
            elif effect_type == "color_grade":
                effect["params"] = {"saturation": 1.5, "contrast": 1.3}
            elif effect_type == "blur":
                effect["params"] = {"intensity": 0.5}
            elif effect_type == "motion_blur":
                effect["params"] = {"intensity": 0.3}
            
            clip["effects"].append(effect)
        
        # Add transition (except for first clip)
        if i > 0 and transition != "cut":
            clip["transition"] = {
                "type": transition,
                "duration": 0.1 if transition in ["flash", "whip-pan"] else 0.2
            }
        
        clips.append(clip)
    
    # Calculate total duration
    total_duration = max(c["startTime"] + c["duration"] for c in clips)
    
    # Build MonetEDL
    edl = {
        "version": 1,
        "id": f"edl-steph-{int(__import__('time').time())}",
        "meta": {
            "createdAt": int(__import__('time').time() * 1000),
            "updatedAt": int(__import__('time').time() * 1000),
            "aspectRatio": "1:1",
            "fps": 30,
            "sampleRate": 48000,
            "projectId": "steph-curry-replica",
        },
        "assets": {
            "media": {
                footage_id: {
                    "id": footage_id,
                    "path": str(RAW_FOOTAGE),
                    "duration": get_video_duration(str(RAW_FOOTAGE)),
                    "width": 1280,
                    "height": 720,
                }
            },
            "audio": {},
            "overlays": {},
        },
        "timeline": {
            "duration": total_duration,
            "markers": [],
            "tracks": [
                {
                    "id": "video-main",
                    "type": "video",
                    "order": 0,
                    "locked": False,
                    "hidden": False,
                    "clips": clips,
                }
            ],
        },
    }
    
    return edl

def render_with_editly(edl: dict, output_path: str):
    """Render EDL using Editly (local fork)."""
    print("Rendering with Editly...")
    
    # Save EDL to temp file
    tmpdir = tempfile.mkdtemp(prefix="editly-render-")
    edl_path = os.path.join(tmpdir, "edl.json")
    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2)
    
    # Try to use the local editly fork
    editly_cli = EDITLY_DIR / "cli.js"
    if not editly_cli.exists():
        editly_cli = EDITLY_DIR / "index.js"
    
    if EDITLY_DIR.exists():
        # Use local editly
        cmd = [
            "node", str(editly_cli),
            "--edl", edl_path,
            "--output", output_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                print(f"Editly render complete: {output_path}")
                return True
            else:
                print(f"Editly error: {result.stderr[:500]}")
        except Exception as e:
            print(f"Editly failed: {e}")
    
    # Fallback: Use FFmpeg directly with the EDL structure
    print("Falling back to FFmpeg direct render...")
    return render_with_ffmpeg(edl, output_path, tmpdir)

def render_with_ffmpeg(edl: dict, output_path: str, tmpdir: str):
    """Fallback FFmpeg renderer using EDL structure."""
    clips = edl["timeline"]["tracks"][0]["clips"]
    segment_files = []
    
    for i, clip in enumerate(clips):
        media_id = clip["mediaId"]
        media_path = edl["assets"]["media"][media_id]["path"]
        
        in_point = clip["inPoint"]
        duration = clip["duration"]
        out_point = clip["outPoint"]
        
        segment_file = os.path.join(tmpdir, f"segment_{i:03d}.mp4")
        
        # Build FFmpeg command with effects
        vf_parts = []
        vf_parts.append("scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2")
        
        # Apply effects from EDL
        for effect in clip.get("effects", []):
            effect_type = effect["type"]
            params = effect.get("params", {})
            
            if effect_type == "bw_toggle":
                vf_parts.append("hue=s=0")
                vf_parts.append("eq=contrast=1.2")
            elif effect_type == "desaturate":
                amount = params.get("amount", 0.7)
                vf_parts.append(f"eq=saturation={1-amount}")
            elif effect_type == "impact_flash":
                intensity = params.get("intensity", 0.8)
                vf_parts.append(f"eq=brightness={intensity*0.3}")
            elif effect_type == "vignette_pro":
                intensity = params.get("intensity", 0.6)
                vf_parts.append(f"vignette=PI/{4-intensity*2}")
            elif effect_type == "color_grade":
                sat = params.get("saturation", 1.5)
                con = params.get("contrast", 1.3)
                vf_parts.append(f"eq=saturation={sat}:contrast={con}")
            elif effect_type == "blur":
                intensity = params.get("intensity", 0.5)
                blur_val = int(intensity * 20)
                vf_parts.append(f"boxblur={blur_val}:{blur_val}")
            elif effect_type == "motion_blur":
                vf_parts.append("tblend=all_mode=average")
        
        vf = ",".join(vf_parts)
        
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(in_point),
            "-i", media_path,
            "-t", str(duration),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-an",
            segment_file
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, check=True)
            segment_files.append(segment_file)
            print(f"  Segment {i+1}/{len(clips)}: {duration:.3f}s")
        except subprocess.CalledProcessError as e:
            print(f"  Warning: Failed segment {i+1}: {e}")
            continue
    
    if not segment_files:
        print("Error: No segments rendered")
        return False
    
    # Create concat list
    concat_file = os.path.join(tmpdir, "concat.txt")
    with open(concat_file, "w") as f:
        for seg in segment_files:
            f.write(f"file '{seg}'\n")
    
    # Concatenate
    concat_output = os.path.join(tmpdir, "concat.mp4")
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c", "copy",
        concat_output
    ]
    subprocess.run(concat_cmd, capture_output=True, check=True)
    
    # Apply transitions (flash cuts between certain clips)
    # For now, just copy the concatenated output
    shutil.copy2(concat_output, output_path)
    
    print(f"Render complete: {output_path}")
    return True

def main():
    print("=" * 60)
    print("Steph Curry 1:1 Edit — Monet Pipeline")
    print("=" * 60)
    
    # Build EDL
    print("\nBuilding MonetEDL...")
    edl = build_monet_edl()
    
    total_duration = edl["timeline"]["duration"]
    num_clips = len(edl["timeline"]["tracks"][0]["clips"])
    print(f"  Clips: {num_clips}")
    print(f"  Duration: {total_duration:.2f}s")
    
    # Save EDL
    OUTPUT_DIR.mkdir(exist_ok=True)
    edl_path = OUTPUT_DIR / "steph-curry-edl.json"
    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2)
    print(f"  EDL saved: {edl_path}")
    
    # Render
    output_path = OUTPUT_DIR / "steph-curry-monet-render.mp4"
    render_with_editly(edl, str(output_path))
    
    # Verify
    if output_path.exists():
        duration = get_video_duration(str(output_path))
        size = output_path.stat().st_size / 1024 / 1024
        print(f"\n{'=' * 60}")
        print(f"Output: {output_path}")
        print(f"Duration: {duration:.2f}s")
        print(f"Size: {size:.1f} MB")
        print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
