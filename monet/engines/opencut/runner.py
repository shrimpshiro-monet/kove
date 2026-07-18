# monet/engines/opencut/runner.py
from __future__ import annotations
import asyncio
import json
import tempfile
import uuid
import os
import logging
from typing import Optional
from monet.engines.freecut.executor.types import Timeline, RenderResult, CoverageReport
from .compiler import compile_to_opencut

logger = logging.getLogger("monet.opencut")


async def render_with_opencut(
    timeline: Timeline,
    output_path: Optional[str] = None,
    opencut_cli: str = "opencut-cli",
) -> RenderResult:
    """
    Assumes a CLI wrapper opencut-cli render <project.json> -o <out.mp4>.
    If your OpenCut deployment is server-side, swap this for an HTTP POST.
    """
    project = compile_to_opencut(timeline)
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"opencut_{uuid.uuid4()}.mp4")

    proj_path = os.path.join(tempfile.gettempdir(), f"opencut_{uuid.uuid4()}.json")
    with open(proj_path, "w") as f:
        json.dump(project, f, indent=2)

    cmd = [opencut_cli, "render", proj_path, "-o", output_path]
    logger.info(f"[opencut] cmd: {' '.join(cmd)}")
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"opencut failed: {err.decode()}")

    return RenderResult(
        outputPath=output_path,
        command=" ".join(cmd),
        filterGraph=json.dumps(project),
        durationSec=timeline.duration,
        coverage=CoverageReport(actionsReceived=0, actionsApplied=0),
    )
