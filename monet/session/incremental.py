# monet/session/incremental.py
from __future__ import annotations
import asyncio, os, tempfile, uuid, logging
from typing import List, Optional
from monet.engines.freecut.executor.types import (
    Timeline, VideoSegment, ProjectSettings, RenderResult, CoverageReport,
)
from monet.engines.freecut.executor.ffmpeg_compiler import compile_timeline
from monet.engines.freecut.executor.drawtext import resolve_font_file
from .diff import diff_timelines, segment_hash, TimelineDiff
from .state import UnifiedSession

logger = logging.getLogger("monet.session.incremental")


async def render_segment_to_file(
    seg: VideoSegment, settings: ProjectSettings, index: int,
) -> str:
    """Render ONE video segment to its own file. Used for cache + splice."""
    out_dir = os.path.join(tempfile.gettempdir(), "monet-segments")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"seg_{segment_hash(seg)}.mp4")
    if os.path.exists(out_path):
        return out_path

    # Build a single-segment timeline and compile it
    single = Timeline(
        settings=settings, duration=(seg.sourceOut-seg.sourceIn)/seg.playbackSpeed,
        videoSegments=[seg], bgmTracks=[], captions=[],
    )
    compiled = compile_timeline(single)
    args = ["-y"]
    for inp in compiled.inputs: args += ["-i", inp]
    args += ["-filter_complex", compiled.filterGraph]
    args += compiled.mapArgs + compiled.outputArgs + [out_path]

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *args, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"segment render failed: {err.decode()[:500]}")
    return out_path


async def concat_segments(
    segment_paths: List[str], settings: ProjectSettings,
    output_path: Optional[str] = None,
) -> str:
    """Concat pre-rendered segments. Uses concat demuxer (no re-encode) when possible."""
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"concat{uuid.uuid4().hex[:8]}.mp4")

    list_path = os.path.join(tempfile.gettempdir(), f"concat_{uuid.uuid4().hex[:6]}.txt")
    with open(list_path, "w") as f:
        for p in segment_paths:
            f.write(f"file '{p}'\n")

    # Try stream-copy concat first (fast). Fall back to re-encode if it fails.
    args_copy = [
        "-y", "-f", "concat", "-safe", "0", "-i", list_path,
        "-c", "copy", output_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *args_copy, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode == 0:
        return output_path

    logger.info("[incremental] stream-copy concat failed, re-encoding")
    args_reenc = [
        "-y", "-f", "concat", "-safe", "0", "-i", list_path,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p",
        output_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *args_reenc, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"concat re-encode failed: {err.decode()[:500]}")
    return output_path


async def apply_overlays_and_audio(
    base_video: str, timeline: Timeline,
    output_path: Optional[str] = None,
) -> str:
    """
    Stamp captions + flashes + BGM mix onto a pre-concatenated base video.
    This step is fast even on long videos because it's a single linear pass.
    """
    if output_path is None:
        out_dir = os.path.join(tempfile.gettempdir(), "monet-media-dev")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"final{uuid.uuid4().hex[:8]}.mp4")

    args = ["-y", "-i", base_video]
    for bgm in timeline.bgmTracks:
        args += ["-i", bgm.inputPath]

    s = timeline.settings
    parts = []
    last_v = "[0:v]"

    from monet.engines.freecut.executor.drawtext import build_drawtext_filter
    for i, cap in enumerate(timeline.captions):
        out = f"[v_txt{i}]"
        parts.append(build_drawtext_filter(cap, s, last_v, out))
        last_v = out

    # flashes
    for i, fl in enumerate(getattr(timeline, "flashes", []) or []):
        out = f"[v_fl{i}]"
        parts.append(
            f"{last_v}drawbox=x=0:y=0:w={s.width}:h={s.height}:"
            f"color={fl['color']}@{fl['opacity']}:t=fill:"
            f"enable='between(t,{fl['startTime']:.3f},{fl['startTime']+fl['duration']:.3f})'{out}"
        )
        last_v = out

    parts.append(f"{last_v}null[v_out]")

    # Audio mix
    if timeline.bgmTracks:
        mix = ["[0:a]"]
        for i, bgm in enumerate(timeline.bgmTracks):
            inp = i + 1
            out = f"[a_bgm{i}]"
            d_ms = int(bgm.timelineStart * 1000)
            parts.append(
                f"[{inp}:a]atrim=start={bgm.sourceIn:.3f}:end={bgm.sourceOut:.3f},"
                f"asetpts=PTS-STARTPTS,volume={bgm.volume},"
                f"adelay={d_ms}|{d_ms}{out}"
            )
            mix.append(out)
        parts.append(
            f"{''.join(mix)}amix=inputs={len(mix)}:duration=longest:normalize=0[a_out]"
        )
        a_map = "[a_out]"
    else:
        a_map = "0:a?"

    args += [
        "-filter_complex", ";".join(parts),
        "-map", "[v_out]", "-map", a_map,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        output_path,
    ]

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", *args, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"overlay/audio pass failed: {err.decode()[:500]}")
    return output_path


async def incremental_render(
    session: UnifiedSession, new_timeline: Timeline, old_timeline: Optional[Timeline],
) -> tuple[str, dict]:
    """
    Main entry point: produce a final preview with minimum work possible.
    Returns: (output_path, stats_dict)
    """
    diff = diff_timelines(
        new_timeline, session.render_cache.hash_to_path, old_timeline,
    )

    stats = {
        "totalSegments": diff.total_segments,
        "cached": len(diff.unchanged_indices),
        "rerendered": len(diff.dirty_indices),
        "overlaysOnly": diff.fully_unchanged and (diff.captions_changed or diff.bgm_changed),
        "fullRender": diff.fully_dirty,
    }
    logger.info(f"[incremental] {stats}")

    # CASE 1: NOTHING changed → reuse last preview
    if diff.fully_unchanged and session.current_preview_path:
        return session.current_preview_path, stats

    # CASE 2: Only captions/audio changed → keep base video, re-apply overlays
    if (diff.fully_unchanged or not diff.dirty_indices) \
            and session.render_cache.last_full_render \
            and os.path.exists(session.render_cache.last_full_render):
        # Need to strip overlays from previous output? Easier: re-concat segments fresh.
        segment_paths = [
            session.render_cache.hash_to_path[segment_hash(s)]
            for s in new_timeline.videoSegments
        ]
        base = await concat_segments(segment_paths, new_timeline.settings)
        final = await apply_overlays_and_audio(base, new_timeline)
        session.current_preview_path = final
        return final, stats

    # CASE 3: Some/all segments dirty → render only those, splice
    render_tasks = [
        render_segment_to_file(new_timeline.videoSegments[i], new_timeline.settings, i)
        for i in diff.dirty_indices
    ]
    new_paths = await asyncio.gather(*render_tasks)

    # Update cache
    for i, path in zip(diff.dirty_indices, new_paths):
        h = segment_hash(new_timeline.videoSegments[i])
        session.render_cache.hash_to_path[h] = path

    # Assemble segment_paths in timeline order
    segment_paths = []
    for i, seg in enumerate(new_timeline.videoSegments):
        h = segment_hash(seg)
        segment_paths.append(session.render_cache.hash_to_path[h])

    base = await concat_segments(segment_paths, new_timeline.settings)
    session.render_cache.last_full_render = base

    final = await apply_overlays_and_audio(base, new_timeline)
    session.current_preview_path = final
    return final, stats
