# monet/engines/freecut/executor/render.py
from __future__ import annotations
import asyncio
import os
import tempfile
import uuid
import logging
from typing import Callable, List, Optional

from .types import Action, ProjectSettings, RenderResult, CoverageReport
from .asset_resolver import AssetResolver
from .plan_validator import validate_plan
from .timeline_builder import build_timeline
from .ffmpeg_compiler import compile_timeline

logger = logging.getLogger("monet.freecut.render")


async def render(
    actions: List[Action],
    resolver: AssetResolver,
    settings: ProjectSettings,
    output_path: Optional[str] = None,
    ffmpeg_bin: str = "ffmpeg",
    on_log: Optional[Callable[[str], None]] = None,
) -> RenderResult:
    log = on_log or logger.info
    log(f"[executor] received {len(actions)} actions")

    val = validate_plan(actions, resolver)
    log(f"[executor] validation ok={val.ok} errs={len(val.errors)} warns={len(val.warnings)}")
    for w in val.warnings:
        log(f"[executor][warn] {w}")
    if not val.ok:
        for e in val.errors:
            log(f"[executor][err]  {e}")
        raise ValueError("Plan validation failed:\n" + "\n".join(val.errors))

    timeline = await build_timeline(actions, resolver, settings)
    log(
        f"[executor] timeline: {len(timeline.videoSegments)} v-segs, "
        f"{len(timeline.bgmTracks)} bgm, {len(timeline.captions)} captions, "
        f"dur={timeline.duration:.3f}s"
    )

    compiled = compile_timeline(timeline)

    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"edited_{uuid.uuid4()}.mp4")

    args: List[str] = ["-y"]
    for inp in compiled.inputs:
        args += ["-i", inp]
    args += ["-filter_complex", compiled.filterGraph]
    args += compiled.mapArgs + compiled.outputArgs + [output_path]

    full_cmd = ffmpeg_bin + " " + " ".join(
        f'"{a}"' if (" " in a or ";" in a) else a for a in args
    )
    log(f"[executor] cmd: {full_cmd}")

    proc = await asyncio.create_subprocess_exec(
        ffmpeg_bin, *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        log(f"[ffmpeg] {line.decode(errors='ignore').rstrip()}")
    rc = await proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg exited with code {rc}")

    resolved, _ = resolver.assert_all_exist(list(set(val.mediaIds)))
    return RenderResult(
        outputPath=output_path,
        command=full_cmd,
        filterGraph=compiled.filterGraph,
        durationSec=timeline.duration,
        coverage=CoverageReport(
            actionsReceived=len(actions),
            actionsApplied=len(actions),
            resolvedMedia=resolved,
        ),
    )
