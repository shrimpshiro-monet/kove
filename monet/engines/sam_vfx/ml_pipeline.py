# monet/engines/sam_vfx/ml_pipeline.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid
import logging
from typing import List, Tuple

logger = logging.getLogger("monet.sam_vfx")

# These would be your actual model entrypoints; using subprocess calls
# to existing repos keeps this engine modular and swap-friendly.

async def extract_frames(video_path: str, fps: int = 30) -> str:
    """Extract frames to a temp dir as PNG sequence."""
    out_dir = os.path.join(tempfile.gettempdir(), f"frames_{uuid.uuid4().hex[:8]}")
    os.makedirs(out_dir, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={fps}", os.path.join(out_dir, "frame_%06d.png"),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"frame extract failed: {err.decode()}")
    return out_dir


async def run_sam_masks(frames_dir: str, prompt_pts: list | None = None) -> str:
    """
    Run Segment Anything (SAM/SAM2) on the frame sequence.
    Outputs PNG masks (white = subject, black = bg) in a parallel dir.
    Replace this stub with your actual SAM2 model call.
    """
    mask_dir = frames_dir + "_masks"
    os.makedirs(mask_dir, exist_ok=True)
    # Assumes a sam2-cli wrapper exists; otherwise call Python API directly.
    proc = await asyncio.create_subprocess_exec(
        "python", "-m", "monet.engines.sam_vfx.sam2_worker",
        "--frames", frames_dir, "--out", mask_dir,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        # graceful fallback: empty masks dir → compositor will treat as no mask
        logger.warning(f"[sam] worker failed, falling back to passthrough: {err.decode()}")
    return mask_dir


async def run_depth_estimation(frames_dir: str) -> str:
    """Run Depth-Anything-V2 or MiDaS, output depth PNGs."""
    depth_dir = frames_dir + "_depth"
    os.makedirs(depth_dir, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "python", "-m", "monet.engines.sam_vfx.depth_worker",
        "--frames", frames_dir, "--out", depth_dir,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        logger.warning(f"[depth] worker failed: {err.decode()}")
    return depth_dir


async def composite_with_mask(
    frames_dir: str, mask_dir: str, output_path: str, fps: int = 30,
    bg_dim: float = 0.3,
) -> None:
    """
    Composite: foreground frames + masks → output video where the masked
    subject is full-brightness and the rest is dimmed by bg_dim.
    Uses FFmpeg's alphamerge + blend.
    """
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-framerate", str(fps), "-i", os.path.join(frames_dir, "frame_%06d.png"),
        "-framerate", str(fps), "-i", os.path.join(mask_dir, "frame_%06d.png"),
        "-filter_complex",
        # [0] orig, [1] mask. Make masked layer = orig×mask + (orig×(1-mask)×bg_dim)
        f"[1:v]format=gray,geq=lum='p(X,Y)':a='p(X,Y)'[m];"
        f"[0:v][m]alphamerge[fg];"
        f"[0:v]eq=brightness=-{bg_dim}[dim];"
        f"[dim][fg]overlay=format=auto[v]",
        "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", "20", output_path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"composite failed: {err.decode()}")
