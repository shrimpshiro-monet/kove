# monet/router/dispatch.py
from __future__ import annotations
import logging
from typing import List, Optional
from monet.engines.freecut.executor.types import (
    Action, ProjectSettings, RenderResult, Timeline,
)
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry
from monet.engines.freecut.executor.plan_validator import validate_plan
from monet.engines.freecut.executor.timeline_builder import build_timeline
from monet.engines.freecut.executor.render import render as freecut_render
from monet.engines.editly.runner import render_with_editly
from monet.engines.opencut.runner import render_with_opencut
from .router import pick_engine, route_multi_pass

logger = logging.getLogger("monet.router")


async def run_via_router(
    actions: List[Action],
    resolver: AssetResolver,
    settings: ProjectSettings,
    output_path: Optional[str] = None,
    multi_pass: bool = False,
) -> RenderResult:
    val = validate_plan(actions, resolver)
    if not val.ok:
        raise ValueError("validation failed:\n" + "\n".join(val.errors))

    if multi_pass:
        return await _run_multi_pass(actions, resolver, settings, output_path)

    pick = pick_engine(actions)
    logger.info(f"[router] picked engine={pick.engine.name} score={pick.score:.3f} "
                f"missing={pick.missing}")
    timeline = await build_timeline(actions, resolver, settings)
    return await _run_engine(pick.engine.name, actions, resolver, settings, timeline, output_path)


async def _run_engine(name: str, actions, resolver, settings, timeline: Timeline, out_path):
    if name == "freecut":
        return await freecut_render(actions, resolver, settings, output_path=out_path)
    if name == "editly":
        return await render_with_editly(timeline, output_path=out_path)
    if name == "opencut":
        return await render_with_opencut(timeline, output_path=out_path)
    raise ValueError(f"unknown engine {name}")


async def _run_multi_pass(actions, resolver, settings, out_path) -> RenderResult:
    passes = route_multi_pass(actions)
    logger.info(f"[router] multi-pass: {[(p.engine.name, p.purpose) for p in passes]}")

    # Pass 1: base render
    p1 = passes[0]
    t1 = await build_timeline(p1.actions, resolver, settings)
    r1 = await _run_engine(p1.engine.name, p1.actions, resolver, settings, t1, None)

    if len(passes) == 1:
        return r1

    # Pass 2+: feed Pass 1's output back in as a new asset, then run remaining
    pass1_media_id = "pass1_output"
    resolver.register(AssetEntry(
        mediaId=pass1_media_id, filePath=r1.outputPath, kind="video",
        semanticName="output of previous pass", durationSec=r1.durationSec,
    ))

    # Prepend an addMedia for the pass-1 output so subsequent captions overlay onto it
    from monet.engines.freecut.executor.types import AddMediaAction
    overlay_actions: List[Action] = [
        AddMediaAction(type="addMedia", trackId="video_1",
                       mediaId=pass1_media_id, clipId="pass1_video", startTime=0.0),
        *passes[1].actions,
    ]
    t2 = await build_timeline(overlay_actions, resolver, settings)
    return await _run_engine(passes[1].engine.name, overlay_actions, resolver, settings, t2, out_path)
