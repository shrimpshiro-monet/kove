# monet/thumbnail/generator.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid

async def generate_thumbnail(video_path: str, output_path: str | None = None) -> str:
    """
    Use ffmpeg's thumbnail filter — picks the most representative frame
    from a batch (default 100). Adds a subtle vignette + saturation boost.
    """
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-thumbs")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"thumb_{uuid.uuid4().hex[:8]}.jpg")

    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vf", "thumbnail=100,scale=1080:1920:force_original_aspect_ratio=increase,"
               "crop=1080:1920,eq=saturation=1.2,vignette",
        "-frames:v", "1", "-q:v", "2",
        output_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"thumbnail failed: {err.decode()[:300]}")
    return output_path
