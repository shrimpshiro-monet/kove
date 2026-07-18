# monet/engines/freecut/executor/timeline_builder.py
from __future__ import annotations
import re
from copy import deepcopy
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

from .types import (
    Action, AudioSegment, CaptionSegment, ProjectSettings,
    ResolvedCaptionStyle, Timeline, VideoSegment,
)
from .asset_resolver import AssetResolver
from .ffprobe import probe_duration


@dataclass
class _ClipState:
    trackId: str
    inputIndex: int
    inputPath: str
    kind: Literal["video", "audio"]
    sourceIn: float
    sourceOut: float
    timelineStart: float
    playbackSpeed: float = 1.0
    volume: float = 1.0
    mute: bool = False


def _parse_font_size(input_, settings: ProjectSettings) -> float:
    if isinstance(input_, (int, float)):
        return float(input_)
    if isinstance(input_, str):
        m = re.match(r"^([\d.]+)(vw|vh|px)?$", input_, re.I)
        if not m:
            return 72.0
        n = float(m.group(1))
        unit = (m.group(2) or "px").lower()
        if unit == "vw":
            return round(settings.width * n / 100)
        if unit == "vh":
            return round(settings.height * n / 100)
        return n
    return 72.0


def _normalize_caption_style(style, settings: ProjectSettings) -> ResolvedCaptionStyle:
    if style is None:
        return ResolvedCaptionStyle()
    return ResolvedCaptionStyle(
        color=style.color or "white",
        fontSize=_parse_font_size(style.fontSize, settings),
        fontFamily=style.fontFamily or "Arial",
        fontWeight=style.fontWeight or "bold",
        textAlign=style.textAlign or "center",
        verticalAlign=style.verticalAlign or "middle",
        backgroundColor=style.backgroundColor,
        strokeColor=style.strokeColor,
        strokeWidth=style.strokeWidth or 0,
    )


async def build_timeline(
    actions: List[Action],
    resolver: AssetResolver,
    settings: ProjectSettings,
) -> Timeline:
    clips: Dict[str, _ClipState] = {}
    captions: List[CaptionSegment] = []
    input_index_by_path: Dict[str, int] = {}

    def ensure_input(path: str) -> int:
        if path not in input_index_by_path:
            input_index_by_path[path] = len(input_index_by_path)
        return input_index_by_path[path]

    for a in actions:
        if a.type == "addMedia":
            entry = resolver.resolve(a.mediaId)
            if not entry:
                raise ValueError(f"addMedia: unresolved {a.mediaId}")
            duration = entry.durationSec or await probe_duration(entry.filePath)
            source_in = a.sourceIn if a.sourceIn is not None else 0.0
            source_out = a.sourceOut if a.sourceOut is not None else duration
            kind = "audio" if entry.kind == "audio" else "video"
            clips[a.clipId] = _ClipState(
                trackId=a.trackId,
                inputIndex=ensure_input(entry.filePath),
                inputPath=entry.filePath,
                kind=kind,
                sourceIn=source_in,
                sourceOut=source_out,
                timelineStart=a.startTime,
            )

        elif a.type == "split":
            orig = clips.get(a.clipId)
            if not orig:
                raise ValueError(f"split: unknown clipId {a.clipId}")
            split_source = orig.sourceIn + a.time
            if not (orig.sourceIn < split_source < orig.sourceOut):
                raise ValueError(f"split: time {a.time} out of bounds")
            seg1 = deepcopy(orig)
            seg1.sourceOut = split_source
            seg1_dur = seg1.sourceOut - seg1.sourceIn
            seg2 = deepcopy(orig)
            seg2.sourceIn = split_source
            seg2.timelineStart = orig.timelineStart + seg1_dur / orig.playbackSpeed
            del clips[a.clipId]
            clips[f"{a.clipId}_segment_1"] = seg1
            clips[f"{a.clipId}_segment_2"] = seg2

        elif a.type == "updateClip":
            c = clips.get(a.clipId)
            if not c:
                raise ValueError(f"updateClip: unknown {a.clipId}")
            if a.properties.playbackSpeed is not None:
                c.playbackSpeed = a.properties.playbackSpeed
            if a.properties.volume is not None:
                c.volume = a.properties.volume
            if a.properties.mute is not None:
                c.mute = a.properties.mute

        elif a.type == "removeClip":
            clips.pop(a.clipId, None)

        elif a.type == "addCaption":
            captions.append(CaptionSegment(
                startTime=a.startTime,
                duration=a.duration,
                text=a.text,
                style=_normalize_caption_style(a.style, settings),
            ))

    video_segments: List[VideoSegment] = []
    bgm_tracks: List[AudioSegment] = []

    for c in clips.values():
        if c.trackId.startswith("video"):
            video_segments.append(VideoSegment(
                inputIndex=c.inputIndex,
                inputPath=c.inputPath,
                sourceIn=c.sourceIn,
                sourceOut=c.sourceOut,
                timelineStart=c.timelineStart,
                playbackSpeed=c.playbackSpeed,
                volume=0.0 if c.mute else c.volume,
                mute=c.mute,
            ))
        elif c.trackId.startswith("audio"):
            bgm_tracks.append(AudioSegment(
                inputIndex=c.inputIndex,
                inputPath=c.inputPath,
                sourceIn=c.sourceIn,
                sourceOut=c.sourceOut,
                timelineStart=c.timelineStart,
                volume=0.0 if c.mute else c.volume,
            ))

    video_segments.sort(key=lambda s: s.timelineStart)
    bgm_tracks.sort(key=lambda s: s.timelineStart)

    duration = max(
        (s.timelineStart + (s.sourceOut - s.sourceIn) / s.playbackSpeed
         for s in video_segments),
        default=0.0,
    )

    return Timeline(
        settings=settings,
        duration=duration,
        videoSegments=video_segments,
        bgmTracks=bgm_tracks,
        captions=captions,
    )
