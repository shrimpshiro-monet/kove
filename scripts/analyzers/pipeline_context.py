"""
pipeline_context.py — Pre-processing + orchestration for all analyzers.

Runs before every analyzer and provides:
  a) Ingest normalization (resolution, HDR, frame scaling)
  b) Genre classification (runs reference_type_classifier first)
  c) Genre-conditioned threshold profiles
  d) Audio expansion (source separation, loudness)
  e) Composition analysis
"""

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

from .thresholds import get_profile

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class NormalizedVideo:
    """Normalized reference video ready for analysis."""
    original_path: str
    normalized_path: str          # scaled/letterboxed copy (or original if no transform needed)
    width: int
    height: int
    original_width: int
    original_height: int
    fps: float
    duration: float
    has_audio: bool
    is_hdr: bool
    color_primaries: str
    color_transfer: str
    aspect_ratio: float
    genre: str = "unknown"
    genre_confidence: float = 0.0
    profile: dict = field(default_factory=dict)

@dataclass
class AudioStems:
    """Separated audio stems."""
    music_path: Optional[str] = None
    vocals_path: Optional[str] = None
    sfx_path: Optional[str] = None
    raw_path: Optional[str] = None
    extracted_wav: Optional[str] = None


# ---------------------------------------------------------------------------
# ffprobe helpers
# ---------------------------------------------------------------------------

def _run_ffprobe(path: str) -> dict:
    """Run ffprobe and return parsed JSON."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout) if result.returncode == 0 else {}


def probe_video(path: str) -> dict:
    """Extract video metadata from file."""
    data = _run_ffprobe(path)
    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    audio_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "audio"),
        None,
    )

    if not video_stream:
        return {
            "duration": 0, "width": 0, "height": 0, "fps": 30.0, "has_audio": False,
            "color_primaries": "unknown", "color_transfer": "unknown", "is_hdr": False,
        }

    fps = 30.0
    r_frame_rate = video_stream.get("r_frame_rate", "30/1")
    try:
        num, den = r_frame_rate.split("/")
        fps = int(num) / int(den)
    except (ValueError, ZeroDivisionError):
        fps = 30.0

    color_primaries = video_stream.get("color_primaries", "unknown")
    color_transfer = video_stream.get("color_transfer", "unknown")

    # HDR detection: BT.2020 primaries + PQ/HLG transfer
    is_hdr = (
        "bt2020" in color_primaries.lower()
        and any(t in color_transfer.lower() for t in ("smpte2084", "arib-std-b67", "hlg", "pq"))
    )

    fmt = data.get("format", {})
    return {
        "duration": float(fmt.get("duration", 0)),
        "width": int(video_stream.get("width", 0)),
        "height": int(video_stream.get("height", 0)),
        "fps": fps,
        "has_audio": audio_stream is not None,
        "color_primaries": color_primaries,
        "color_transfer": color_transfer,
        "is_hdr": is_hdr,
    }


def normalize_video(path: str, target_long_edge: int = 1280) -> NormalizedVideo:
    """
    Normalize a video for analysis.

    - Probes metadata (resolution, HDR, FPS, etc.)
    - If HDR, tone-maps to SDR
    - Scales/letterboxes to target_long_edge on the longest side
    - Returns NormalizedVideo with paths and metadata
    """
    meta = probe_video(path)
    width = meta["width"]
    height = meta["height"]
    aspect = width / height if height > 0 else 16 / 9

    # Determine scale factor
    long_edge = max(width, height)
    if long_edge <= target_long_edge and not meta["is_hdr"]:
        # No transform needed
        return NormalizedVideo(
            original_path=path,
            normalized_path=path,
            width=width,
            height=height,
            original_width=width,
            original_height=height,
            fps=meta["fps"],
            duration=meta["duration"],
            has_audio=meta["has_audio"],
            is_hdr=meta["is_hdr"],
            color_primaries=meta["color_primaries"],
            color_transfer=meta["color_transfer"],
            aspect_ratio=aspect,
        )

    out_path = tempfile.mktemp(suffix=".mp4")
    scale_factor = target_long_edge / long_edge
    new_w = int(width * scale_factor)
    new_h = int(height * scale_factor)
    # Ensure even dimensions
    new_w = new_w if new_w % 2 == 0 else new_w + 1
    new_h = new_h if new_h % 2 == 0 else new_h + 1

    vf = f"scale={new_w}:{new_h}"

    if meta["is_hdr"]:
        # Tone-map HDR to SDR using zscale + tonemap
        vf = (
            f"zscale=transfer=linear,tonemap=hable:param=1.0,"
            f"zscale=transfer=bt709,format=yuv420p,{vf}"
        )

    cmd = [
        "ffmpeg", "-y", "-i", path,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-an",
        out_path,
    ]
    subprocess.run(cmd, capture_output=True, timeout=120)

    return NormalizedVideo(
        original_path=path,
        normalized_path=out_path,
        width=new_w,
        height=new_h,
        original_width=width,
        original_height=height,
        fps=meta["fps"],
        duration=meta["duration"],
        has_audio=meta["has_audio"],
        is_hdr=meta["is_hdr"],
        color_primaries=meta["color_primaries"],
        color_transfer=meta["color_transfer"],
        aspect_ratio=aspect,
    )
