# monet/unison/triptych.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid
from typing import List, Optional
from monet.unison.harness import UnisonReport
from monet.engines.freecut.executor.drawtext import resolve_font_file


async def build_triptych(
    report: UnisonReport,
    output_path: Optional[str] = None,
    cell_w: int = 540,
    cell_h: int = 960,
) -> Optional[str]:
    """
    Compose a 2x2 grid of all successful engine outputs into one video.
    Each cell labeled with engine name.
    """
    valid = [r for r in report.runs if r.success and r.outputPath]
    if not valid:
        return None

    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"unison_{uuid.uuid4()}.mp4")

    # Pad with dummy inputs if fewer than 4 engines succeeded
    valid_inputs = list(valid)
    while len(valid_inputs) < 4:
        valid_inputs.append(None)

    args = ["-y"]
    inputs = []
    for r in valid_inputs:
        if r:
            args += ["-i", r.outputPath]
            inputs.append(r.outputPath)
        else:
            args += ["-f", "lavfi", "-t", "10",
                     "-i", f"color=c=black:s={cell_w}x{cell_h}:r=30"]

    font = resolve_font_file("Impact") or resolve_font_file("Arial")
    font_arg = f"fontfile='{font}':" if font else ""

    filters = []
    for i, r in enumerate(valid_inputs):
        label = (r.engine if r else "—").upper()
        filters.append(
            f"[{i}:v]scale={cell_w}:{cell_h}:force_original_aspect_ratio=decrease,"
            f"pad={cell_w}:{cell_h}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"drawtext={font_arg}text='{label}':fontcolor=yellow:fontsize=40:"
            f"x=20:y=20:box=1:boxcolor=black@0.6:boxborderw=10[v{i}]"
        )

    filters.append(
        f"[v0][v1]hstack=inputs=2[top];"
        f"[v2][v3]hstack=inputs=2[bot];"
        f"[top][bot]vstack=inputs=2[grid]"
    )

    # audio: take first valid engine's audio for the triptych
    first_audio_idx = next((i for i, r in enumerate(valid_inputs) if r), 0)
    args += ["-filter_complex", ";".join(filters),
             "-map", "[grid]", "-map", f"{first_audio_idx}:a?",
             "-c:v", "libx264", "-preset", "fast", "-crf", "22",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
             "-shortest", output_path]

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"triptych build failed: {err.decode()[:500]}")
    return output_path
