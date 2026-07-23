"""Frame extraction using FFmpeg. Extracts frames at specified FPS."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class FrameInfo:
    path: str
    timestamp_s: float
    width: int
    height: int


@dataclass
class ExtractionResult:
    frames: list[FrameInfo]
    metadata: dict


def extract_frames(
    file_path: str,
    fps: float = 3.0,
    max_frames: int | None = None,
    output_dir: str | None = None,
) -> ExtractionResult:
    """Extract frames from video using FFmpeg at specified FPS.

    Args:
        file_path: Path to input video file
        fps: Frames per second to extract (default 3)
        max_frames: Maximum number of frames to extract (optional)
        output_dir: Directory to save frames (default: temp dir)

    Returns:
        ExtractionResult with frame paths and metadata
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="jalebi-frames-")

    os.makedirs(output_dir, exist_ok=True)

    # Get video duration and dimensions
    probe_cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", file_path,
    ]
    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    probe_data = json.loads(probe_result.stdout)

    duration = float(probe_data["format"]["duration"])

    width, height = 1920, 1080
    for stream in probe_data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width", 1920)
            height = stream.get("height", 1080)
            break

    # Extract frames
    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    cmd = [
        "ffmpeg", "-i", file_path,
        "-vf", f"fps={fps}",
        "-q:v", "2",
    ]

    if max_frames:
        cmd.extend(["-vframes", str(max_frames)])

    cmd.extend(["-y", output_pattern])

    subprocess.run(cmd, capture_output=True, check=True)

    # Collect frame info
    frames: list[FrameInfo] = []
    frame_files = sorted(Path(output_dir).glob("frame_*.jpg"))

    for i, frame_path in enumerate(frame_files):
        timestamp_s = i / fps
        frames.append(FrameInfo(
            path=str(frame_path),
            timestamp_s=round(timestamp_s, 4),
            width=width,
            height=height,
        ))

    return ExtractionResult(
        frames=frames,
        metadata={
            "total_frames": len(frames),
            "fps": fps,
            "duration_s": duration,
            "output_dir": output_dir,
        },
    )
