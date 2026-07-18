# monet/engines/opencut/compiler.py
from __future__ import annotations
from typing import Any, Dict, List
import uuid
from monet.engines.freecut.executor.types import Timeline


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def compile_to_opencut(t: Timeline) -> Dict[str, Any]:
    """
    Produces an OpenCut-compatible project JSON.
    Structure: { project: { settings, tracks: [ {kind, clips: [...]}, ... ] } }
    """
    video_track: Dict[str, Any] = {
        "id": _new_id(), "kind": "video", "name": "V1", "clips": []
    }
    audio_track: Dict[str, Any] = {
        "id": _new_id(), "kind": "audio", "name": "BGM", "clips": []
    }
    text_track: Dict[str, Any] = {
        "id": _new_id(), "kind": "text", "name": "Captions", "clips": []
    }

    for seg in t.videoSegments:
        video_track["clips"].append({
            "id": _new_id(),
            "sourcePath": seg.inputPath,
            "in": seg.sourceIn,
            "out": seg.sourceOut,
            "start": seg.timelineStart,
            "speed": seg.playbackSpeed,
            "volume": 0 if seg.mute else seg.volume,
            "fit": "cover",
        })

    for bgm in t.bgmTracks:
        audio_track["clips"].append({
            "id": _new_id(),
            "sourcePath": bgm.inputPath,
            "in": bgm.sourceIn,
            "out": bgm.sourceOut,
            "start": bgm.timelineStart,
            "volume": bgm.volume,
        })

    for cap in t.captions:
        text_track["clips"].append({
            "id": _new_id(),
            "kind": "text",
            "text": cap.text,
            "start": cap.startTime,
            "duration": cap.duration,
            "style": {
                "color": cap.style.color,
                "fontFamily": cap.style.fontFamily,
                "fontSize": cap.style.fontSize,
                "fontWeight": cap.style.fontWeight,
                "textAlign": cap.style.textAlign,
                "verticalAlign": cap.style.verticalAlign,
                "background": cap.style.backgroundColor,
            },
        })

    return {
        "version": 1,
        "project": {
            "id": _new_id(),
            "settings": {
                "width": t.settings.width,
                "height": t.settings.height,
                "fps": t.settings.fps,
                "sampleRate": t.settings.audioSampleRate,
                "channels": t.settings.audioChannels,
                "duration": t.duration,
            },
            "tracks": [video_track, text_track, audio_track],
        }
    }
