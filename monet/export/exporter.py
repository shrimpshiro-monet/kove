# monet/export/exporter.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid
from .presets import PRESETS

async def export_for_platform(source_path: str, platform: str,
                              output_path: str | None = None) -> str:
    p = PRESETS.get(platform)
    if not p:
        raise ValueError(f"unknown preset {platform}")
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-exports")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"{platform}_{uuid.uuid4().hex[:6]}.mp4")

    cmd = [
        "ffmpeg", "-y", "-i", source_path,
        "-t", str(p.max_duration),
        "-vf", f"scale={p.width}:{p.height}:force_original_aspect_ratio=increase,"
               f"crop={p.width}:{p.height},fps={p.fps}",
        "-c:v", p.codec, "-b:v", f"{p.bitrate_kbps}k",
        "-pix_fmt", "yuv420p", "-preset", "medium",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        output_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"export failed: {err.decode()[:300]}")
    return output_path
