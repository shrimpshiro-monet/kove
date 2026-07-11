# monet/affiliates/demo_gen.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid
from typing import Optional


async def build_affiliate_demo(
    raw_path: str, final_path: str, affiliate_code: str,
    output_path: Optional[str] = None,
) -> str:
    """
    Build a 30s "BEFORE / AFTER" social-ready clip with affiliate watermark.
    Layout: split-screen vertical → 'BEFORE' / 'AFTER' captions →
            'monet.app/?ref=CODE' overlay bottom.
    """
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-demos")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"demo_{uuid.uuid4().hex[:8]}.mp4")

    affiliate_text = f"monet.app/?ref={affiliate_code}".replace(":", "\\:")

    cmd = [
        "ffmpeg", "-y",
        "-i", raw_path, "-i", final_path,
        "-filter_complex",
        # scale each to 540x1920, stack horizontally
        "[0:v]scale=540:1920:force_original_aspect_ratio=increase,crop=540:1920,"
        "drawtext=text='BEFORE':fontsize=70:fontcolor=white:x=(w-text_w)/2:y=60:"
        "box=1:boxcolor=red@0.7:boxborderw=15[bef];"
        "[1:v]scale=540:1920:force_original_aspect_ratio=increase,crop=540:1920,"
        "drawtext=text='AFTER (Monet)':fontsize=70:fontcolor=white:x=(w-text_w)/2:y=60:"
        f"box=1:boxcolor=0x5b9bff@0.85:boxborderw=15[aft];"
        f"[bef][aft]hstack=inputs=2,"
        f"drawtext=text='{affiliate_text}':fontsize=44:fontcolor=yellow:"
        f"x=(w-text_w)/2:y=h-120:box=1:boxcolor=black@0.6:boxborderw=10[v]",
        "-map", "[v]", "-map", "1:a?",
        "-t", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"demo gen failed: {err.decode()[:300]}")
    return output_path
