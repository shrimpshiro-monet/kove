# monet/engines/sam_vfx/runner.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid
import logging
from typing import List, Optional
from monet.engines.freecut.executor.types import (
    Timeline, RenderResult, CoverageReport, ProjectSettings,
)
from monet.engines.freecut.executor.ffmpeg_compiler import compile_timeline
from .types import SamVfxOp
from .ml_pipeline import (
    extract_frames, run_sam_masks, run_depth_estimation, composite_with_mask,
)

logger = logging.getLogger("monet.sam_vfx")


async def render_with_sam_vfx(
    timeline: Timeline,
    ops: List[SamVfxOp],
    output_path: Optional[str] = None,
) -> RenderResult:
    """
    Two-stage:
      Stage 1: For each video segment that has a SAM op, run ML pipeline,
               produce a "processed" intermediate clip.
      Stage 2: Reassemble the timeline through the FreeCut compiler with the
               processed clips substituted in.
    """
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"samvfx_{uuid.uuid4()}.mp4")

    # 1. Process each segment that has an op
    processed_paths: dict[int, str] = {}
    for i, seg in enumerate(timeline.videoSegments):
        applicable = [o for o in ops if o.clipId == f"seg_{i}"]
        if not applicable:
            continue
        for op in applicable:
            logger.info(f"[sam] processing seg_{i} op={op.op}")
            frames_dir = await extract_frames(seg.inputPath, timeline.settings.fps)
            if op.op == "mask_subject":
                masks = await run_sam_masks(frames_dir)
                out = os.path.join(tempfile.gettempdir(),
                                   f"sam_seg{i}_{uuid.uuid4().hex[:6]}.mp4")
                await composite_with_mask(
                    frames_dir, masks, out,
                    fps=timeline.settings.fps,
                    bg_dim=op.params.get("bg_dim", 0.3),
                )
                processed_paths[i] = out
            elif op.op == "depth_vfx":
                _ = await run_depth_estimation(frames_dir)
                # Fallback for now
                processed_paths[i] = seg.inputPath

    # 2. Substitute processed clips back in
    new_timeline = timeline.model_copy(deep=True)
    for i, seg in enumerate(new_timeline.videoSegments):
        if i in processed_paths:
            seg.inputPath = processed_paths[i]
            seg.sourceIn = 0.0
            seg.sourceOut = (seg.sourceOut - seg.sourceIn) / seg.playbackSpeed
            # rebuild input index
            seg.inputIndex = i + 1000  # force unique

    # Re-deduplicate input indices
    path_to_idx: dict[str, int] = {}
    for seg in new_timeline.videoSegments:
        if seg.inputPath not in path_to_idx:
            path_to_idx[seg.inputPath] = len(path_to_idx)
        seg.inputIndex = path_to_idx[seg.inputPath]
    for bgm in new_timeline.bgmTracks:
        if bgm.inputPath not in path_to_idx:
            path_to_idx[bgm.inputPath] = len(path_to_idx)
        bgm.inputIndex = path_to_idx[bgm.inputPath]

    compiled = compile_timeline(new_timeline)

    # Final assembly with FFmpeg
    args = ["-y"]
    for p in compiled.inputs:
        args += ["-i", p]
    args += ["-filter_complex", compiled.filterGraph]
    args += compiled.mapArgs + compiled.outputArgs + [output_path]

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"sam_vfx final assembly failed: {err.decode()}")

    return RenderResult(
        outputPath=output_path,
        command=f"ffmpeg [{len(compiled.inputs)} inputs, sam_vfx pipeline]",
        filterGraph=compiled.filterGraph,
        durationSec=new_timeline.duration,
        coverage=CoverageReport(
            actionsReceived=len(ops), actionsApplied=len(processed_paths),
        ),
    )
