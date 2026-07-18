"""
Edit Grammar — structured decomposition of video editing style.

Three levels:
1. Shot — one continuous clip between two cuts
2. Video — full shot sequence + global stats
3. Profile — aggregated style across N videos (the reusable artifact)

CV fields are *measured* (deterministic). LLM fields are *interpreted*.
Kept separate at the shot level so you can debug each layer independently.
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import numpy as np


# ═══════════════════════════════════════════════════════════════
# DATA MODELS (plain dicts for JSON portability — no Pydantic)
# ═══════════════════════════════════════════════════════════════

SHOT_CV_SCHEMA = {
    "start_ts": float,
    "end_ts": float,
    "duration": float,
    "cut_type": str,         # hard_cut | crossfade | whip_pan | zoom_transition | jump_cut
    "motion_energy": float,  # 0-1 normalized optical flow magnitude
    "audio_onset_aligned": bool,
    "onset_offset_ms": float,
    "text_overlay": dict,    # {present, content, bbox}
    "loudness_db": float,
}

SHOT_LLM_SCHEMA = {
    "energy_label": str,     # low | mid | high | peak
    "pacing_role": str,      # build | peak | release | establish | punchline
    "cut_reason": str,
    "shot_type": str,
    "narrative_function": str,
    "confidence": float,
}

VIDEO_GLOBAL_STATS_SCHEMA = {
    "total_shots": int,
    "avg_shot_duration": float,
    "median_shot_duration": float,
    "shot_duration_stddev": float,
    "cut_to_beat_alignment_rate": float,
    "energy_curve": list,    # per-second sampled
    "text_overlay_count": int,
    "text_overlay_avg_duration": float,
}


def make_shot_cv(
    start_ts: float,
    end_ts: float,
    cut_type: str = "hard_cut",
    motion_energy: float = 0.0,
    audio_onset_aligned: bool = False,
    onset_offset_ms: float = 0.0,
    text_overlay: Optional[dict] = None,
    loudness_db: float = -20.0,
) -> dict:
    return {
        "start_ts": round(start_ts, 3),
        "end_ts": round(end_ts, 3),
        "duration": round(end_ts - start_ts, 3),
        "cut_type": cut_type,
        "motion_energy": round(motion_energy, 3),
        "audio_onset_aligned": audio_onset_aligned,
        "onset_offset_ms": round(onset_offset_ms, 1),
        "text_overlay": text_overlay or {"present": False, "content": None, "bbox": None},
        "loudness_db": round(loudness_db, 1),
    }


def make_shot_llm(
    energy_label: str = "mid",
    pacing_role: str = "build",
    cut_reason: str = "",
    shot_type: str = "generic",
    narrative_function: str = "transition",
    confidence: float = 0.5,
) -> dict:
    return {
        "energy_label": energy_label,
        "pacing_role": pacing_role,
        "cut_reason": cut_reason,
        "shot_type": shot_type,
        "narrative_function": narrative_function,
        "confidence": round(confidence, 3),
    }


# ═══════════════════════════════════════════════════════════════
# SHOT-LEVEL CV FEATURE EXTRACTION
# ═══════════════════════════════════════════════════════════════

def _get_cut_type(shot_start: float, transitions: list[dict]) -> str:
    """Find the transition type that matches this shot's start time."""
    CUT_TYPE_MAP = {
        "crossfade": "crossfade",
        "fade_to_black": "crossfade",
        "fade_from_black": "crossfade",
        "fade_to_white": "crossfade",
        "fade_from_white": "crossfade",
        "blur_transition": "crossfade",
        "whip_pan": "whip_pan",
        "zoom_transition": "zoom_transition",
        "slide": "whip_pan",
        "spin": "whip_pan",
        "glitch": "jump_cut",
        "flash_white": "jump_cut",
        "flash_black": "jump_cut",
        "wipe": "crossfade",
        "cut": "hard_cut",
    }
    best_t = None
    best_dt = 0.5
    for t in transitions:
        dt = abs(t["time"] - shot_start)
        if dt < best_dt:
            best_dt = dt
            best_t = t
    if best_t:
        return CUT_TYPE_MAP.get(best_t["type"], "hard_cut")
    return "hard_cut"


def _compute_shot_motion(shot_start: float, shot_end: float, motion_data: list[dict]) -> float:
    """Average optical flow magnitude over the shot, normalised 0-1."""
    samples = [m for m in motion_data if shot_start <= m["time"] <= shot_end]
    if not samples:
        return 0.0
    mags = [m.get("magnitude", 0) for m in samples]
    return float(np.mean(mags)) if mags else 0.0


def _compute_onset_alignment(shot_start: float, beats: list[float]) -> tuple[bool, float]:
    """Is the cut at shot_start aligned to a beat? Returns (aligned, offset_ms)."""
    if not beats:
        return False, 0.0
    best = min(beats, key=lambda b: abs(b - shot_start))
    offset = abs(best - shot_start)
    aligned = offset < 0.1
    offset_ms = offset * 1000
    return aligned, offset_ms


def _get_shot_text(shot_index: int, per_shot_text: list[dict]) -> dict:
    """Get text overlay info for this shot."""
    for st in per_shot_text:
        if st.get("shotIndex") == shot_index:
            if st.get("hasText") and st.get("textContent"):
                tc = st["textContent"]
                first = tc[0] if tc else {}
                return {
                    "present": True,
                    "content": first.get("text", ""),
                    "bbox": first.get("bbox"),
                }
            return {"present": False, "content": None, "bbox": None}
    return {"present": False, "content": None, "bbox": None}


def _compute_shot_loudness(shot_start: float, shot_end: float, audio_y, sr: float) -> float:
    """RMS->dB for a shot's audio segment."""
    import librosa
    start_s = max(0, int(shot_start * sr))
    end_s = min(len(audio_y), int(shot_end * sr))
    if end_s <= start_s:
        return -20.0
    chunk = audio_y[start_s:end_s]
    rms = float(np.sqrt(np.mean(chunk ** 2)))
    if rms < 1e-6:
        return -60.0
    db = 20 * np.log10(rms)
    return float(db)


def extract_per_shot_cv(
    shots: list[dict],
    transitions: list[dict],
    motion_data: list[dict],
    beats: list[float],
    per_shot_text: list[dict],
    audio_y=None,
    sr: float = 22050,
    trim_start: float = 0.0,
    trim_end: Optional[float] = None,
) -> list[dict]:
    """Build shot-level CV feature dicts from all deterministic measurements.

    Only includes shots within [trim_start, trim_end] edit zone.
    Motion energy is rank-normalized per-video (percentile) so that
    the most energetic shot always gets ~1.0 and the least gets ~0.0.
    """
    # First pass: compute raw motion for all shots in edit zone
    raw_motions = []
    filtered = []
    for i, s in enumerate(shots):
        start = s["start"]
        end = s["end"]
        if trim_end is not None and (start < trim_start or start > trim_end):
            continue
        if end - start < 0.1:
            continue
        raw = _compute_shot_motion(start, end, motion_data)
        raw_motions.append(raw)
        filtered.append((i, start, end, raw))

    # Rank-normalize: convert raw motion to 0-1 percentile within this video
    if raw_motions:
        arr = np.array(raw_motions)
        # Use CDF-like rank normalization
        sorted_vals = np.sort(arr)
        ranks = np.searchsorted(sorted_vals, arr) / max(len(arr), 1)
        # Blend: 70% rank + 30% raw-normalized (so max motion still gets 1.0)
        raw_norm = (arr - arr.min()) / max(arr.max() - arr.min(), 1e-6)
        motion_norm = ranks * 0.7 + raw_norm * 0.3
    else:
        motion_norm = []

    cv_shots = []
    for idx, (i, start, end, raw) in enumerate(filtered):
        cut_type = _get_cut_type(start, transitions)
        mn = float(motion_norm[idx]) if idx < len(motion_norm) else 0.0
        aligned, offset_ms = _compute_onset_alignment(start, beats)
        text_info = _get_shot_text(i, per_shot_text)
        loudness = _compute_shot_loudness(start, end, audio_y, sr) if audio_y is not None else -20.0

        cv_shots.append(make_shot_cv(
            start_ts=start,
            end_ts=end,
            cut_type=cut_type,
            motion_energy=mn,
            audio_onset_aligned=aligned,
            onset_offset_ms=offset_ms,
            text_overlay=text_info,
            loudness_db=loudness,
        ))
    return cv_shots


# ═══════════════════════════════════════════════════════════════
# PER-SHOT LLM REASONING
# ═══════════════════════════════════════════════════════════════

_SHOT_REASONING_PROMPT = """You are analyzing one shot from a video edit. Given the CV-measured features below, output JSON interpreting the shot's role in the edit.

Shot CV features:
{shot_cv_json}

Respond with ONLY valid JSON matching this schema:
{{
  "energy_label": "low" | "mid" | "high" | "peak",
  "pacing_role": "establish" | "build" | "peak" | "release" | "punchline",
  "cut_reason": "brief explanation of why this cut was made at this moment",
  "shot_type": "describes the shot composition (e.g. closeup, wide, tracking_side_pan, over_shoulder, aerial, pov, medium_two_shot, insert)",
  "narrative_function": "hero_shot" | "action" | "reaction" | "transition" | "context" | "sponsor_insert" | "text_overlay" | "punchline",
  "confidence": 0.0 to 1.0
}}

Guidelines:
- energy_label: based on motion_energy (>0.6=high, >0.4=mid), cut type (jump_cut=high), loudness (>-10=peak)
- pacing_role: establish=slow intro shots, build=motion building up, peak=most intense, release=calming down, punchline=final impactful shot
- cut_reason: infer from motion changes, beat alignment, text overlay timing
- shot_type: infer from motion pattern and context
- narrative_function: infer from text overlay presence, shot position, energy
- confidence: how sure you are (0.5+ if features are clear, <0.5 if ambiguous)"""


def _llm_client():
    """Get the LLM client (Groq via workers llm_client or fallback)."""
    workers_path = os.path.join(os.path.dirname(__file__), "..", "..", "workers", "python-director", "src")
    sys.path.insert(0, workers_path)
    try:
        from llm_client import LLMClient
        return LLMClient()
    except ImportError:
        pass
    # Fallback: try script-level llm_analyzer
    try:
        from analyzers.llm_analyzer import _get_client as get_llm
        return get_llm()
    except ImportError:
        return None


def reason_per_shot_llm(
    cv_shots: list[dict],
    llm_client=None,
    batch_size: int = 5,
) -> list[dict]:
    """Call LLM per-shot (or in small batches) for structured interpretation.

    Returns list of shot_llm dicts in same order as cv_shots.
    If LLM unavailable, returns default interpretations for all shots.
    """
    if llm_client is None:
        llm_client = _llm_client()

    llm_shots = []
    for i, cv in enumerate(cv_shots):
        if llm_client is None:
            # Default fallback based on heuristics
            llm_shots.append(_heuristic_shot_llm(cv, i, len(cv_shots)))
            continue

        prompt = _SHOT_REASONING_PROMPT.format(shot_cv_json=json.dumps(cv, indent=2))
        try:
            if hasattr(llm_client, "generate"):
                text = llm_client.generate(prompt, temperature=0.3, max_tokens=512)
            else:
                text = llm_client(prompt)
            parsed = _extract_json(text)
            llm_shots.append({
                "energy_label": parsed.get("energy_label", "mid"),
                "pacing_role": parsed.get("pacing_role", "build"),
                "cut_reason": parsed.get("cut_reason", ""),
                "shot_type": parsed.get("shot_type", "generic"),
                "narrative_function": parsed.get("narrative_function", "transition"),
                "confidence": float(parsed.get("confidence", 0.5)),
            })
        except Exception as e:
            print(f"  [llm] Shot {i} failed: {e}")
            llm_shots.append(_heuristic_shot_llm(cv, i, len(cv_shots)))

    return llm_shots


def _extract_json(text: str) -> dict:
    """Extract JSON object from LLM response (handles markdown fences)."""
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    # Find first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def _heuristic_shot_llm(cv: dict, idx: int, total: int) -> dict:
    """Rule-based fallback when LLM is unavailable.

    Uses rank-normalized motion_energy (0-1, percentile within video),
    cut type, text overlay, and loudness to estimate energy/pacing.
    """
    me = cv["motion_energy"]  # 0-1, normalized
    dur = cv["duration"]
    aligned = cv["audio_onset_aligned"]
    ct = cv["cut_type"]
    has_text = cv["text_overlay"]["present"]
    loudness = cv["loudness_db"]

    # energy_label: use rank-normalized motion + loudness + cut type
    is_loud = loudness > -10
    is_silent = loudness < -25
    energy_score = me * 0.5 + (0.2 if aligned else 0) + (0.2 if is_loud else -0.1 if is_silent else 0) + (0.15 if ct in ("whip_pan", "zoom_transition", "jump_cut") else 0)

    if energy_score > 0.7 or ct == "jump_cut":
        el = "peak" if idx == total - 1 else "high"
    elif energy_score > 0.45:
        el = "high"
    elif energy_score > 0.25:
        el = "mid"
    else:
        el = "low"

    # pacing_role: use position in video + energy + cut type
    first_third = total // 3
    last_third = total - total // 3 if total > 2 else total
    if idx == 0:
        pr = "establish"
    elif idx == total - 1:
        pr = "punchline"
    elif el == "peak" or (el == "high" and idx >= first_third and idx <= last_third):
        pr = "peak" if el == "peak" else "build"
    elif el == "high":
        pr = "build"
    elif el == "low" and dur > 2.0 and idx > last_third:
        pr = "release"
    else:
        # Middle of video: mostly build
        pr = "build"

    # narrative_function
    if has_text:
        nf = "text_overlay"
    elif el == "peak" or (el == "high" and idx >= total // 3 and idx <= total - total // 3):
        nf = "action"
    elif idx == 0:
        nf = "context"
    elif idx == total - 1:
        nf = "punchline"
    elif el == "low" and dur > 2.0:
        nf = "transition"
    else:
        nf = "transition"

    # cut_reason
    reasons = []
    if aligned:
        reasons.append("cut lands on beat")
    if me > 0.5:
        reasons.append("high motion energy")
    if has_text:
        reasons.append("text overlay active")
    if ct != "hard_cut":
        reasons.append(f"{ct} transition")
    cut_reason = "; ".join(reasons) if reasons else "scene change"

    # shot_type
    if me < 0.1:
        st = "static_wide"
    elif me < 0.3:
        st = "medium"
    elif ct in ("whip_pan", "zoom_transition"):
        st = ct
    else:
        st = "dynamic_handheld"

    return {
        "energy_label": el,
        "pacing_role": pr,
        "cut_reason": cut_reason,
        "shot_type": st,
        "narrative_function": nf,
        "confidence": 0.6,
    }


# ═══════════════════════════════════════════════════════════════
# VIDEO-LEVEL AGGREGATION
# ═══════════════════════════════════════════════════════════════

def build_energy_curve(cv_shots: list[dict], total_duration: float, samples: int = 40) -> list[float]:
    """Sample energy curve at consistent intervals (always per-N-samples, not per-shot)."""
    curve = []
    segment = total_duration / samples if samples > 0 else 1.0
    for i in range(samples):
        t = i * segment
        # Find shot at this time
        for cv in cv_shots:
            if cv["start_ts"] <= t <= cv["end_ts"]:
                curve.append(cv["motion_energy"])
                break
        else:
            curve.append(0.0)
    return [round(v, 3) for v in curve]


def aggregate_video_grammar(
    shot_cv: list[dict],
    shot_llm: list[dict],
    video_id: str,
    total_duration: float,
    beats: list[float],
    source_platform: str = "",
    creator_handle: str = "",
    reference_profile: Any = None,
) -> dict:
    """Build video-level grammar object from per-shot data.

    If reference_profile is provided (a ReferenceStyleProfile pydantic model),
    carries through all extracted fields that build_style_profile needs.
    """
    durations = [s["duration"] for s in shot_cv]
    n = len(shot_cv)

    aligned_cuts = sum(1 for s in shot_cv if s["audio_onset_aligned"])
    alignment_rate = aligned_cuts / n if n > 0 else 0.0

    text_shots = [s for s in shot_cv if s["text_overlay"]["present"]]
    text_count = len(text_shots)
    text_durs = [s["duration"] for s in text_shots]
    text_avg_dur = float(np.mean(text_durs)) if text_durs else 0.0

    energy_curve = build_energy_curve(shot_cv, total_duration)

    # Build shot objects with merged cv + llm
    shots_out = []
    for i, (cv, llm) in enumerate(zip(shot_cv, shot_llm)):
        shots_out.append({
            "shot_id": f"shot_{i:04d}",
            "video_id": video_id,
            "index": i,
            "cv": cv,
            "llm": llm,
        })

    # Extract extra fields from reference profile if provided
    reference_data = {}
    if reference_profile is not None:
        try:
            reference_data = {
                "color_signature": {
                    "brightness": reference_profile.color_signature.brightness,
                    "contrast": reference_profile.color_signature.contrast,
                    "saturation": reference_profile.color_signature.saturation,
                    "style": reference_profile.color_signature.style,
                },
                "audio_events": [
                    {
                        "time": e.time,
                        "type": e.type,
                        "confidence": e.confidence,
                        "energy": e.energy,
                        "spectral_centroid": e.spectral_centroid,
                    }
                    for e in reference_profile.audio_events
                ],
                "effect_vocabulary": list(reference_profile.effect_vocabulary),
                "camera_motion_distribution": dict(reference_profile.camera_motion_distribution),
                "avg_speed": reference_profile.avg_speed,
                "speed_variance": reference_profile.speed_variance,
                "bpm": reference_profile.bpm,
                "beats": list(reference_profile.beats),
                "energy_curve_full": list(reference_profile.energy_curve),
                "pacing_type": reference_profile.pacing_type,
                "cut_alignment": reference_profile.cut_alignment,
                "transition_vocabulary": list(reference_profile.transition_vocabulary),
                "avg_transition_duration": reference_profile.avg_transition_duration,
                "shot_duration_variance": reference_profile.shot_duration_variance,
                "climax_position": reference_profile.climax_position,
            }
            # Per-segment color data
            seg_colors = []
            for seg in reference_profile.segments:
                seg_colors.append({
                    "start": seg.start,
                    "brightness": seg.brightness,
                    "contrast": seg.contrast,
                    "saturation": seg.saturation,
                    "camera_motion": seg.camera_motion,
                    "speed": seg.speed,
                    "blur": seg.blur,
                    "vignette": seg.vignette,
                    "grain": seg.grain,
                    "glow": seg.glow,
                    "shake": seg.shake,
                    "rgb_split": seg.rgb_split,
                    "color_temp": seg.color_temp,
                    "color_tint": seg.color_tint,
                    "has_text": seg.has_text,
                    "text_content": seg.text_content,
                    "transition_type": seg.transition_type,
                    "transition_duration": seg.transition_duration,
                })
            reference_data["segment_colors"] = seg_colors
        except Exception as e:
            print(f"  [grammar] Warning: could not extract reference profile data: {e}")

    return {
        "video_id": video_id,
        "source_platform": source_platform,
        "creator_handle": creator_handle,
        "duration_sec": round(total_duration, 3),
        "shots": shots_out,
        "global_stats": {
            "total_shots": n,
            "avg_shot_duration": round(float(np.mean(durations)), 3) if durations else 0.0,
            "median_shot_duration": round(float(np.median(durations)), 3) if durations else 0.0,
            "shot_duration_stddev": round(float(np.std(durations)), 3) if durations else 0.0,
            "cut_to_beat_alignment_rate": round(alignment_rate, 3),
            "energy_curve": energy_curve,
            "text_overlay_count": text_count,
            "text_overlay_avg_duration": round(text_avg_dur, 3),
        },
        "reference_profile": reference_data if reference_data else None,
    }


# ═══════════════════════════════════════════════════════════════
# STYLE PROFILE (aggregated across N videos)
# ═══════════════════════════════════════════════════════════════

def _classify_energy_shape(energy_curve: list[float]) -> str:
    """Classify the overall energy curve shape."""
    if len(energy_curve) < 3:
        return "flat"
    # Check for spike-then-release (peak in first third, drops)
    first_third = energy_curve[:len(energy_curve)//3]
    rest = energy_curve[len(energy_curve)//3:]
    if max(first_third) > 0 and max(first_third) > max(rest) * 1.2:
        return "spike_then_release"
    # Check for steady build (monotonically increasing trend)
    half = len(energy_curve)//2
    if np.mean(energy_curve[half:]) > np.mean(energy_curve[:half]) * 1.15:
        return "steady_build"
    # Sawtooth (many peaks)
    peaks = sum(1 for i in range(1, len(energy_curve)-1)
                if energy_curve[i] > energy_curve[i-1] and energy_curve[i] > energy_curve[i+1])
    if peaks > len(energy_curve) * 0.2:
        return "sawtooth"
    return "flat"


def _count_transition_types(shot_cv: list[dict]) -> dict[str, float]:
    """Compute transition type distribution from shot CV data."""
    counts = {}
    for s in shot_cv:
        ct = s["cut_type"]
        counts[ct] = counts.get(ct, 0) + 1
    total = sum(counts.values()) or 1
    return {k: round(v / total, 3) for k, v in sorted(counts.items())}


def build_style_profile(
    video_grammars: list[dict],
    profile_id: str = "signature_style_v1",
    creator_handle: str = "",
) -> dict:
    """Aggregate multiple video grammars into a reusable style profile.

    This is the artifact Key 2 (directing) consumes to make decisions
    on new footage.
    """
    if not video_grammars:
        return {"profile_id": profile_id, "error": "no videos analyzed"}

    # Collect all shot CV data
    all_durations = []
    all_alignment = []
    all_energy_curves = []
    all_transition_counts = {}
    all_text_counts = []
    all_text_durs = []

    for vg in video_grammars:
        shots = vg.get("shots", [])
        stats = vg.get("global_stats", {})
        shot_cv_list = [s["cv"] for s in shots]

        for s in shot_cv_list:
            all_durations.append(s["duration"])
            all_alignment.append(s["audio_onset_aligned"])

        all_energy_curves.append(stats.get("energy_curve", []))
        all_text_counts.append(stats.get("text_overlay_count", 0))
        all_text_durs.append(stats.get("text_overlay_avg_duration", 0))

        # Merge transition counts
        tc = _count_transition_types(shot_cv_list)
        for k, v in tc.items():
            all_transition_counts[k] = all_transition_counts.get(k, 0) + v

    n = len(all_durations)
    alignment_rate = sum(all_alignment) / n if n > 0 else 0

    # Normalize transition counts
    total_tc = sum(all_transition_counts.values()) or 1
    transition_prefs = {k: round(v / total_tc, 3) for k, v in all_transition_counts.items()}

    # Energy curve shape (use the longest video's curve as representative,
    # or average them)
    longest_curve = max(all_energy_curves, key=len) if all_energy_curves else []
    energy_shape = _classify_energy_shape(longest_curve)

    # Opening and closing patterns
    first_shots = []
    last_shots = []
    for vg in video_grammars:
        shots = vg.get("shots", [])
        if shots:
            first_shots.append(shots[0]["llm"]["energy_label"])
            last_shots.append(shots[-1]["llm"]["energy_label"])
    opens_with = max(set(first_shots), key=first_shots.count) if first_shots else "low"
    closes_with = max(set(last_shots), key=last_shots.count) if last_shots else "peak"

    # Normalize text frequency to per-minute for portability
    total_duration_all = sum(vg.get("duration_sec", 1) for vg in video_grammars)
    avg_text_count = float(np.mean(all_text_counts)) if all_text_counts else 0
    avg_text_dur = float(np.mean(all_text_durs)) if all_text_durs else 0
    avg_duration = float(np.mean([vg.get("duration_sec", 1) for vg in video_grammars])) if video_grammars else 1
    freq_per_min = (avg_text_count / max(avg_duration, 0.1)) * 60 if avg_duration > 0 else 0

    # ── Aggregate reference profile extra data ──
    all_audio_events = []
    all_effect_vocab: set[str] = set()
    all_transition_vocab: set[str] = set()
    all_camera_motion_dist: dict[str, list[float]] = {}
    all_avg_speeds = []
    all_speed_variances = []
    all_energy_curves_full: list[list[float]] = []
    all_bpms = []
    all_pacing_types: list[str] = []
    all_cut_alignments: list[str] = []
    all_avg_transition_durs = []
    all_shot_duration_variances = []
    all_climax_positions = []
    color_signatures = []
    segment_colors_all = []

    for vg in video_grammars:
        rp = vg.get("reference_profile")
        if rp is None:
            continue

        if rp.get("audio_events"):
            all_audio_events.extend(rp["audio_events"])
        if rp.get("effect_vocabulary"):
            all_effect_vocab.update(rp["effect_vocabulary"])
        if rp.get("transition_vocabulary"):
            all_transition_vocab.update(rp["transition_vocabulary"])
        if rp.get("camera_motion_distribution"):
            for k, v in rp["camera_motion_distribution"].items():
                if k not in all_camera_motion_dist:
                    all_camera_motion_dist[k] = []
                all_camera_motion_dist[k].append(v)
        if rp.get("avg_speed") is not None:
            all_avg_speeds.append(rp["avg_speed"])
        if rp.get("speed_variance") is not None:
            all_speed_variances.append(rp["speed_variance"])
        if rp.get("energy_curve_full"):
            all_energy_curves_full.append(rp["energy_curve_full"])
        if rp.get("bpm") is not None:
            all_bpms.append(rp["bpm"])
        if rp.get("pacing_type"):
            all_pacing_types.append(rp["pacing_type"])
        if rp.get("cut_alignment"):
            all_cut_alignments.append(rp["cut_alignment"])
        if rp.get("avg_transition_duration") is not None:
            all_avg_transition_durs.append(rp["avg_transition_duration"])
        if rp.get("shot_duration_variance") is not None:
            all_shot_duration_variances.append(rp["shot_duration_variance"])
        if rp.get("climax_position") is not None:
            all_climax_positions.append(rp["climax_position"])
        if rp.get("color_signature"):
            color_signatures.append(rp["color_signature"])
        if rp.get("segment_colors"):
            segment_colors_all.extend(rp["segment_colors"])

    # Compute aggregated reference data
    ref_data = {}
    if all_audio_events:
        ref_data["audio_events"] = all_audio_events
    if all_effect_vocab:
        ref_data["effect_vocabulary"] = sorted(all_effect_vocab)
    if all_transition_vocab:
        ref_data["transition_vocabulary"] = sorted(all_transition_vocab)
    if all_camera_motion_dist:
        averaged = {k: round(float(np.mean(v)), 3) for k, v in all_camera_motion_dist.items()}
        ref_data["camera_motion_distribution"] = averaged
    if all_avg_speeds:
        ref_data["avg_speed"] = round(float(np.mean(all_avg_speeds)), 3)
    if all_speed_variances:
        ref_data["speed_variance"] = round(float(np.mean(all_speed_variances)), 3)
    if all_energy_curves_full:
        longest_full = max(all_energy_curves_full, key=len)
        ref_data["energy_curve"] = [round(v, 4) for v in longest_full]
    if all_bpms:
        ref_data["bpm"] = round(float(np.mean(all_bpms)), 1)
    if all_pacing_types:
        ref_data["pacing_type"] = max(set(all_pacing_types), key=all_pacing_types.count)
    if all_cut_alignments:
        ref_data["cut_alignment"] = max(set(all_cut_alignments), key=all_cut_alignments.count)
    if all_avg_transition_durs:
        ref_data["avg_transition_duration"] = round(float(np.mean(all_avg_transition_durs)), 3)
    if all_shot_duration_variances:
        ref_data["shot_duration_variance"] = round(float(np.mean(all_shot_duration_variances)), 3)
    if all_climax_positions:
        ref_data["climax_position"] = round(float(np.mean(all_climax_positions)), 3)
    if color_signatures:
        ref_data["color_signature"] = {
            "brightness": round(float(np.mean([c["brightness"] for c in color_signatures])), 3),
            "contrast": round(float(np.mean([c["contrast"] for c in color_signatures])), 3),
            "saturation": round(float(np.mean([c["saturation"] for c in color_signatures])), 3),
            "style": max(set(c["style"] for c in color_signatures), key=lambda s: sum(1 for c in color_signatures if c["style"] == s)),
        }
    if segment_colors_all:
        ref_data["segment_colors"] = segment_colors_all

    return {
        "profile_id": profile_id,
        "creator_handle": creator_handle,
        "videos_analyzed": len(video_grammars),
        "last_updated": time.strftime("%Y-%m-%d"),
        "pacing": {
            "avg_shot_duration": round(float(np.mean(all_durations)), 2) if all_durations else 0,
            "shot_duration_distribution": "right_skewed_short" if np.std(all_durations) > np.mean(all_durations) * 0.8 else "uniform",
            "cut_to_beat_alignment_rate": round(alignment_rate, 3),
            "energy_curve_shape": energy_shape,
            "opens_with": f"{opens_with}_energy_hook" if opens_with else "low_energy_hook",
            "closes_with": f"{closes_with}_hold" if closes_with else "peak_hold",
        },
        "text_overlay": {
            "frequency_per_minute": round(freq_per_min, 1),
            "typical_duration": round(avg_text_dur, 2),
            "typical_role": "context_setup",
        },
        "transition_preferences": transition_prefs,
        "reference": ref_data if ref_data else None,
        "confidence_notes": f"Based on {len(video_grammars)} videos. Sample size still low for reliable stats." if len(video_grammars) < 5 else "",
    }


# ═══════════════════════════════════════════════════════════════
# MAIN: Run full Edit Grammar pipeline on one video
# ═══════════════════════════════════════════════════════════════

def analyze_edit_grammar(
    video_path: str,
    existing_profile=None,
    video_id: str = "",
    source_platform: str = "",
    creator_handle: str = "",
    use_llm: bool = True,
) -> dict:
    """Full Edit Grammar analysis: CV extraction + LLM reasoning + aggregation.

    If existing_profile is provided (e.g. from a previous
    analyze_reference_style run), uses its pre-computed data to avoid
    re-running all detectors.
    """
    import librosa

    # ── 1. Load or compute base analysis ──
    if existing_profile is not None:
        profile = existing_profile
    else:
        from reference_engine import analyze_reference_style
        profile = analyze_reference_style(video_path)

    # ── 2. Extract base data ──
    # Detect edit zone from cut density
    from reference_engine import detect_edit_zone, CutPoint
    all_cuts = [CutPoint(time=t["time"], confidence=0.8, scene_change_score=0.5)
                for t in profile.edit_events.get("transitions", [])]
    trim_start, trim_end = detect_edit_zone(all_cuts, profile.duration)

    shots = [{"start": s.start, "end": s.end, "index": i}
             for i, s in enumerate(profile.segments)]
    transitions = profile.edit_events.get("transitions", [])
    motion_data = []  # We need to get this or recompute
    # Try to get motion data from the profile's build process or compute fresh
    try:
        from analyzers.motion_analyzer import analyze_motion
        motion_data = analyze_motion(video_path, fps=10.0)
    except Exception:
        pass

    beats = profile.beats
    per_shot_text = []  # Build from profile segments
    for i, seg in enumerate(profile.segments):
        tc = seg.text_content or []
        per_shot_text.append({
            "shotIndex": i,
            "hasText": bool(tc),
            "textContent": tc if isinstance(tc, list) else [{"text": str(tc), "bbox": None}],
        })

    # Load audio for loudness computation
    audio_y, sr = None, 22050
    try:
        audio_y, sr = librosa.load(video_path, sr=22050, mono=True)
    except Exception:
        pass

    # ── 3. CV extraction ──
    print(f"  [grammar] Extracting per-shot CV features for {len(shots)} shots "
          f"(edit zone: {trim_start:.1f}s-{trim_end:.1f}s)...")
    shot_cv = extract_per_shot_cv(
        shots=shots,
        transitions=transitions,
        motion_data=motion_data,
        beats=beats,
        per_shot_text=per_shot_text,
        audio_y=audio_y,
        sr=sr,
        trim_start=trim_start,
        trim_end=trim_end,
    )

    # ── 4. LLM reasoning ──
    llm_client = None
    if use_llm:
        try:
            from llm_client import LLMClient
            llm_client = LLMClient()
            print(f"  [grammar] LLM client ready ({llm_client.active_provider})")
        except Exception as e:
            print(f"  [grammar] No LLM client: {e}")

    print(f"  [grammar] Reasoning per shot...")
    shot_llm = reason_per_shot_llm(shot_cv, llm_client=llm_client)

    # ── 5. Set video_id ──
    if not video_id:
        video_id = Path(video_path).stem

    # ── 6. Aggregate ──
    # Use edit zone duration, not full video duration
    edit_duration = trim_end - trim_start

    video_grammar = aggregate_video_grammar(
        shot_cv=shot_cv,
        shot_llm=shot_llm,
        video_id=video_id,
        total_duration=edit_duration,
        beats=beats,
        source_platform=source_platform,
        creator_handle=creator_handle,
        reference_profile=profile,
    )

    # Print summary
    stats = video_grammar["global_stats"]
    print(f"  [grammar] Video grammar: {stats['total_shots']} shots, "
          f"{stats['avg_shot_duration']}s avg, "
          f"{stats['cut_to_beat_alignment_rate']*100:.0f}% beat-aligned, "
          f"{stats['text_overlay_count']} text overlays")

    # Energy label distribution
    labels = [s["llm"]["energy_label"] for s in video_grammar["shots"]]
    label_dist = Counter(labels)
    print(f"  [grammar] Energy: {dict(label_dist)}")

    return video_grammar


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python edit_grammar.py <video.mp4> [-o output.json]")
        sys.exit(1)

    video_path = sys.argv[1]
    output_path = None
    if "-o" in sys.argv:
        idx = sys.argv.index("-o")
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]

    result = analyze_edit_grammar(video_path)

    if output_path:
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nGrammar written to {output_path}")
    else:
        print(json.dumps(result, indent=2, default=str))
