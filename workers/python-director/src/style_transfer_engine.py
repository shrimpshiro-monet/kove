"""Reference video style analyzer and replicator.

Analyzes a reference video's editing DNA and applies it to new footage.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel


class ReferenceStyle(BaseModel):
    """Editing DNA extracted from a reference video."""
    
    # Rhythm
    avg_shot_duration: float = 2.0
    shot_duration_variance: float = 0.5
    beats_per_cut: float = 1.0
    cut_alignment: str = "strict"  # strict, loose, none
    
    # Pacing
    pacing_type: str = "medium"  # aggressive, fast, medium, slow, varied
    energy_curve: list[float] = []  # 0-1 values
    climax_position: float = 0.7  # 0-1, where peak occurs
    
    # Visual style
    color_grade: str = "cinematic"  # cinematic, vibrant, vintage, monochrome
    effect_vocabulary: list[str] = []  # glow, shake, rgb_split, etc.
    transition_style: str = "cut"  # cut, crossfade, flash, morph
    
    # Shot language
    closeup_ratio: float = 0.3
    wide_ratio: float = 0.3
    motion_preference: str = "mixed"  # static, moving, mixed
    
    # Metadata
    source_duration: float = 0.0
    total_cuts: int = 0
    bpm: float = 120.0


def analyze_reference(video_path: str) -> ReferenceStyle:
    """Analyze a reference video's editing style."""
    
    # Get video info
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', video_path],
        capture_output=True, text=True
    )
    duration = float(probe.stdout.strip()) if probe.stdout.strip() else 0
    
    # Detect scene changes (cuts) using metadata
    scene_cmd = [
        'ffmpeg', '-i', video_path,
        '-vf', "select='gt(scene,0.1)',metadata=print:file=-",
        '-f', 'null', '-'
    ]
    result = subprocess.run(scene_cmd, capture_output=True, text=True)
    
    # Parse scene change timestamps from both stdout and stderr
    cuts = []
    for line in (result.stdout + result.stderr).split('\n'):
        if 'pts_time:' in line:
            try:
                pts = float(line.split('pts_time:')[1].split()[0])
                cuts.append(pts)
            except (IndexError, ValueError):
                pass
    
    # Calculate rhythm metrics
    if len(cuts) > 1:
        intervals = [cuts[i+1] - cuts[i] for i in range(len(cuts)-1)]
        avg_shot = sum(intervals) / len(intervals)
        variance = sum((x - avg_shot) ** 2 for x in intervals) / len(intervals) ** 0.5
    else:
        avg_shot = duration
        variance = 0
    
    # Estimate BPM from cuts
    if len(cuts) > 2:
        avg_interval = (cuts[-1] - cuts[0]) / (len(cuts) - 1)
        bpm = 60 / avg_interval if avg_interval > 0 else 120
    else:
        bpm = 120
    
    # Analyze color with FFmpeg
    color_cmd = [
        'ffmpeg', '-i', video_path, '-vf',
        'signalstats,format=json',
        '-f', 'null', '-'
    ]
    color_result = subprocess.run(color_cmd, capture_output=True, text=True)
    
    # Build energy curve (simplified - based on scene density)
    energy = []
    segment = duration / 10
    for i in range(10):
        start = i * segment
        end = (i + 1) * segment
        cuts_in_segment = len([c for c in cuts if start <= c < end])
        energy.append(min(1.0, cuts_in_segment / 5))
    
    # Determine pacing type
    if avg_shot < 1.0:
        pacing = "aggressive"
    elif avg_shot < 2.0:
        pacing = "fast"
    elif avg_shot < 3.0:
        pacing = "medium"
    else:
        pacing = "slow"
    
    # Find climax position (peak energy)
    climax_pos = energy.index(max(energy)) / 10 if energy else 0.7
    
    return ReferenceStyle(
        avg_shot_duration=avg_shot,
        shot_duration_variance=variance,
        beats_per_cut=bpm / 60 if bpm > 0 else 1,
        cut_alignment="strict" if variance < 0.5 else "loose",
        pacing_type=pacing,
        energy_curve=energy,
        climax_position=climax_pos,
        source_duration=duration,
        total_cuts=len(cuts),
        bpm=bpm,
    )


def apply_style_to_footage(
    style: ReferenceStyle,
    footage_path: str,
    output_path: str,
    duration: float = 30.0,
) -> str:
    """Apply reference style to user footage."""
    
    # Calculate number of cuts based on style
    num_cuts = max(3, int(duration / style.avg_shot_duration))
    cut_interval = duration / num_cuts
    
    # Build FFmpeg filter chain
    filters = []
    
    # Color grade based on style
    if style.color_grade == "cinematic":
        filters.append("eq=contrast=1.1:saturation=0.9")
        filters.append("colorbalance=rs=0.02:bs=-0.02")
    elif style.color_grade == "vibrant":
        filters.append("eq=contrast=1.15:saturation=1.3")
    elif style.color_grade == "vintage":
        filters.append("eq=contrast=0.9:saturation=0.7")
        filters.append("curves=vintage")
    
    # Add effects based on style vocabulary
    for effect in style.effect_vocabulary[:3]:  # Limit to 3 effects
        if effect == "glow":
            filters.append("gblur=sigma=5")
        elif effect == "shake":
            filters.append("crop=iw-10:ih-10:5:5,scale=iw:ih")
        elif effect == "rgb_split":
            filters.append("rgbashift=rh=2:bh=-2")
        elif effect == "vignette":
            filters.append("vignette=PI/4")
    
    filter_str = ",".join(filters) if filters else "null"
    
    # Build FFmpeg command
    cmd = [
        'ffmpeg', '-y',
        '-i', footage_path,
        '-vf', filter_str,
        '-t', str(duration),
        '-r', '30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        output_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"FFmpeg error: {result.stderr[:500]}")
        return ""
    
    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python style_transfer.py <reference.mp4> <footage.mp4> [output.mp4]")
        sys.exit(1)
    
    reference = sys.argv[1]
    footage = sys.argv[2]
    output = sys.argv[3] if len(sys.argv) > 3 else "styled_output.mp4"
    
    print(f"Analyzing reference: {reference}")
    style = analyze_reference(reference)
    print(f"  Duration: {style.source_duration:.1f}s")
    print(f"  Cuts: {style.total_cuts}")
    print(f"  Avg shot: {style.avg_shot_duration:.2f}s")
    print(f"  BPM: {style.bpm:.0f}")
    print(f"  Pacing: {style.pacing_type}")
    
    print(f"\nApplying style to: {footage}")
    result = apply_style_to_footage(style, footage, output)
    
    if result:
        print(f"\nDone: {result}")
    else:
        print("\nFailed to render")
