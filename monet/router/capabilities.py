# monet/router/capabilities.py
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel


class Capability(str, Enum):
    BASIC_CUT_CONCAT = "basic_cut_concat"
    PLAYBACK_SPEED = "playback_speed"
    DRAWTEXT_CAPTION = "drawtext_caption"
    STYLED_TITLE_OVERLAY = "styled_title_overlay"   # animated/styled titles
    BGM_MIX = "bgm_mix"
    MULTIPLE_BGM = "multiple_bgm"
    AUDIO_DUCK = "audio_duck"
    CROSSFADE_TRANSITION = "crossfade_transition"
    KEN_BURNS = "ken_burns"
    CHROMA_KEY = "chroma_key"
    SAM_MASK = "sam_mask"
    MOTION_TRACK = "motion_track"
    BEAT_SYNC = "beat_sync"
    DEPTH_VFX = "depth_vfx"
    VERTICAL_9_16 = "vertical_9_16"


@dataclass(frozen=True)
class EngineProfile:
    name: str
    supports: Dict[Capability, float]   # capability -> quality score 0..1
    base_cost: float = 1.0              # render time cost weight
    notes: str = ""


FREECUT = EngineProfile(
    name="freecut",
    supports={
        Capability.BASIC_CUT_CONCAT: 1.0,
        Capability.PLAYBACK_SPEED: 1.0,
        Capability.DRAWTEXT_CAPTION: 0.85,     # functional but not animated
        Capability.STYLED_TITLE_OVERLAY: 0.5,
        Capability.BGM_MIX: 1.0,
        Capability.MULTIPLE_BGM: 1.0,
        Capability.AUDIO_DUCK: 0.9,
        Capability.CROSSFADE_TRANSITION: 0.6,
        Capability.CHROMA_KEY: 0.9,
        Capability.VERTICAL_9_16: 1.0,
        Capability.BEAT_SYNC: 0.4,             # via planner only
    },
    base_cost=1.0,
    notes="Raw FFmpeg graph. Full control, less polish on titles/transitions.",
)

EDITLY = EngineProfile(
    name="editly",
    supports={
        Capability.BASIC_CUT_CONCAT: 0.9,
        Capability.PLAYBACK_SPEED: 0.85,       # via duration trick
        Capability.DRAWTEXT_CAPTION: 0.9,
        Capability.STYLED_TITLE_OVERLAY: 1.0,  # killer feature
        Capability.BGM_MIX: 0.95,
        Capability.MULTIPLE_BGM: 0.85,
        Capability.CROSSFADE_TRANSITION: 1.0,
        Capability.KEN_BURNS: 1.0,
        Capability.VERTICAL_9_16: 1.0,
    },
    base_cost=1.4,
    notes="Higher-level. Great titles/transitions/Ken Burns. Slower.",
)

OPENCUT = EngineProfile(
    name="opencut",
    supports={
        Capability.BASIC_CUT_CONCAT: 1.0,
        Capability.PLAYBACK_SPEED: 0.9,
        Capability.DRAWTEXT_CAPTION: 0.9,
        Capability.STYLED_TITLE_OVERLAY: 0.85,
        Capability.BGM_MIX: 0.9,
        Capability.MULTIPLE_BGM: 0.8,
        Capability.VERTICAL_9_16: 1.0,
        Capability.CROSSFADE_TRANSITION: 0.85,
    },
    base_cost=1.2,
    notes="Web-friendly project format. Good baseline for SaaS round-trip.",
)

SAM_VFX = EngineProfile(
    name="sam_vfx",
    supports={
        Capability.BASIC_CUT_CONCAT: 0.7,
        Capability.PLAYBACK_SPEED: 0.7,
        Capability.SAM_MASK: 1.0,
        Capability.DEPTH_VFX: 0.85,
        Capability.MOTION_TRACK: 0.75,
        Capability.CHROMA_KEY: 0.95,
        Capability.VERTICAL_9_16: 1.0,
        Capability.BGM_MIX: 0.6,
    },
    base_cost=4.0,  # ML is expensive — only picked when truly needed
    notes="ML specialist (SAM2, Depth-Anything). High quality on masking/VFX, slow.",
)

ALL_ENGINES = [FREECUT, EDITLY, OPENCUT, SAM_VFX]


class CapabilityHint(BaseModel):
    """Planner-declared capability requirements. Overrides inference when present."""
    needs: List[Capability] = []           # MUST be supported
    prefers: List[Capability] = []         # nice-to-have, boosts scoring
    forbids: List[str] = []                # engine names to skip
    quality_weight: float = 1.0
    cost_weight: float = 0.25
    notes: Optional[str] = None
