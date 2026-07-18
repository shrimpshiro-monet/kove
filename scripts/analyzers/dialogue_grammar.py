"""Kove dialogue editing grammar — long-form, speech-led cutting.

Differs from the montage grammar:
  - Cuts land on sentence boundaries (not music beats)
  - Pacing is driven by speech rhythm (not energy curves)
  - Dead air is auto-trimmed
  - Emphasis words trigger punch-in scale keyframes
  - Output includes a caption track

Intended as a drop-in replacement for assemble_sequence() in edit_director.py
when the router detects dialogue mode.
"""

import logging
import math
import random
from typing import Optional

logger = logging.getLogger(__name__)


def assemble_dialogue_sequence(
    candidates: list[dict],
    target_duration: float,
    total_shots: int,
    speech_data: dict,
    profile: dict,
    footage_duration: float,
    min_shot: float = 0.5,
    max_shot: float = 12.0,
) -> list[dict]:
    """Assemble a shot sequence guided by speech rather than music beats.

    Key differences from montage assemble_sequence():
      1. Cuts prefer sentence boundaries (within ±150ms of sentence end)
      2. Dead-air gaps >400ms are compressed
      3. Each shot gets a potential punch-in at emphasized words
      4. No beat alignment; no energy-curve scoring
    """
    sentences = speech_data.get("sentences", [])
    speech_regions = speech_data.get("speech_regions", [])
    emphasis = speech_data.get("emphasis", [])
    dead_air = speech_data.get("dead_air", [])

    pacing = profile.get("pacing", {})
    avg_shot = pacing.get("avg_shot_duration", 4.0)  # dialogue defaults longer

    # Filter candidates within range
    usable = [c for c in candidates
              if min_shot <= c["time"] <= target_duration - min_shot]
    if not usable:
        step = target_duration / total_shots
        return _fallback_uniform(target_duration, total_shots, step)

    # Build sentence-boundary preference grid
    sentence_end_times = [s["end"] for s in sentences]
    sentence_start_times = [s["start"] for s in sentences]

    shots = []
    prev_time = 0.0

    for shot_idx in range(total_shots):
        remaining_time = target_duration - prev_time
        remaining_shots = total_shots - shot_idx
        ideal_duration = remaining_time / remaining_shots if remaining_shots > 0 else avg_shot

        window_start = prev_time + min_shot
        window_end = min(target_duration, prev_time + max_shot)

        in_window = [c for c in usable
                     if window_start <= c["time"] <= window_end
                     and c["time"] > prev_time]

        if not in_window:
            cut_time = min(window_end, prev_time + ideal_duration)
            cut_time = round(cut_time, 2)
            if cut_time >= target_duration - 0.1:
                cut_time = target_duration
        else:
            # Score candidates on sentence-boundary proximity
            cut_time = _pick_best_dialogue_cut(
                in_window, prev_time, ideal_duration,
                sentence_end_times, sentence_start_times,
                speech_regions, dead_air,
            )

        # Apply dead-air compression: if this shot starts with silence,
        # shift prev_time forward to skip it
        trimmed_start = _trim_dead_air(prev_time, cut_time, dead_air, speech_regions)

        duration = cut_time - trimmed_start
        if duration < min_shot:
            duration = min_shot
            cut_time = trimmed_start + min_shot

        # Assign punch-in emphasis points within this shot
        shot_emphasis = [
            e for e in emphasis
            if trimmed_start <= e["start"] <= cut_time
        ]
        punch_ins = _build_punch_ins(shot_emphasis, trimmed_start, cut_time)

        shots.append({
            "start": round(trimmed_start, 3),
            "end": round(cut_time, 3),
            "duration": round(duration, 3),
            "cut_type": "hard_cut",
            "speed": 1.0,
            "shake": 0,
            "punch_ins": punch_ins,
            "shot_index": shot_idx,
        })

        prev_time = cut_time
        if prev_time >= target_duration:
            break

    return shots


def _pick_best_dialogue_cut(
    candidates: list[dict],
    prev_time: float,
    ideal_duration: float,
    sentence_ends: list[float],
    sentence_starts: list[float],
    speech_regions: list[dict],
    dead_air: list[dict],
) -> float:
    """Score candidates and pick the best cut point for dialogue.

    Scoring dimensions:
      1. Sentence-end proximity (high weight): cut at sentence boundaries
      2. Duration fit: how close to ideal duration
      3. Speech-region alignment: prefer cuts in dead air or at speech boundaries
    """
    best_score = -float("inf")
    best_time = candidates[0]["time"]

    for c in candidates:
        t = c["time"]
        score = 0.0

        # Dimension 1: sentence-end proximity (weight 0.5)
        sent_off = _nearest_boundary_offset(t, sentence_ends)
        if sent_off is not None and sent_off < 0.15:
            score += 0.5 * (1.0 - sent_off / 0.15)

        # Dimension 2: duration fit (weight 0.3)
        duration = t - prev_time
        if ideal_duration > 0:
            ratio = duration / ideal_duration
            score += 0.3 * max(0, 1.0 - abs(1.0 - ratio) * 0.5)

        # Dimension 3: in dead air (weight 0.2)
        in_dead = _time_in_gaps(t, dead_air, tolerance=0.1)
        if in_dead:
            score += 0.2

        if score > best_score:
            best_score = score
            best_time = t

    return round(best_time, 2)


def _nearest_boundary_offset(t: float, boundaries: list[float]) -> Optional[float]:
    """Smallest absolute offset from t to any boundary in the list."""
    if not boundaries:
        return None
    off = min(abs(b - t) for b in boundaries)
    return off


def _time_in_gaps(t: float, gaps: list[dict], tolerance: float = 0.1) -> bool:
    """Is t within any gap (with tolerance on either side)."""
    for g in gaps:
        if (g["start"] - tolerance) <= t <= (g["end"] + tolerance):
            return True
    return False


def _trim_dead_air(
    shot_start: float, shot_end: float,
    dead_air: list[dict], speech_regions: list[dict],
) -> float:
    """Shift shot start forward to skip leading dead air."""
    for da in dead_air:
        if da["start"] <= shot_start <= da["end"]:
            new_start = da["end"]
            # But don't jump past the end of this shot
            if new_start < shot_end:
                return round(new_start, 3)
    return shot_start


def _build_punch_ins(emphasis: list[dict], shot_start: float, shot_end: float) -> list[dict]:
    """Build punch-in keyframes from emphasis words within this shot.

    Returns a list of (time, scale) events for the renderer.
    Max 1 punch per shot to avoid seasick effect.
    """
    if not emphasis:
        return []

    # Pick the most emphasized word
    best = max(emphasis, key=lambda e: e.get("score", 0))
    punch_time = (best["start"] + best["end"]) / 2
    return [{
        "time": round(punch_time, 3),
        "scale": 1.15,
        "duration": max(0.3, best["end"] - best["start"]),
    }]


def _fallback_uniform(target_duration: float, total_shots: int, step: float) -> list[dict]:
    """Evenly spaced shots when no candidates are available."""
    shots = []
    for i in range(total_shots):
        s = i * step
        e = min((i + 1) * step, target_duration)
        if e > s:
            shots.append({
                "start": round(s, 3),
                "end": round(e, 3),
                "duration": round(e - s, 3),
                "cut_type": "hard_cut",
                "speed": 1.0,
                "shake": 0,
                "punch_ins": [],
                "shot_index": i,
            })
    return shots


# ═══════════════════════════════════════════════════════════════
# Captions (Component 5 — free byproduct)
# ═══════════════════════════════════════════════════════════════

def generate_captions(
    transcript: dict,
    style: str = "karaoke",
    max_words_per_chunk: int = 3,
) -> list[dict]:
    """Generate caption overlay clips from word-level transcript.

    Args:
        transcript: dict with "words" list from speech_pipeline.transcribe()
        style: "karaoke" (per-word highlight) | "pop-on" (line-by-line)
        max_words_per_chunk: words per caption card (karaoke only)

    Returns:
        List of caption clip dicts for the EDL text track.
    """
    words = transcript.get("words", [])
    if not words:
        return []

    captions = []
    if style == "karaoke":
        for i in range(0, len(words), max_words_per_chunk):
            chunk = words[i:i + max_words_per_chunk]
            text = " ".join(w["word"] for w in chunk)
            captions.append({
                "text": text,
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
                "duration": round(chunk[-1]["end"] - chunk[0]["start"], 3),
                "meta": {
                    "words": chunk,
                    "style": "karaoke",
                },
            })
    else:
        # Pop-on: group by sentence
        for s in transcript.get("sentences", []):
            captions.append({
                "text": s["text"],
                "start": s["start"],
                "end": s["end"],
                "duration": round(s["end"] - s["start"], 3),
                "meta": {
                    "style": "pop-on",
                },
            })

    return captions
