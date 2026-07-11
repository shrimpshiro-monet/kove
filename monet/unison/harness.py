# monet/unison/harness.py
from __future__ import annotations
import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from monet.engines.freecut.executor.types import Action, ProjectSettings, RenderResult
from monet.engines.freecut.executor.asset_resolver import AssetResolver
from monet.engines.freecut.executor.plan_validator import validate_plan
from monet.engines.freecut.executor.timeline_builder import build_timeline
from monet.engines.freecut.executor.render import render as freecut_render
from monet.engines.editly.runner import render_with_editly
from monet.engines.opencut.runner import render_with_opencut
from monet.engines.sam_vfx.runner import render_with_sam_vfx
from monet.engines.sam_vfx.types import SamVfxOp
from monet.realtime.progress import hub
from monet.billing.cost import charge

logger = logging.getLogger("monet.unison")


@dataclass
class EngineRun:
    engine: str
    success: bool
    durationSec: float = 0.0
    renderTimeSec: float = 0.0
    outputPath: Optional[str] = None
    error: Optional[str] = None
    result: Optional[RenderResult] = None


@dataclass
class UnisonReport:
    runs: List[EngineRun] = field(default_factory=list)
    triptychPath: Optional[str] = None
    scorecardPath: Optional[str] = None
    winner: Optional[str] = None


ENGINE_LABELS = ["freecut", "editly", "opencut", "sam_vfx"]


async def _safe_run_with_progress(
    sid: str, name: str, coro, expected_duration: float, user_id: str = "anon"
) -> EngineRun:
    t0 = time.perf_counter()
    await hub.emit(sid, "engine.start", {"engine": name})
    try:
        result: RenderResult = await coro
        dt = time.perf_counter() - t0
        try:
            charge(user_id, sid, f"{name}_render_sec", dt)
        except Exception:
            pass
        await hub.emit(sid, "engine.done", {
            "engine": name,
            "outputPath": result.outputPath,
            "renderTimeSec": dt,
        })
        return EngineRun(
            engine=name, success=True,
            durationSec=result.durationSec,
            renderTimeSec=dt,
            outputPath=result.outputPath, result=result,
        )
    except Exception as e:
        dt = time.perf_counter() - t0
        logger.exception(f"[{name}] failed")
        await hub.emit(sid, "engine.error", {"engine": name, "error": str(e)})
        return EngineRun(
            engine=name, success=False,
            renderTimeSec=dt, error=str(e),
        )


async def run_unison(
    actions: List[Action],
    resolver: AssetResolver,
    settings: ProjectSettings,
    sam_ops: Optional[List[SamVfxOp]] = None,
    engines: Optional[List[str]] = None,
) -> UnisonReport:
    # Forward to streaming implementation for unified code paths
    return await run_unison_streaming(actions, resolver, settings, "global_room", sam_ops, engines)


async def run_unison_streaming(
    actions: List[Action],
    resolver: AssetResolver,
    settings: ProjectSettings,
    sid: str,
    sam_ops: Optional[List[SamVfxOp]] = None,
    engines: Optional[List[str]] = None,
    user_id: str = "anon",
) -> UnisonReport:
    engines = engines or ENGINE_LABELS

    val = validate_plan(actions, resolver)
    if not val.ok:
        await hub.emit(sid, "plan.invalid", {"errors": val.errors})
        raise ValueError("plan invalid:\n" + "\n".join(val.errors))

    timeline = await build_timeline(actions, resolver, settings)
    await hub.emit(sid, "timeline.built", {
        "duration": timeline.duration,
        "segments": len(timeline.videoSegments),
        "captions": len(timeline.captions),
    })

    tasks = []
    if "freecut" in engines:
        tasks.append(("freecut",
                      freecut_render(actions, resolver, settings)))
    if "editly" in engines:
        tasks.append(("editly",
                      render_with_editly(timeline)))
    if "opencut" in engines:
        tasks.append(("opencut",
                      render_with_opencut(timeline)))
    if "sam_vfx" in engines and sam_ops:
        tasks.append(("sam_vfx",
                      render_with_sam_vfx(timeline, sam_ops)))

    runs = await asyncio.gather(*[
        _safe_run_with_progress(sid, name, c, timeline.duration, user_id) for name, c in tasks
    ])
    return UnisonReport(runs=list(runs))
