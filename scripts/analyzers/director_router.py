"""Kove Component 4 — Dialogue-vs-Montage Router.

Classifies each project as dialogue-led or montage-led using cheap
signals already available in the pipeline. Routes to the matching
grammar with an override option.

Usage:
    mode = classify_content(footage_path, speech_data, profile)
    grammar = DIALOGUE_GRAMMAR if mode == "dialogue" else MONTAGE_GRAMMAR
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Classification thresholds (tunable)
DIALOGUE_SPEECH_THRESHOLD = 0.4       # speech_coverage >= 0.4 → dialogue
DIALOGUE_MIN_WORDS = 50               # fewer than 50 words → not dialogue
DIALOGUE_MAX_SHOT_DURATION = 3.0      # avg_shot_duration >= 3s → dialogue
DIALOGUE_MIN_FOOTAGE_DURATION = 60.0  # footage >= 60s → likely dialogue


def classify_content(
    footage_path: str,
    speech_data: Optional[dict] = None,
    profile: Optional[dict] = None,
    footage_duration: Optional[float] = None,
    mode_override: Optional[str] = None,
) -> str:
    """Classify as 'dialogue' or 'montage'.

    Priority:
        1. mode_override (user-specified)
        2. speech_coverage + word count (primary signal)
        3. footage duration + profile pacing (secondary signal)
        4. Default: montage (conservative — existing behavior unchanged)
    """
    if mode_override in ("dialogue", "montage"):
        return mode_override

    signals = _collect_signals(speech_data, profile, footage_duration)
    logger.debug(f"Router signals: {signals}")

    # Primary: speech coverage
    if signals.get("speech_coverage", 0) >= DIALOGUE_SPEECH_THRESHOLD:
        if signals.get("word_count", 0) >= DIALOGUE_MIN_WORDS:
            logger.info("Router → dialogue (speech_coverage={:.2f}, {} words)".format(
                signals["speech_coverage"], signals["word_count"],
            ))
            return "dialogue"

    # Secondary: long-form with slow pacing
    if signals.get("footage_duration", 0) >= DIALOGUE_MIN_FOOTAGE_DURATION:
        if signals.get("avg_shot_duration", 0) >= DIALOGUE_MAX_SHOT_DURATION:
            logger.info("Router → dialogue (long-form, slow pacing)")
            return "dialogue"

    logger.info("Router → montage (default)")
    return "montage"


def _collect_signals(
    speech_data: Optional[dict] = None,
    profile: Optional[dict] = None,
    footage_duration: Optional[float] = None,
) -> dict:
    signals = {}

    # From speech analysis
    if speech_data:
        signals["speech_coverage"] = speech_data.get("speech_coverage", 0)
        signals["word_count"] = len(speech_data.get("words", []))
        signals["sentence_count"] = len(speech_data.get("sentences", []))

    # From profile
    if profile:
        pacing = profile.get("pacing", {})
        signals["avg_shot_duration"] = pacing.get("avg_shot_duration", 0)
        signals["cut_to_beat_alignment_rate"] = pacing.get("cut_to_beat_alignment_rate", 0)
        signals["energy_curve_shape"] = pacing.get("energy_curve_shape", "steady_build")

    # Metadata
    if footage_duration:
        signals["footage_duration"] = footage_duration

    return signals
