# monet/engines/freecut/executor/ffmpeg_compiler.py
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict
from .types import Timeline
from .drawtext import build_drawtext_filter


@dataclass
class CompiledCommand:
    inputs: List[str]
    filterGraph: str
    mapArgs: List[str]
    outputArgs: List[str]


def _atempo_chain(speed: float) -> str:
    filters: List[str] = []
    remaining = speed
    while remaining < 0.5:
        filters.append("atempo=0.5")
        remaining /= 0.5
    while remaining > 2.0:
        filters.append("atempo=2.0")
        remaining /= 2.0
    if abs(remaining - 1.0) > 1e-6:
        filters.append(f"atempo={remaining:.6f}")
    return ",".join(filters) if filters else "atempo=1.0"


def compile_timeline(t: Timeline) -> CompiledCommand:
    s = t.settings
    inputs_map: Dict[int, str] = {}
    for seg in list(t.videoSegments) + list(t.bgmTracks):
        inputs_map[seg.inputIndex] = seg.inputPath
    inputs = [inputs_map[i] for i in sorted(inputs_map)]

    parts: List[str] = []
    v_labels, a_labels = [], []

    for i, seg in enumerate(t.videoSegments):
        v_in, v_out = f"[{seg.inputIndex}:v]", f"[v_seg{i}]"
        setpts = ("setpts=PTS-STARTPTS" if seg.playbackSpeed == 1.0
                  else f"setpts=(PTS-STARTPTS)/{seg.playbackSpeed}")
        parts.append(
            f"{v_in}trim=start={seg.sourceIn:.3f}:end={seg.sourceOut:.3f},"
            f"{setpts},scale={s.width}:{s.height}:force_original_aspect_ratio=increase,"
            f"crop={s.width}:{s.height},setsar=1,fps={s.fps}{v_out}"
        )
        v_labels.append(v_out)

        a_in, a_out = f"[{seg.inputIndex}:a]", f"[a_seg{i}]"
        atempo = _atempo_chain(seg.playbackSpeed)
        vol = 0.0 if seg.mute else seg.volume
        parts.append(
            f"{a_in}atrim=start={seg.sourceIn:.3f}:end={seg.sourceOut:.3f},"
            f"asetpts=PTS-STARTPTS,{atempo},volume={vol},aresample={s.audioSampleRate}{a_out}"
        )
        a_labels.append(a_out)

    n = len(t.videoSegments)
    concat_inputs = "".join(f"{v}{a}" for v, a in zip(v_labels, a_labels))
    parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[v_cat][a_cat_src]")

    last_v = "[v_cat]"
    for i, cap in enumerate(t.captions):
        out = f"[v_txt{i}]"
        parts.append(build_drawtext_filter(cap, s, last_v, out))
        last_v = out
    parts.append(f"{last_v}null[v_out]")

    mix_inputs = ["[a_cat_src]"]
    for i, bgm in enumerate(t.bgmTracks):
        out = f"[a_bgm{i}]"
        delay_ms = int(bgm.timelineStart * 1000)
        parts.append(
            f"[{bgm.inputIndex}:a]atrim=start={bgm.sourceIn:.3f}:end={bgm.sourceOut:.3f},"
            f"asetpts=PTS-STARTPTS,volume={bgm.volume},"
            f"adelay={delay_ms}|{delay_ms},apad=whole_dur={t.duration:.3f},"
            f"atrim=0:{t.duration:.3f},aresample={s.audioSampleRate}{out}"
        )
        mix_inputs.append(out)

    if len(mix_inputs) == 1:
        parts.append(f"[a_cat_src]anull[a_out]")
    else:
        parts.append(
            f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:"
            f"duration=longest:dropout_transition=0:normalize=0[a_out]"
        )

    return CompiledCommand(
        inputs=inputs,
        filterGraph=";".join(parts),
        mapArgs=["-map", "[v_out]", "-map", "[a_out]"],
        outputArgs=[
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "medium", "-crf", "20", "-r", str(s.fps),
            "-c:a", "aac", "-ar", str(s.audioSampleRate),
            "-ac", str(s.audioChannels), "-b:a", "192k",
            "-movflags", "+faststart", "-shortest",
        ],
    )
