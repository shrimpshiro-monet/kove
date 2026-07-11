# monet/router/router.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from monet.engines.freecut.executor.types import Action, Timeline
from .capabilities import Capability, EngineProfile, ALL_ENGINES, FREECUT, CapabilityHint


# ---------- Capability inference from plan ----------

def infer_capabilities(actions: List[Action], hints: Optional[Set[Capability]] = None) -> Set[Capability]:
    caps: Set[Capability] = set(hints or [])
    caps.add(Capability.VERTICAL_9_16)
    has_video = has_audio = has_caption = has_speed = False
    bgm_count = 0
    for a in actions:
        if a.type == "addMedia":
            if a.trackId.startswith("video_"):
                has_video = True
            elif a.trackId.startswith("audio_"):
                has_audio = True
                bgm_count += 1
        elif a.type == "updateClip":
            if a.properties.playbackSpeed not in (None, 1.0):
                has_speed = True
        elif a.type == "addCaption":
            has_caption = True

    if has_video:
        caps.add(Capability.BASIC_CUT_CONCAT)
    if has_speed:
        caps.add(Capability.PLAYBACK_SPEED)
    if has_caption:
        caps.add(Capability.STYLED_TITLE_OVERLAY)
    if has_audio:
        caps.add(Capability.BGM_MIX)
    if bgm_count > 1:
        caps.add(Capability.MULTIPLE_BGM)
    return caps


# ---------- Scoring ----------

@dataclass
class EngineScore:
    engine: EngineProfile
    quality: float
    cost: float
    missing: List[Capability]
    score: float


def score_engines_with_hints(
    inferred: Set[Capability],
    hint: Optional[CapabilityHint] = None,
    engines: List[EngineProfile] = ALL_ENGINES,
) -> List[EngineScore]:
    hint = hint or CapabilityHint()
    required = inferred | set(hint.needs)
    preferred = set(hint.prefers)
    forbid = set(hint.forbids)

    out: List[EngineScore] = []
    for eng in engines:
        if eng.name in forbid:
            continue
        missing_required = [c for c in (set(hint.needs) | inferred) if c not in eng.supports]
        # HARD FAIL on explicit "needs" gaps — those engines get -infinity
        hard_fail = any(c in hint.needs and c not in eng.supports for c in hint.needs)

        quality = sum(eng.supports.get(c, 0.0) for c in required) / max(1, len(required))
        pref_bonus = sum(eng.supports.get(c, 0.0) for c in preferred) * 0.15
        cost = eng.base_cost
        miss_penalty = 1.5 * len(missing_required)

        score = (
            -1e9 if hard_fail
            else (hint.quality_weight * quality) + pref_bonus
                 - (hint.cost_weight * cost) - miss_penalty
        )
        
        try:
            from monet.learning.reward import get_weights
            learned = get_weights()
            weight = learned.get(eng.name, 1.0)
            if score > 0:
                score *= weight
            else:
                # If score is negative, multiplying by weight would make it more negative or less negative incorrectly
                # So we can adjust it additively or handle appropriately
                score /= max(0.1, weight)
        except Exception:
            pass

        out.append(EngineScore(eng, quality, cost, missing_required, score))
    out.sort(key=lambda x: x.score, reverse=True)
    return out


def pick_engine_with_hints(
    actions: List[Action],
    hint: Optional[CapabilityHint] = None,
) -> EngineScore:
    inferred = infer_capabilities(actions, set(hint.prefers) if hint else None)
    return score_engines_with_hints(inferred, hint)[0]


def pick_engine(
    actions: List[Action],
    hints: Optional[Set[Capability]] = None,
    forbid: Optional[Set[str]] = None,
) -> EngineScore:
    caps = infer_capabilities(actions, hints)
    candidates = [e for e in ALL_ENGINES if not forbid or e.name not in forbid]
    return score_engines_with_hints(caps, None, candidates)[0]


# ---------- Multi-pass split routing ----------

@dataclass
class RoutedPass:
    engine: EngineProfile
    actions: List[Action]
    purpose: str


def route_multi_pass(actions: List[Action]) -> List[RoutedPass]:
    """
    Splits a plan into engine-specialized passes when no single engine covers
    every required capability optimally.

    Heuristic:
      Pass 1 (base cut/speed/BGM): cheapest engine that covers BASIC + SPEED + BGM.
      Pass 2 (captions/titles): the best STYLED_TITLE_OVERLAY engine, overlays
         onto Pass 1's output as a new addMedia + addCaption set.
    """
    base_actions = [
        a for a in actions
        if a.type in ("addMedia", "split", "updateClip", "removeClip")
    ]
    caption_actions = [a for a in actions if a.type == "addCaption"]

    base_caps = infer_capabilities(base_actions)
    base_engine = score_engines_with_hints(base_caps)[0].engine

    passes = [RoutedPass(base_engine, base_actions, purpose="base cut + speed + bgm")]

    if caption_actions:
        cap_caps = {Capability.STYLED_TITLE_OVERLAY, Capability.VERTICAL_9_16}
        cap_engine = score_engines_with_hints(cap_caps)[0].engine
        passes.append(RoutedPass(cap_engine, caption_actions, purpose="captions/titles overlay"))

    return passes
