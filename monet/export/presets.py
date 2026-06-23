# monet/export/presets.py
from __future__ import annotations
from dataclasses import dataclass

@dataclass
class ExportPreset:
    name: str
    width: int
    height: int
    fps: int
    max_duration: int  # seconds
    bitrate_kbps: int
    codec: str = "libx264"

PRESETS = {
    "tiktok":    ExportPreset("TikTok",    1080, 1920, 30, 180, 3500),
    "reels":     ExportPreset("Reels",     1080, 1920, 30, 90, 4000),
    "shorts":    ExportPreset("Shorts",    1080, 1920, 30, 60, 4000),
    "x_post":    ExportPreset("X Post",    1080, 1920, 30, 140, 3000),
    "youtube":   ExportPreset("YouTube",   1920, 1080, 30, 600, 8000),
    "square":    ExportPreset("Square",    1080, 1080, 30, 60, 3500),
}
