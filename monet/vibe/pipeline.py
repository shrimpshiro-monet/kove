# monet/vibe/pipeline.py
from __future__ import annotations
import logging
from typing import Optional
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry
from monet.engines.freecut.executor.ffprobe import probe_duration
from monet.engines.freecut.planner.gemini_prompt import build_planner_prompt, build_regen_prompt
from monet.engines.freecut.planner.parse_plan import parse_plan_with_hints
from monet.unison.harness import run_unison_streaming
from monet.unison.scorer import score_runs, pick_winner
from monet.unison.triptych import build_triptych
from monet.router.dispatch import run_via_router
from monet.router.router import pick_engine_with_hints
from .session import VibeSession
from .feedback import Feedback
from monet.realtime.progress import hub

logger = logging.getLogger("monet.vibe")

# Plug your actual Gemini wrapper here
from monet.vertex_ai import call_gemini  # exists in your codebase


async def _build_resolver(session: VibeSession) -> AssetResolver:
    resolver = AssetResolver()
    if session.raw_footage_path:
        dur = 10.0
        try:
            dur = await probe_duration(session.raw_footage_path)
        except Exception:
            pass
        resolver.register(AssetEntry(
            mediaId="raw_footage",
            semanticName="user's raw footage to edit",
            filePath=session.raw_footage_path, kind="video", durationSec=dur,
        ))
    if session.reference_path:
        dur = 10.0
        try:
            dur = await probe_duration(session.reference_path)
        except Exception:
            pass
        resolver.register(AssetEntry(
            mediaId="reference_video",
            semanticName="reference video showing desired style",
            filePath=session.reference_path, kind="video", durationSec=dur,
        ))
    if session.music_path:
        dur = 10.0
        try:
            dur = await probe_duration(session.music_path)
        except Exception:
            pass
        resolver.register(AssetEntry(
            mediaId="bgm_main",
            semanticName="user-provided background music",
            filePath=session.music_path, kind="audio", durationSec=dur,
        ))
    return resolver


async def plan_session(session: VibeSession) -> None:
    """Stage 1: Ask Gemini for a plan."""
    session.status = "planning"
    resolver = await _build_resolver(session)
    prompt = build_planner_prompt(
        user_prompt=session.prompt, resolver=resolver,
        width=session.settings.width, height=session.settings.height,
        fps=session.settings.fps,
    )
    raw = await call_gemini(prompt)
    actions, hint = parse_plan_with_hints(raw)
    session.actions = actions
    session.status = "planned"
    return hint


async def render_unison(session: VibeSession, hint=None) -> dict:
    """Stage 2: Render on all engines, score, build triptych."""
    session.status = "rendering"
    resolver = await _build_resolver(session)

    # Detect beats in BGM and snap cuts to beats!
    if session.music_path:
        try:
            from monet.engines.beatsync.detector import detect_beats
            from monet.engines.beatsync.snap import snap_to_beats
            beats = await detect_beats(session.music_path)
            session.actions = snap_to_beats(session.actions, beats)
            await hub.emit(session.id, "beats.detected", {"count": len(beats)})
        except Exception as e:
            logger.warning(f"beat sync detection or snap failed: {e}")

    # Decide which engines to try based on hint
    engines = ["freecut", "editly", "opencut"]
    if hint and "sam_mask" in (hint.needs or []) + (hint.prefers or []):
        engines.append("sam_vfx")

    report = await run_unison_streaming(
        actions=session.actions, resolver=resolver,
        settings=session.settings, sid=session.id, engines=engines,
    )
    scores = await score_runs(report,
                              target_width=session.settings.width,
                              target_height=session.settings.height)
    winner = pick_winner(scores)
    triptych = await build_triptych(report)

    session.engine_outputs = {
        r.engine: r.outputPath for r in report.runs
        if r.success and r.outputPath
    }
    session.scores = scores
    session.winner = winner
    session.triptych_path = triptych
    session.status = "preview_ready"
    return {
        "engines": session.engine_outputs,
        "scores": scores,
        "winner": winner,
        "triptychPath": triptych,
    }


async def finalize(session: VibeSession, chosen_engine: Optional[str] = None) -> str:
    """Stage 3: User picks engine (or auto-winner) → that's the final."""
    pick = chosen_engine or session.winner
    if not pick or pick not in session.engine_outputs:
        raise ValueError(f"No output for engine '{pick}'")
    session.final_output_path = session.engine_outputs[pick]
    session.status = "finalized"
    return session.final_output_path


async def regenerate_session(session: VibeSession, feedback: Feedback):
    resolver = await _build_resolver(session)
    prompt = build_regen_prompt(
        user_prompt=session.prompt, prev_actions=session.actions,
        feedback=feedback, resolver=resolver,
        width=session.settings.width, height=session.settings.height,
        fps=session.settings.fps,
    )
    raw = await call_gemini(prompt)
    actions, hint = parse_plan_with_hints(raw)
    session.actions = actions
    session.status = "planned"
    # log to history
    try:
        from .history import record_revision
        record_revision(session.id, actions, feedback)
    except Exception:
        pass
    return hint
