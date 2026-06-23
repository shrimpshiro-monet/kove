# monet/engines/editly/compiler.py
from __future__ import annotations
from typing import Any, Dict, List
from monet.engines.freecut.executor.types import Timeline, VideoSegment, CaptionSegment


def _caption_to_title_layer(cap: CaptionSegment, settings) -> Dict[str, Any]:
    # editly's "title" layer; uses 0..1 normalized positions
    valign = {"top": 0.1, "middle": 0.5, "bottom": 0.9}[cap.style.verticalAlign]
    halign = {"left": 0.1, "center": 0.5, "right": 0.9}[cap.style.textAlign]
    return {
        "type": "title",
        "text": cap.text,
        "textColor": cap.style.color,
        "fontPath": _font_for(cap.style.fontFamily),
        "fontSize": cap.style.fontSize / settings.height,  # editly uses fraction of height
        "position": {"x": halign, "y": valign, "originX": "center", "originY": "center"},
        "start": cap.startTime,
        "stop": cap.startTime + cap.duration,
    }


def _font_for(family: str) -> str:
    from monet.engines.freecut.executor.drawtext import resolve_font_file
    return resolve_font_file(family)


def _captions_overlapping(t: Timeline, start: float, end: float) -> List[CaptionSegment]:
    return [c for c in t.captions
            if c.startTime < end and (c.startTime + c.duration) > start]


def compile_to_editly(t: Timeline) -> Dict[str, Any]:
    """
    Builds a single Editly config from the IR. Each VideoSegment becomes its own
    'clip' with a 'video' layer; captions overlapping its time window become
    'title' sublayers offset relative to clip start.
    """
    clips: List[Dict[str, Any]] = []
    cursor = 0.0

    for seg in t.videoSegments:
        clip_dur = (seg.sourceOut - seg.sourceIn) / seg.playbackSpeed
        layers: List[Dict[str, Any]] = [{
            "type": "video",
            "path": seg.inputPath,
            "cutFrom": seg.sourceIn,
            "cutTo": seg.sourceOut,
            # editly slows down to fill clip duration when source range < clip duration
            "mixVolume": 0 if seg.mute else seg.volume,
        }]
        # caption layers that overlap this clip
        for cap in _captions_overlapping(t, cursor, cursor + clip_dur):
            local_start = max(0.0, cap.startTime - cursor)
            local_stop = min(clip_dur, (cap.startTime + cap.duration) - cursor)
            if local_stop <= local_start:
                continue
            title = _caption_to_title_layer(cap, t.settings).copy()
            title["start"] = local_start
            title["stop"] = local_stop
            layers.append(title)

        clips.append({"duration": clip_dur, "layers": layers})
        cursor += clip_dur

    config: Dict[str, Any] = {
        "width": t.settings.width,
        "height": t.settings.height,
        "fps": t.settings.fps,
        "outPath": "OUTPUT_PATH_PLACEHOLDER",
        "allowRemoteRequests": False,
        "fast": False,
        "clips": clips,
    }

    # BGM: editly supports a single audioFilePath plus audioTracks[] array
    if t.bgmTracks:
        bgm_main = t.bgmTracks[0]
        config["audioFilePath"] = bgm_main.inputPath
        config["loopAudio"] = True
        config["audioNorm"] = {"enable": True, "gaussSize": 5, "maxGain": 30}
        # additional tracks
        if len(t.bgmTracks) > 1:
            config["audioTracks"] = [
                {"path": b.inputPath, "start": b.timelineStart,
                 "cutFrom": b.sourceIn, "cutTo": b.sourceOut,
                 "mixVolume": b.volume}
                for b in t.bgmTracks[1:]
            ]
    return config
