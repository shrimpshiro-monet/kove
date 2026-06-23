# monet/engines/editly/runner.py
from __future__ import annotations
import asyncio
import json
import tempfile
import uuid
import os
import logging
from typing import Optional
from monet.engines.freecut.executor.types import Timeline, RenderResult, CoverageReport
from .compiler import compile_to_editly

logger = logging.getLogger("monet.editly")


async def render_with_editly(
    timeline: Timeline,
    output_path: Optional[str] = None,
    editly_bin: str = "editly",
) -> RenderResult:
    config = compile_to_editly(timeline)
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"editly_{uuid.uuid4()}.mp4")
    config["outPath"] = output_path

    cfg_path = os.path.join(tempfile.gettempdir(), f"editly_{uuid.uuid4()}.json")
    with open(cfg_path, "w") as f:
        json.dump(config, f, indent=2)

    cmd = [editly_bin, cfg_path]
    logger.info(f"[editly] cmd: {' '.join(cmd)}")
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"editly failed: {err.decode()}")

    return RenderResult(
        outputPath=output_path,
        command=" ".join(cmd),
        filterGraph=json.dumps(config),
        durationSec=timeline.duration,
        coverage=CoverageReport(
            actionsReceived=0, actionsApplied=0,
        ),
    )
