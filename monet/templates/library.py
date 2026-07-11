# monet/templates/library.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, List
from monet.engines.freecut.executor.types import Action, AddMediaAction, SplitAction, UpdateClipAction, AddCaptionAction, CaptionStyle

@dataclass
class Template:
    id: str
    name: str
    description: str
    tags: List[str]
    build: Callable[[dict], List[Action]]  # (params) -> actions
    requires_music: bool = False
    thumbnail: str = ""


def _hype_drop(p: dict) -> List[Action]:
    """Drop the beat: slow-mo before the drop, snap-cut at the beat."""
    drop_at = p.get("drop_time", 4.0)
    label = p.get("text", "DROP IT")
    # Pydantic v2 structures
    return [
        AddMediaAction(type="addMedia", trackId="audio_1", mediaId="bgm_main", clipId="bgm", startTime=0.0),
        AddMediaAction(type="addMedia", trackId="video_1", mediaId="raw_footage", clipId="main_orig", startTime=0.0),
        SplitAction(type="split", trackId="video_1", clipId="main_orig", time=max(0.1, drop_at - 1.5)),
        UpdateClipAction(type="updateClip", trackId="video_1", clipId="main_orig_segment_1",
                         properties={"playbackSpeed": 0.4}),
        AddCaptionAction(type="addCaption", trackId="text_1", startTime=drop_at-0.3, duration=1.5,
                         text=label, style=CaptionStyle(color="yellow", fontSize="10vw",
                         fontFamily="Impact", textAlign="center", verticalAlign="middle",
                         backgroundColor="rgba(0,0,0,0.4)")),
    ]


def _cinematic_intro(p: dict) -> List[Action]:
    label = p.get("title", "MONET")
    return [
        AddMediaAction(type="addMedia", trackId="audio_1", mediaId="bgm_main", clipId="bgm", startTime=0.0),
        AddMediaAction(type="addMedia", trackId="video_1", mediaId="raw_footage", clipId="main", startTime=0.0),
        UpdateClipAction(type="updateClip", trackId="video_1", clipId="main",
                         properties={"playbackSpeed": 0.6}),
        AddCaptionAction(type="addCaption", trackId="text_1", startTime=0.5, duration=3.0,
                         text=label, style=CaptionStyle(color="white", fontSize="12vw",
                         fontFamily="Impact", textAlign="center", verticalAlign="middle")),
    ]


TEMPLATES: Dict[str, Template] = {
    "hype_drop": Template("hype_drop", "Hype Drop",
                          "Slow-mo into a beat-snapped cut with a big yellow text drop.",
                          ["viral", "music", "tiktok"], _hype_drop, requires_music=True),
    "cinematic_intro": Template("cinematic_intro", "Cinematic Intro",
                                "Slow opening with a clean title overlay.",
                                ["intro", "cinematic"], _cinematic_intro, requires_music=True),
}

def list_templates() -> list:
    return [{"id": t.id, "name": t.name, "description": t.description,
             "tags": t.tags, "requiresMusic": t.requires_music}
            for t in TEMPLATES.values()]

def apply_template(template_id: str, params: dict) -> List[Action]:
    t = TEMPLATES.get(template_id)
    if not t:
        raise ValueError(f"unknown template {template_id}")
    return t.build(params)
