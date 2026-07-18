"""
Edit Director (Key 2) — takes raw footage + style profile → EDL.

Architecture:
1. Segment footage the same way Key 1 did (CV shot-detect + beat-detect)
2. Score candidate cut points against the profile (arithmetic, fast)
3. LLM for ambiguous calls only (sparse — a handful per video)
4. Sequence assembly = constrained optimization (scoring + local swap)
5. Overlay/sponsor placement as a separate pass after cut sequence locked
6. Output: MonetEDL-compatible EDL that the render pipeline executes

Key design: CV measures, LLM interprets, director decides.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Optional

# Prevent OpenMP crash from multiple libiomp5.dylib (torch + librosa clash)
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np


# ═══════════════════════════════════════════════════════════════
# CANDIDATE CUT POINT DETECTION
# ═══════════════════════════════════════════════════════════════

def detect_candidate_cuts(
    footage_path: str,
    min_shot_duration: float = 0.5,
    max_shot_duration: float = 8.0,
) -> tuple[list[dict], float, float, int]:
    """Run CV shot-detection + beat-detection on raw footage.

    Returns:
        candidates: sorted list of {time, score, source}
        duration: footage duration in seconds
        fps: frames per second
        total_frames: total frame count
    """
    import subprocess

    # 1. Get video info
    result = subprocess.run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "json", footage_path,
    ], capture_output=True, text=True, timeout=15)
    info = json.loads(result.stdout)

    duration = float(info["format"]["duration"])
    fps = 30.0
    for s in info.get("streams", []):
        if s.get("width") and s.get("r_frame_rate"):
            parts = s["r_frame_rate"].split("/")
            fps = float(parts[0]) / float(parts[1]) if len(parts) == 2 else 30.0
            break

    width, height = 0, 0
    for s in info.get("streams", []):
        if s.get("width"):
            width, height = int(s["width"]), int(s["height"])
            break

    # 2. Scene-change detection via ffmpeg
    result = subprocess.run([
        "ffmpeg", "-i", footage_path,
        "-vf", "select='gt(scene,0.3)',metadata=print:file=-",
        "-f", "null", "-",
    ], capture_output=True, text=True, timeout=120)

    scene_cuts = []
    for line in (result.stdout + result.stderr).split("\n"):
        if "pts_time:" in line:
            try:
                pts = float(line.split("pts_time:")[1].split()[0])
                scene_cuts.append(pts)
            except (IndexError, ValueError):
                pass
    scene_cuts = sorted(set(scene_cuts))

    # 3. Beat detection
    beats = []
    bpm = 120.0
    try:
        import librosa
        y, sr = librosa.load(footage_path, sr=22050, mono=True)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        if hasattr(tempo, "__len__"):
            bpm = float(tempo[0])
        else:
            bpm = float(tempo)
    except Exception:
        pass

    # 4. Onset detection (denser than beats — for sharper candidate selection)
    onsets = []
    try:
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=False)
        onsets = librosa.frames_to_time(onset_frames, sr=sr).tolist()
    except Exception:
        onsets = list(beats)

    # 5. Merge into candidate cut points
    # Each candidate: a scene change, a beat, or an onset
    candidates = []
    seen = set()
    for t in scene_cuts:
        if min_shot_duration <= t <= duration - min_shot_duration:
            bucket = round(t, 2)
            if bucket not in seen:
                seen.add(bucket)
                candidates.append({"time": t, "score": 0.8, "source": "scene_change"})

    for t in beats:
        if min_shot_duration <= t <= duration - min_shot_duration:
            bucket = round(t, 2)
            if bucket not in seen:
                seen.add(bucket)
                candidates.append({"time": t, "score": 0.7, "source": "beat"})

    for t in onsets:
        if min_shot_duration <= t <= duration - min_shot_duration:
            bucket = round(t, 2)
            if bucket not in seen:
                seen.add(bucket)
                candidates.append({"time": t, "score": 0.5, "source": "onset"})

    candidates.sort(key=lambda c: c["time"])

    # 6. Reject garbage candidates (E27): evaluate frame on BOTH sides of each candidate.
    # Only reject if BOTH the content ending (before) AND the content starting (after)
    # are garbage (black or blurry). This prevents rejecting boundaries INTO garbage
    # while still catching candidates in the middle of garbage zones.
    _has_cv2 = False
    try:
        import cv2
        _has_cv2 = True
    except ImportError:
        pass

    def _extract_frame_quality(seek_time: float) -> Optional[dict]:
        """Extract a 64x64 grayscale frame at seek_time and compute quality metrics."""
        cmd = [
            "ffmpeg", "-ss", str(seek_time), "-i", footage_path,
            "-frames:v", "1", "-vf", "scale=64:64",
            "-f", "rawvideo", "-pix_fmt", "gray", "-",
        ]
        fr = subprocess.run(cmd, capture_output=True, timeout=30)
        if fr.returncode != 0 or len(fr.stdout) < 64 * 64:
            return None
        pixels = list(fr.stdout)
        n = len(pixels)
        if n == 0:
            return None
        avg_brightness = sum(pixels) / (n * 255.0)
        if _has_cv2:
            import numpy as np
            frame_8u = np.frombuffer(bytes(fr.stdout), dtype=np.uint8).reshape(64, 64)
            lap_var = cv2.Laplacian(frame_8u, cv2.CV_64F).var()
            blur_metric = min(1.0, lap_var / 500.0)
            is_blurry = lap_var < 50
            reject_blurry = lap_var < 20
        else:
            diffs = [abs(pixels[i+1] - pixels[i]) for i in range(n - 1)]
            blur_variance = (sum(d * d for d in diffs) / len(diffs)) / (255.0 * 255.0) * 1000
            blur_metric = min(1.0, blur_variance * 5)
            is_blurry = blur_variance < 0.5
            reject_blurry = blur_variance < 0.3
        return {
            "brightness": round(avg_brightness, 3),
            "sharpness": round(blur_metric, 3),
            "is_black": avg_brightness < 0.05,
            "is_blurry": is_blurry,
            "reject_blurry": reject_blurry,
        }

    rejected = 0
    for c in list(candidates):
        t = c["time"]
        if t < 0.05 or t > duration - 0.05:
            continue
        # Sample frame just before (content ending at this cut) and just after
        before = _extract_frame_quality(t - 0.05)
        after = _extract_frame_quality(t + 0.05) if t + 0.05 < duration else before
        if before is None:
            before = _extract_frame_quality(t)
        if after is None:
            after = before

        c["quality"] = {
            "before": {k: before[k] for k in ("brightness", "sharpness", "is_black", "is_blurry")},
            "after": {k: after[k] for k in ("brightness", "sharpness", "is_black", "is_blurry")},
        }

        # Only reject if BOTH sides are garbage
        before_bad = before["is_black"] or before["reject_blurry"]
        after_bad = after["is_black"] or after["reject_blurry"]
        if before_bad and after_bad:
            candidates.remove(c)
            rejected += 1

    if rejected:
        print(f"  [director] Rejected {rejected} garbage candidates (black/blurry)")

    print(f"  [director] Footage: {duration:.1f}s @ {fps:.0f}fps, {width}x{height}")
    print(f"  [director] Scene changes: {len(scene_cuts)}, Beats: {len(beats)}, "
          f"Onsets: {len(onsets)}, Candidates: {len(candidates)}")

    # Return extra info needed downstream
    extra = {
        "duration": duration,
        "fps": fps,
        "width": width,
        "height": height,
        "bpm": bpm,
        "beats": beats,
        "total_frames": int(duration * fps),
    }
    return candidates, duration, fps, extra


# ═══════════════════════════════════════════════════════════════
# SCORING: CANDIDATE CUT POINT FIT AGAINST PROFILE
# ═══════════════════════════════════════════════════════════════

def score_candidate(
    candidate_time: float,
    prev_cut_time: float,
    shot_index: int,
    total_shots_planned: int,
    profile: dict,
    beats: list[float],
    total_duration: float,
    candidate_quality: Optional[dict] = None,
) -> dict:
    """Score a candidate cut point against the style profile.

    If candidate_quality is provided (from detect_candidate_cuts E27),
    includes a quality_score (sharpness + brightness + rejection) as
    a 4th scoring dimension.

    Returns: {total_score, duration_score, beat_score, energy_score, quality_score}
    Higher is better (0-1 range).
    """
    pacing = profile.get("pacing", {})
    pref_shot_dur = pacing.get("avg_shot_duration", 1.5)
    alignment_rate = pacing.get("cut_to_beat_alignment_rate", 0.5)

    duration = candidate_time - prev_cut_time

    # 1. Duration fit: how close to the profile's avg shot duration
    if pref_shot_dur > 0:
        duration_ratio = duration / pref_shot_dur
        if duration_ratio < 0.5:
            duration_score = duration_ratio  # too short — penalize
        elif duration_ratio > 2.0:
            duration_score = max(0, 1.0 - (duration_ratio - 2.0) * 0.5)  # too long
        else:
            duration_score = 1.0 - abs(1.0 - duration_ratio) * 0.5  # peak at 1x
    else:
        duration_score = 0.5

    # 2. Beat alignment: is this near a beat?
    if beats:
        best_beat = min(beats, key=lambda b: abs(b - candidate_time))
        offset = abs(best_beat - candidate_time)
        if offset < 0.05:
            beat_score = 1.0
        elif offset < 0.15:
            beat_score = 0.6
        else:
            beat_score = max(0, 1.0 - offset * 2)
    else:
        beat_score = 0.5

    # Blend beat score with the profile's alignment rate
    # (if profile has high alignment, beat fit matters more)
    beat_weight = 0.3 + alignment_rate * 0.4
    beat_score_weighted = beat_score * beat_weight + 0.5 * (1 - beat_weight)

    # 3. Energy curve fit: where are we in the video?
    progress = candidate_time / total_duration if total_duration > 0 else 0.5

    # Prefer real energy curve from reference if available
    ref = profile.get("reference", {})
    energy_curve_full = ref.get("energy_curve") if ref else None
    energy_curve_shape = pacing.get("energy_curve_shape", "steady_build")

    if energy_curve_full and len(energy_curve_full) >= 10:
        idx = int(progress * (len(energy_curve_full) - 1))
        idx = max(0, min(idx, len(energy_curve_full) - 1))
        expected_energy = energy_curve_full[idx]
    elif energy_curve_shape == "spike_then_release":
        expected_energy = max(0, 1.0 - abs(progress - 0.3) * 2)  # peak at 30%
    elif energy_curve_shape == "steady_build":
        expected_energy = progress  # linear increase
    elif energy_curve_shape == "sawtooth":
        expected_energy = 0.5 + 0.5 * math.sin(progress * math.pi * 4)  # oscillate
    else:
        expected_energy = 0.5

    # Higher score = this candidate supports the expected energy curve
    # (longer shots = lower energy, shorter shots = higher energy)
    if expected_energy > 0.6:
        # High energy zone: prefer shorter shots
        energy_score = max(0, 1.0 - duration / pref_shot_dur)
    elif expected_energy < 0.3:
        # Low energy zone: prefer longer shots
        energy_score = min(1.0, duration / pref_shot_dur)
    else:
        energy_score = 0.5

    # 4. Content quality (E27 Move 2): sharpness + brightness as 4th dimension
    quality_score = 0.7  # default mid-high (most candidates are fine)
    if candidate_quality:
        # Use the "before" frame quality (content ending at this cut represents
        # the quality of the shot that would end here)
        sq = candidate_quality.get("before", candidate_quality)
        sharp = sq.get("sharpness", 0.5)
        bright = sq.get("brightness", 0.5)
        # Reject-model: prefer sharp, decently exposed frames
        # quality = 0.70 * sharpness + 0.30 * brightness
        quality_score = round(sharp * 0.70 + bright * 0.30, 3)

    # Weights adjusted to accommodate quality dimension
    total_score = (
        duration_score * 0.35 +
        beat_score_weighted * 0.30 +
        energy_score * 0.20 +
        quality_score * 0.15
    )

    return {
        "total_score": round(total_score, 3),
        "duration_score": round(duration_score, 3),
        "beat_score": round(beat_score, 3),
        "energy_score": round(energy_score, 3),
        "quality_score": round(quality_score, 3),
        "shot_duration": round(duration, 3),
        "expected_energy": round(expected_energy, 3),
    }


# ═══════════════════════════════════════════════════════════════
# LLM AMBIGUITY RESOLUTION
# ═══════════════════════════════════════════════════════════════

_AMBIGUITY_PROMPT = """You are resolving an ambiguous cut decision for a video edit.

Two candidate cut points score similarly (within 0.1 of each other).
Profile context: {profile_summary}
Edit progress: {progress:.0f}% complete ({shot_index}/{total_shots} shots placed)

Candidate A: {candidate_a}
Candidate B: {candidate_b}

Output ONLY valid JSON:
{{
  "choice": "A" | "B",
  "reason": "brief justification",
  "confidence": 0.0 to 1.0
}}
"""


def resolve_ambiguity(
    candidate_a: dict,
    candidate_b: dict,
    shot_index: int,
    total_shots: int,
    profile: dict,
    total_duration: float,
    llm_client=None,
) -> dict:
    """When two candidates score similarly, use LLM to break the tie.

    Falls back to heuristic if LLM unavailable.
    """
    progress = candidate_a["shot_duration"] / total_duration if total_duration > 0 else 0.5

    # Heuristic tiebreaker
    if llm_client is None:
        # Prefer the one with higher beat alignment
        if candidate_a["beat_score"] > candidate_b["beat_score"] + 0.1:
            return {"choice": "A", "reason": "better beat alignment", "confidence": 0.6}
        elif candidate_b["beat_score"] > candidate_a["beat_score"] + 0.1:
            return {"choice": "B", "reason": "better beat alignment", "confidence": 0.6}
        # Prefer the one closer to profile avg shot duration
        if candidate_a["duration_score"] > candidate_b["duration_score"]:
            return {"choice": "A", "reason": "better duration fit", "confidence": 0.5}
        return {"choice": "B", "reason": "better duration fit", "confidence": 0.5}

    # LLM tiebreaker
    ref = profile.get("reference", {})
    profile_summary = json.dumps({
        "pacing": profile.get("pacing", {}),
        "text_overlay": profile.get("text_overlay", {}),
        "transition_preferences": profile.get("transition_preferences", {}),
        "reference": {
            k: ref.get(k) for k in ("audio_events", "camera_motion_distribution",
                                     "effect_vocabulary", "color_signature",
                                     "pacing_type", "avg_speed", "cut_alignment")
            if ref.get(k) is not None
        },
    }, indent=2)

    prompt = _AMBIGUITY_PROMPT.format(
        profile_summary=profile_summary,
        progress=progress,
        shot_index=shot_index,
        total_shots=total_shots,
        candidate_a=json.dumps(candidate_a, indent=2),
        candidate_b=json.dumps(candidate_b, indent=2),
    )

    try:
        if hasattr(llm_client, "generate"):
            text = llm_client.generate(prompt, temperature=0.2, max_tokens=256)
        else:
            text = llm_client(prompt)

        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
        parsed = json.loads(text)
        return {
            "choice": parsed.get("choice", "A"),
            "reason": parsed.get("reason", ""),
            "confidence": float(parsed.get("confidence", 0.5)),
        }
    except Exception as e:
        return {"choice": "A", "reason": f"LLM error: {e}", "confidence": 0.4}


# ═══════════════════════════════════════════════════════════════
# SEQUENCE ASSEMBLY (constrained optimization)
# ═══════════════════════════════════════════════════════════════

def estimate_shot_count(target_duration: float, profile: dict) -> int:
    """Estimate number of shots needed based on profile pacing."""
    avg_dur = profile.get("pacing", {}).get("avg_shot_duration", 1.5)
    if avg_dur > 0:
        return max(3, round(target_duration / avg_dur))
    return 10


def assemble_sequence(
    candidates: list[dict],
    target_duration: float,
    profile: dict,
    beats: list[float],
    total_footage_duration: float,
    llm_client=None,
    min_shot: float = 0.5,
    max_shot: float = 8.0,
    start_index: int = 0,
) -> list[dict]:
    """Build shot sequence by scoring candidates against the profile.

    Greedy with local lookahead: picks the best-scoring next cut from
    the next N candidates, then re-scores remaining against global constraints.

    Returns list of shot dicts: {start, end, duration, cut_type, score_breakdown}
    """
    total_shots = estimate_shot_count(target_duration, profile)
    pacing = profile.get("pacing", {})
    alignment_rate = pacing.get("cut_to_beat_alignment_rate", 0.5)

    # Reference profile data for grounded decisions
    ref = profile.get("reference", {})
    ref_energy_curve = ref.get("energy_curve") if ref else None
    ref_speed_mean = ref.get("avg_speed") if ref else None
    ref_speed_var = ref.get("speed_variance") if ref else None
    ref_camera_motion = ref.get("camera_motion_distribution") if ref else None
    ref_transition_vocab = ref.get("transition_vocabulary") if ref else None

    # Filter candidates within range
    usable = [c for c in candidates
              if min_shot <= c["time"] <= target_duration - min_shot]

    if not usable:
        # Fallback: evenly spaced cuts
        print("  [director] No candidates found, using uniform spacing")
        step = target_duration / total_shots
        shots = []
        for i in range(total_shots):
            shots.append({
                "start": i * step,
                "end": (i + 1) * step,
                "duration": step,
                "cut_type": "hard_cut",
                "score": {"total_score": 0.5, "shot_duration": step},
                "shot_index": start_index + i,
            })
        return shots

    shots = []
    prev_time = 0.0
    lookahead = max(3, total_shots // 4)  # look ahead N candidates
    prev_quality = None  # track this candidate's "after" quality for shot content check

    for shot_idx in range(total_shots):
        # Find candidates within reasonable range from prev_time
        remaining_time = target_duration - prev_time
        remaining_shots = total_shots - shot_idx
        ideal_duration = remaining_time / remaining_shots if remaining_shots > 0 else max_shot

        # Window: accept candidates from min_shot to max_shot away
        window_start = prev_time + min_shot
        window_end = min(target_duration, prev_time + max_shot)

        in_window = [c for c in usable
                     if window_start <= c["time"] <= window_end
                     and c["time"] > prev_time]

        if not in_window:
            # No candidate in window — create one at ideal position
            cut_time = min(window_end, prev_time + ideal_duration)
            cut_time = round(cut_time, 2)
            if cut_time >= target_duration - 0.1:
                cut_time = target_duration
            score_info = score_candidate(
                cut_time, prev_time, shot_idx, total_shots,
                profile, beats, total_footage_duration,
            )
            prev_quality = None  # no boundary quality data for fallback cuts
        else:
            # Score first N candidates in window
            candidates_to_score = in_window[:lookahead]
            scored = []
            for c in candidates_to_score:
                s = score_candidate(
                    c["time"], prev_time, shot_idx, total_shots,
                    profile, beats, total_footage_duration,
                    candidate_quality=c.get("quality"),
                )
                scored.append({**c, "score": s})

            # Sort by total score
            scored.sort(key=lambda s: s["score"]["total_score"], reverse=True)

            # Check if top two are close — need ambiguity resolution
            if len(scored) >= 2:
                top = scored[0]
                second = scored[1]
                delta = top["score"]["total_score"] - second["score"]["total_score"]
                if delta < 0.1:
                    resolution = resolve_ambiguity(
                        top["score"], second["score"],
                        shot_idx, total_shots, profile,
                        total_footage_duration,
                        llm_client=llm_client,
                    )
                    if resolution["choice"] == "B":
                        top = second
                        print(f"  [director] Ambiguity @ {top['time']:.1f}s → LLM chose B: {resolution['reason']}")
            elif len(scored) == 1:
                top = scored[0]
            else:
                # All candidates rejected — fallback to ideal position
                cut_time = min(window_end, prev_time + ideal_duration)
                cut_time = round(cut_time, 2)
                if cut_time >= target_duration - 0.1:
                    cut_time = target_duration
                score_info = score_candidate(
                    cut_time, prev_time, shot_idx, total_shots,
                    profile, beats, total_footage_duration,
                )
                continue

            cut_time = top["time"]
            score_info = top["score"]

            # Skip shot if BOTH its boundaries are garbage — the content between
            # two garbage boundaries is itself garbage.
            if prev_quality is not None and "quality" in top:
                prev_after = prev_quality.get("after", {})
                curr_before = top["quality"].get("before", {})
                start_garbage = prev_after.get("is_black", False) or prev_after.get("is_blurry", False)
                end_garbage = curr_before.get("is_black", False) or curr_before.get("is_blurry", False)
                if start_garbage and end_garbage:
                    print(f"  [director] Skipping garbage shot {prev_time:.2f}-{cut_time:.2f}s")
                    prev_time = cut_time
                    prev_quality = top.get("quality")
                    continue

        duration = cut_time - prev_time

        # Sample cut type: energy-driven if we have reference data,
        # otherwise use profile's transition preference distribution
        energy = score_info["expected_energy"] if score_info else 0.5
        prefs = profile.get("transition_preferences", {"hard_cut": 0.7})

        # Energy-driven transition selection: high energy = hard cuts,
        # low energy = dissolves/smoother transitions
        if ref_transition_vocab and energy is not None:
            if energy > 0.6:
                cut_type = "hard_cut"
            elif energy < 0.3:
                fade_types = [t for t in ref_transition_vocab
                              if t in ("crossfade", "fade_black", "fade_white", "blur")]
                cut_type = fade_types[0] if fade_types else "crossfade"
            else:
                # Mid-energy: sample from profile preferences
                rand = np.random.random()
                cumulative = 0.0
                mp = {"hard_cut": 0.4, "crossfade": 0.3, "whip_pan": 0.15,
                      "zoom_transition": 0.1, "fade_to_black": 0.05}
                for ct_name in ("hard_cut", "crossfade", "whip_pan", "zoom_transition", "fade_to_black"):
                    prob = prefs.get(ct_name, mp.get(ct_name, 0))
                    cumulative += prob
                    if rand < cumulative:
                        cut_type = ct_name
                        break
        else:
            # Fallback: stateless sampling from profile distribution
            rand = np.random.random()
            cumulative = 0.0
            cut_choices = [
                ("hard_cut", prefs.get("hard_cut", 0.7)),
                ("crossfade", prefs.get("crossfade", 0)),
                ("whip_pan", prefs.get("whip_pan", 0)),
                ("fade_to_black", prefs.get("fade_to_black", 0)),
                ("zoom_transition", prefs.get("zoom_transition", 0)),
            ]
            cut_type = "hard_cut"
            for ct_name, prob in cut_choices:
                cumulative += prob
                if rand < cumulative:
                    cut_type = ct_name
                    break

        # Speed ramp driven by expected energy, grounded in reference speed stats
        speed = 1.0
        # Use z-score if reference speed data available
        if ref_speed_mean is not None and ref_speed_var is not None and ref_speed_var > 0:
            # How far from reference mean in z-score terms
            target_speed = ref_speed_mean
            if energy > 0.6:
                target_speed = ref_speed_mean + ref_speed_var * 2
            elif energy < 0.3:
                target_speed = max(0.5, ref_speed_mean - ref_speed_var * 1.5)
            speed = round(max(0.3, min(3.0, target_speed)), 2)
        else:
            # Fallback: wider energy bands (0.55/0.35 instead of 0.65/0.3)
            if energy > 0.55:
                speed = round(np.random.uniform(1.3, 2.0), 2)
            elif energy < 0.35:
                speed = round(np.random.uniform(0.6, 0.85), 2)

        # Camera shake: use reference camera motion distribution if available
        shake = 0.0
        handheld_prob = (ref_camera_motion or {}).get("handheld", 0) if ref_camera_motion else 0.3
        if 0.2 < energy < 0.6 and np.random.random() < handheld_prob:
            shake = round(np.random.uniform(2, 6), 1)

        # Convention: cut_type = transition INTO this shot.
        # Shot 0 has nothing preceding it.
        if len(shots) == 0:
            cut_type = "hard_cut"

        shots.append({
            "start": round(prev_time, 3),
            "end": round(cut_time, 3),
            "duration": round(duration, 3),
            "cut_type": cut_type,
            "speed": speed,
            "shake": shake,
            "score": score_info,
            "shot_index": start_index + shot_idx,
        })

        prev_time = cut_time
        if "quality" in top:
            prev_quality = top["quality"]

        # Check if we've reached the end
        if cut_time >= target_duration - 0.05:
            break

    # Ensure last shot ends at target
    if shots and shots[-1]["end"] < target_duration - 0.05:
        shots[-1]["end"] = target_duration
        shots[-1]["duration"] = round(shots[-1]["end"] - shots[-1]["start"], 3)

    # Beat-snapping post-pass: snap cuts within 0.08s of a beat to exact beat time
    if beats:
        snapped = 0
        for s in shots[1:]:  # skip first shot start
            cut = s["start"]
            best = min(beats, key=lambda b: abs(b - cut))
            offset = abs(best - cut)
            if offset < 0.08 and best > shots[0]["start"]:
                old_start = s["start"]
                s["start"] = round(best, 3)
                s["duration"] = round(s["end"] - s["start"], 3)
                snapped += 1
        if snapped:
            print(f"  [director] Beat-snapped {snapped} cut positions")

    print(f"  [director] Assembled {len(shots)} shots over {target_duration:.1f}s")
    return shots


# ═══════════════════════════════════════════════════════════════
# OVERLAY PLACEMENT (separate pass after cut sequence locked)
# ═══════════════════════════════════════════════════════════════

def place_overlays(
    shots: list[dict],
    profile: dict,
    total_duration: float,
    source_shots: Optional[list[dict]] = None,
) -> list[dict]:
    """Place overlays after the cut sequence is locked.

    Uses profile's text_overlay frequency and typical_role to decide
    where overlays land.

    If source_shots is provided (list of {start, end, text_content, ...} from
    the reference footage shot segmentation), overlays are populated with
    actual detected text from the footage analysis using time-based overlap.
    """
    text_config = profile.get("text_overlay", {})
    freq_per_min = text_config.get("frequency_per_minute", 8.0)
    typical_dur = text_config.get("typical_duration", 1.6)
    typical_role = text_config.get("typical_role", "context_setup")

    overlays = []
    if freq_per_min <= 0:
        return overlays

    # Calculate number of overlays based on target duration
    num_overlays = max(1, round(freq_per_min * total_duration / 60))

    # Decide where overlays go based on typical_role
    if typical_role == "context_setup":
        # Place at the beginning (first 30% of video)
        placement_zone = (0, total_duration * 0.3)
    elif typical_role == "punchline":
        # Place at the end
        placement_zone = (total_duration * 0.7, total_duration)
    else:
        # Scattered
        placement_zone = (0, total_duration)

    # Find good overlay spots: prefer shots with lower motion energy,
    # and at natural break points
    overlay_shots = []
    for s in shots:
        score = s.get("score", {})
        energy = score.get("expected_energy", 0.5)
        # Prefer lower energy for text overlays
        if energy < 0.6 and placement_zone[0] <= s["start"] <= placement_zone[1]:
            overlay_shots.append(s)

    if not overlay_shots:
        overlay_shots = shots

    def _find_text_for_time(t: float) -> str:
        """Find the highest-confidence text from source_shots overlapping time t."""
        if not source_shots:
            return ""
        candidates = []
        for ss in source_shots:
            ss_start = ss.get("start", 0)
            ss_end = ss.get("end", ss_start)
            if ss_start <= t <= ss_end:
                tc = ss.get("text_content", [])
                if isinstance(tc, list):
                    candidates.extend(tc)
        if not candidates:
            # Fallback: return any text from source_shots
            for ss in source_shots:
                tc = ss.get("text_content", [])
                if isinstance(tc, list):
                    candidates.extend(tc)
        if candidates:
            candidates.sort(key=lambda c: c.get("confidence", 0), reverse=True)
            return candidates[0].get("text", "")
        return ""

    # Place overlays
    num_overlays = min(num_overlays, len(overlay_shots))
    step = max(1, len(overlay_shots) // max(num_overlays, 1)) if overlay_shots else 1

    for i in range(0, max(1, min(num_overlays * step, len(overlay_shots))), step):
        shot = overlay_shots[i]
        duration = min(typical_dur, shot["duration"] * 0.8)
        ts = round(shot["start"] + shot["duration"] * 0.1, 3)
        content = _find_text_for_time(shot["start"] + shot["duration"] * 0.5)
        overlays.append({
            "type": "text",
            "content": content,
            "start_ts": ts,
            "end_ts": round(ts + duration, 3),
            "duration": round(duration, 3),
            "position": "bottom_center",
            "animation": "fade_in",
            "role": typical_role,
        })

    return overlays


# ═══════════════════════════════════════════════════════════════
# EDL OUTPUT (MonetEDL-compatible format)
# ═══════════════════════════════════════════════════════════════

def _remap_captions_to_output(
    captions: list[dict],
    shots: list[dict],
    xfade_durs: Optional[list[float]] = None,
) -> list[dict]:
    """Remap caption timestamps from footage timebase → output timebase.

    Dead-air compression in assemble_dialogue_sequence() skips gaps in
    the footage, so every timestamp after the first removed gap shifts.
    This function walks each caption, finds which shot it belongs to,
    and recomputes its output timeline position.

    Also accounts for xfade transition overlaps between shots
    (0.04s per hard cut, 0.4s per crossfade, etc.) so captions don't
    drift even in a long sequence with staggered transitions.

    Without this, captions after any removed silence drift progressively
    out of sync — the E7-timebase bug at a new location.
    """
    if xfade_durs is None:
        xfade_durs = [0.04] * (len(shots) - 1)

    remapped = []
    for cap in captions:
        footage_start = cap["start"]
        footage_end = cap["end"]
        output_start = None
        output_end = None

        cumulative_output = 0.0
        overlap_acc = 0.0
        for i, shot in enumerate(shots):
            shot_start = shot["start"]
            shot_end = shot["end"]
            shot_dur = shot["duration"]

            # Account for xfade overlap introduced by transitions BEFORE this shot
            shot_output_start = cumulative_output - overlap_acc

            # Does this caption overlap this shot?
            if shot_start <= footage_start <= shot_end:
                output_start = shot_output_start + (footage_start - shot_start)
                rel_end = min(footage_end, shot_end) - shot_start
                output_end = shot_output_start + rel_end
            elif shot_start <= footage_end <= shot_end:
                rel_end = footage_end - shot_start
                output_end = shot_output_start + rel_end
            elif footage_start <= shot_start and footage_end >= shot_end:
                if output_start is None:
                    output_start = shot_output_start
                output_end = shot_output_start + shot_dur

            cumulative_output += shot_dur
            if i < len(xfade_durs):
                overlap_acc += xfade_durs[i]

        if output_start is not None:
            remapped.append({
                **cap,
                "start": round(output_start, 3),
                "end": round(output_end or output_start + cap.get("duration", 1.0), 3),
                "duration": round(
                    (output_end or output_start + cap.get("duration", 1.0)) - output_start, 3
                ),
            })

    return remapped


def build_edl(
    shots: list[dict],
    overlays: list[dict],
    footage_path: str,
    target_duration: float,
    profile: dict,
    footage_extra: dict,
    edl_id: Optional[str] = None,
    captions: Optional[list[dict]] = None,
) -> dict:
    """Convert the shot sequence + overlays into a MonetEDL-compatible EDL.

    Follows packages/edl/src/schemas.ts ProjectEDL interface.
    """
    if edl_id is None:
        edl_id = f"edl_{uuid.uuid4().hex[:12]}"

    fps = footage_extra.get("fps", 30.0)
    width = footage_extra.get("width", 1920)
    height = footage_extra.get("height", 1080)
    bpm = footage_extra.get("bpm", 120.0)
    beats = footage_extra.get("beats", [])

    # Aspect ratio
    aspect = "16:9" if width / height > 1.3 else "9:16" if height / width > 1.3 else "1:1"

    # Media asset
    media_id = "footage_001"
    assets = {
        "media": {
            media_id: {
                "id": media_id,
                "path": str(Path(footage_path).resolve()),
                "duration": footage_extra.get("duration", target_duration),
                "width": width,
                "height": height,
            },
        },
        "audio": {},
        "overlays": {},
    }

    # Build video track clips
    video_clips = []
    for i, shot in enumerate(shots):
        clip_id = f"clip_{i:04d}"
        video_clips.append({
            "id": clip_id,
            "mediaId": media_id,
            "startTime": shot["start"],
            "duration": shot["duration"],
            "inPoint": shot["start"],
            "outPoint": shot["end"],
            "speed": shot.get("speed", 1.0),
            "shake": shot.get("shake", 0.0),
            "transforms": {
                "position": [{"time": 0, "x": 0, "y": 0, "easing": "linear"}],
                "scale": [{"time": 0, "value": 1, "easing": "linear"}],
                "rotation": [{"time": 0, "value": 0, "easing": "linear"}],
            },
            "audio": {"gain": 1.0},
            "effects": [],
            "meta": {
                "cut_type": shot.get("cut_type", "hard_cut"),
                **({"punch_ins": shot["punch_ins"]} if shot.get("punch_ins") else {}),
            },
        })

    # Build timeline
    timeline = {
        "duration": target_duration,
        "tracks": [
            {
                "id": "video_main",
                "type": "video",
                "clips": video_clips,
                "order": 0,
                "locked": False,
                "hidden": False,
            },
            {
                "id": "audio_main",
                "type": "audio",
                "clips": [{
                    "id": "audio_main_clip",
                    "mediaId": media_id,
                    "startTime": 0,
                    "duration": target_duration,
                    "inPoint": 0,
                    "outPoint": target_duration,
                    "speed": 1,
                    "transforms": {
                        "position": [{"time": 0, "x": 0, "y": 0}],
                        "scale": [{"time": 0, "value": 1}],
                        "rotation": [{"time": 0, "value": 0}],
                    },
                    "audio": {"gain": 1.0},
                    "effects": [],
                }],
                "order": 0,
                "locked": False,
                "hidden": False,
            },
        ],
        "markers": [
            {"id": f"beat_{i:04d}", "time": b, "type": "beat"}
            for i, b in enumerate(beats) if b <= target_duration
        ],
    }

    # Add text overlays as a text track
    if overlays:
        text_clips = []
        for i, ov in enumerate(overlays):
            text_clips.append({
                "id": f"text_{i:04d}",
                "mediaId": media_id,
                "startTime": ov["start_ts"],
                "duration": ov["duration"],
                "inPoint": ov["start_ts"],
                "outPoint": ov["end_ts"],
                "speed": 1,
                "transforms": {
                    "position": [{"time": 0, "x": 0, "y": 0}],
                    "scale": [{"time": 0, "value": 1}],
                    "rotation": [{"time": 0, "value": 0}],
                },
                "audio": {"gain": 1.0},
                "effects": [],
                "meta": {
                    "text_content": ov["content"],
                    "position": ov["position"],
                    "animation": ov["animation"],
                    "role": ov["role"],
                },
            })
        timeline["tracks"].append({
            "id": "text_overlays",
            "type": "text",
            "clips": text_clips,
            "order": 1,
            "locked": False,
            "hidden": False,
        })

    # Add auto-caption track (Component 5)
    if captions:
        caption_clips = []
        for i, cap in enumerate(captions):
            caption_clips.append({
                "id": f"caption_{i:04d}",
                "mediaId": "captions",
                "startTime": cap["start"],
                "duration": cap["duration"],
                "inPoint": cap["start"],
                "outPoint": cap["end"],
                "speed": 1,
                "transforms": {
                    "position": [{"time": 0, "x": 0, "y": 0}],
                    "scale": [{"time": 0, "value": 1}],
                    "rotation": [{"time": 0, "value": 0}],
                },
                "audio": {"gain": 1.0},
                "effects": [],
                "meta": {
                    "text_content": cap["text"],
                    "style": cap["meta"]["style"],
                    "role": "caption",
                },
            })
        timeline["tracks"].append({
            "id": "captions",
            "type": "text",
            "clips": caption_clips,
            "order": 2,
            "locked": False,
            "hidden": False,
        })

    profile_id = profile.get("profile_id", "unknown")

    edl = {
        "version": 1,
        "id": edl_id,
        "meta": {
            "createdAt": int(time.time()),
            "updatedAt": int(time.time()),
            "aspectRatio": aspect,
            "fps": fps,
            "sampleRate": 44100,
            "analysisId": profile_id,
        },
        "timeline": timeline,
        "assets": assets,
    }

    return edl


# ═══════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

def direct_edit(
    footage_path: str,
    profile: dict,
    target_duration: Optional[float] = None,
    edl_id: Optional[str] = None,
    use_llm: bool = True,
    min_shot: float = 0.5,
    max_shot: float = 8.0,
    source_shots: Optional[list[dict]] = None,
    music_path: Optional[str] = None,
    mode: Optional[str] = None,
) -> dict:
    """Full Key 2 pipeline: footage → candidates → scoring → sequence → EDL.

    Args:
        footage_path: Path to raw footage
        profile: Style profile dict (from edit_grammar.build_style_profile)
        target_duration: Desired output duration (None = use profile's avg video duration)
        use_llm: Enable LLM for ambiguity resolution
        min_shot, max_shot: Shot duration constraints
        source_shots: Optional list of {start, end, text_content} from the
                      reference footage shot segmentation. When provided,
                      overlay content is populated with actual detected text
                      from shots whose time ranges overlap.
        music_path: Path to background music file. When provided, beat
                    detection runs on the music track instead of footage
                    audio for scoring and snapping.
        mode: "dialogue" | "montage" | None (auto-detect via director_router)

    Returns:
        MonetEDL-compatible dict (see packages/edl/src/schemas.ts)
    """
    print(f"\n=== EDIT DIRECTOR (Key 2) ===")
    print(f"Footage: {footage_path}")
    print(f"Profile: {profile.get('profile_id', 'unknown')}")

    if target_duration is None:
        # Estimate from profile: avg_shot * estimated_shots
        avg_dur = profile.get("pacing", {}).get("avg_shot_duration", 1.5)
        target_duration = avg_dur * 20  # default to ~20 shots

    print(f"Target: {target_duration:.1f}s")

    # 1. LLM client (optional)
    llm_client = None
    if use_llm:
        workers_path = os.path.join(
            os.path.dirname(__file__), "..", "..",
            "workers", "python-director", "src",
        )
        sys.path.insert(0, workers_path)
        try:
            from llm_client import LLMClient
            llm_client = LLMClient()
            print(f"  [director] LLM: {llm_client.active_provider}")
        except Exception as e:
            print(f"  [director] No LLM: {e}")

    # 2. Segment footage
    candidates, duration, fps, extra = detect_candidate_cuts(footage_path, min_shot, max_shot)
    total_footage_duration = duration

    # Clamp target to footage duration
    target_duration = min(target_duration, total_footage_duration)

    # 2b. Detect beats on music track if provided (E7: sync to music, not footage audio)
    beat_grid = extra.get("beats", [])
    if music_path and os.path.exists(music_path):
        try:
            import librosa
            music_y, music_sr = librosa.load(music_path, sr=22050, mono=True)
            music_tempo, music_frames = librosa.beat.beat_track(y=music_y, sr=music_sr)
            music_beats = librosa.frames_to_time(music_frames, sr=music_sr).tolist()
            if len(music_beats) > 3:
                beat_grid = music_beats
                print(f"  [director] Using music beat grid: {len(beat_grid)} beats @ {float(music_tempo):.0f} BPM")
            else:
                print(f"  [director] Music beat detection sparse ({len(music_beats)} beats), using footage beats")
        except Exception as e:
            print(f"  [director] Music beat detection failed: {e}, using footage beats")

    # 2c. Speech analysis + mode routing (Kove speech-driven director)
    speech_data = None
    captions = None
    if mode is None:
        # Cheap pre-filter: short footage with fast pacing → montage, skip speech cost
        profile_pacing = profile.get("pacing", {})
        avg_shot = profile_pacing.get("avg_shot_duration", 4.0)
        if total_footage_duration < 60.0 or avg_shot < 3.0:
            mode = "montage"
            print(f"  [director] Pre-filter → montage ({total_footage_duration:.0f}s, "
                  f"{avg_shot:.1f}s avg shot)")
        else:
            # Might be dialogue — run speech pipeline for real classification
            from speech_pipeline import analyze_speech
            speech_data = analyze_speech(footage_path)
            from director_router import classify_content
            mode = classify_content(
                footage_path=footage_path,
                speech_data=speech_data,
                footage_duration=total_footage_duration,
                profile=profile,
            )
            print(f"  [director] Router → {mode} "
                  f"(coverage={speech_data.get('speech_coverage', 0):.2f}, "
                  f"{len(speech_data.get('words', []))} words)")
            if mode == "dialogue" and not speech_data.get("words"):
                print(f"  [director] Speech: no words detected, falling back to montage")
                mode = "montage"
    else:
        if mode == "dialogue":
            from speech_pipeline import analyze_speech
            speech_data = analyze_speech(footage_path)
            if not speech_data.get("words"):
                print(f"  [director] Speech: no words detected, falling back to montage")
                mode = "montage"
            else:
                print(f"  [director] Speech: {len(speech_data['words'])} words, "
                      f"{len(speech_data['sentences'])} sentences, "
                      f"coverage={speech_data['speech_coverage']:.2f}")

    print(f"  [director] Mode: {mode}")

    # 3. Assemble sequence (mode-specific)
    if mode == "dialogue":
        from dialogue_grammar import assemble_dialogue_sequence, generate_captions

        # Inject sentence boundaries as candidates so cuts can land on them
        sentence_boundaries = [
            s["end"] for s in speech_data.get("sentences", [])
            if s["end"] < total_footage_duration - 0.5
        ]
        existing_times = {round(c["time"], 2) for c in candidates}
        for sb in sentence_boundaries:
            if round(sb, 2) not in existing_times:
                candidates.append({"time": sb, "score": 1.0, "source": "sentence_boundary"})
                existing_times.add(round(sb, 2))
        candidates.sort(key=lambda c: c["time"])
        print(f"  [director] Injected {len(sentence_boundaries)} sentence boundaries as candidates ({len(candidates)} total)")

        # Collapse Whisper sentence segments that fall within the same
        # speech region (Whisper sometimes splits a sentence mid-thought).
        original_count = len(speech_data.get("sentences", []))
        merged_sentences = []
        for region in speech_data.get("speech_regions", []):
            region_sentences = [
                s for s in speech_data.get("sentences", [])
                if s["start"] >= region["start"] - 0.05
                and s["end"] <= region["end"] + 0.05
            ]
            if region_sentences:
                merged_sentences.append({
                    "text": " ".join(s["text"] for s in region_sentences),
                    "start": region_sentences[0]["start"],
                    "end": region_sentences[-1]["end"],
                })
        if merged_sentences:
            speech_data["sentences"] = merged_sentences
            print(f"  [director] Collapsed to {len(merged_sentences)} sentence segments (from {original_count} Whisper segments)")

        # Dialogue shots align to speech segments, not beat grid
        n_sentences = max(len(speech_data.get("sentences", [])), 1)
        dialogue_shots = min(
            n_sentences,
            int(target_duration / max(min_shot, 1.0))
        )
        dialogue_shots = max(2, dialogue_shots)
        shots = assemble_dialogue_sequence(
            candidates=candidates,
            target_duration=target_duration,
            total_shots=dialogue_shots,
            speech_data=speech_data,
            profile=profile,
            footage_duration=total_footage_duration,
            min_shot=min_shot,
            max_shot=max_shot,
        )
        captions = generate_captions(speech_data)
        # V1: remap caption timestamps from footage→output timebase
        captions = _remap_captions_to_output(captions, shots)
        print(f"  [director] Dialogue: {len(shots)} shots, {len(captions)} captions")
    else:
        shots = assemble_sequence(
            candidates=candidates,
            target_duration=target_duration,
            profile=profile,
            beats=beat_grid,
            total_footage_duration=total_footage_duration,
            llm_client=llm_client,
            min_shot=min_shot,
            max_shot=max_shot,
        )

    # 4. Place overlays
    overlays = place_overlays(shots, profile, target_duration, source_shots=source_shots)

    # 5. Build EDL (with caption track in dialogue mode)
    edl = build_edl(
        shots=shots,
        overlays=overlays,
        footage_path=footage_path,
        target_duration=target_duration,
        profile=profile,
        footage_extra=extra,
        edl_id=edl_id,
        captions=captions,
    )

    # Summary
    total_actual = sum(s["duration"] for s in shots)
    print(f"\n=== EDL: {edl['id']} ===")
    print(f"Shots: {len(shots)}, Total: {total_actual:.1f}s, Overlays: {len(overlays)}")
    print(f"Avg shot: {total_actual / max(len(shots), 1):.2f}s")

    if overlays:
        positions = [f"{o['start_ts']:.1f}s" for o in overlays]
        print(f"Overlay positions: {positions}")

    return edl


# ═══════════════════════════════════════════════════════════════
# RENDER: EDL → actual video file via FFmpeg with transitions
# ═══════════════════════════════════════════════════════════════

TRANSITION_DUR = 0.3  # seconds


def _gen_text_png(text: str, output_path: str, width: int = 1280, height: int = 80):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = None
    for fp in [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]:
        if os.path.exists(fp):
            font = ImageFont.truetype(fp, 36)
            break
    _, _, tw, th = draw.textbbox((0, 0), text, font=font) if font else (0, 0, len(text) * 18, 36)
    x = (width - tw) // 2
    y = height - th - 10
    draw.rectangle([x - 8, y - 4, x + tw + 8, y + th + 4], fill=(0, 0, 0, 180))
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    img.save(output_path)


def _xfade_type_for(cut_type: str, idx: int) -> str:
    m = {
        "crossfade": "fade",
        "zoom_transition": "zoomin",
        "whip_pan": ["slideleft", "slideright", "slidetop", "slidebottom"][idx % 4],
        "fade_to_black": "fadeblack",
    }
    return m.get(cut_type, "fade")


def _glitch_params_for(cut_type: str) -> dict:
    """Glitch intensity parameters per transition type.
    Returns {flash_dur, noise_level, noise_dur, rgb_shift, rgb_dur}"""
    if cut_type == "crossfade":
        return {"flash_dur": 0.04, "noise_level": 60, "noise_dur": 0.04, "rgb_shift": 12, "rgb_dur": 0.06}
    elif cut_type == "zoom_transition":
        return {"flash_dur": 0.06, "noise_level": 90, "noise_dur": 0.08, "rgb_shift": 20, "rgb_dur": 0.10}
    elif cut_type == "whip_pan":
        return {"flash_dur": 0.02, "noise_level": 40, "noise_dur": 0.03, "rgb_shift": 8, "rgb_dur": 0.04}
    elif cut_type == "fade_to_black":
        return {"flash_dur": 0.03, "noise_level": 50, "noise_dur": 0.05, "rgb_shift": 15, "rgb_dur": 0.07}
    return {"flash_dur": 0.04, "noise_level": 60, "noise_dur": 0.04, "rgb_shift": 12, "rgb_dur": 0.06}


def _mix_music_with_ducking(
    video_path: str,
    music_path: str,
    output_path: str,
    duck_times: list[tuple[float, float]],
    music_volume: float = 0.12,
    duck_volume: float = 0.04,
):
    """Mix background music with edit audio, ducking during overlay times."""
    import subprocess
    duck_expr_parts = []
    for start, end in duck_times:
        duck_expr_parts.append(f"between(t,{start},{end})")
    if duck_expr_parts:
        # Guard: a single if() expression with hundreds of between() parts can
        # exceed FFmpeg's expression length limit. Chunk at MAX_DUCK_WINDOWS
        # per volume filter and chain them.
        MAX_DUCK_WINDOWS = 40
        if len(duck_expr_parts) > MAX_DUCK_WINDOWS:
            chunks = [
                duck_expr_parts[i:i + MAX_DUCK_WINDOWS]
                for i in range(0, len(duck_expr_parts), MAX_DUCK_WINDOWS)
            ]
            volume_expr = ",".join(
                f"volume='if({' + '.join(chunk)}, {duck_volume}, {music_volume})'"
                for chunk in chunks
            )
        else:
            volume_expr = f"volume='if({' + '.join(duck_expr_parts)}, {duck_volume}, {music_volume})'"
    else:
        volume_expr = f"volume={music_volume}"

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", music_path,
        "-filter_complex",
        f"[1:a]{volume_expr}[a_music];"
        f"[0:a][a_music]amix=inputs=2:duration=first[a_out]",
        "-map", "0:v",
        "-map", "[a_out]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode == 0:
        sz = os.path.getsize(output_path) / (1024 * 1024)
        print(f"  [render] Music mix: {music_path} → {output_path} ({sz:.1f}MB)")
        return output_path
    else:
        print(f"  [render] Music mix failed: {result.stderr[:300]}")
        return None


def render_edl_to_video(
    edl: dict,
    output_path: str,
    temp_dir: str = "/tmp/edl_render",
    music_path: Optional[str] = None,
) -> str:
    """Render a MonetEDL using FFmpeg complex filtergraph with transitions.

    Uses xfade (video) + acrossfade (audio) to chain clips with the
    transition type specified in each clip's meta.cut_type.

    Writes render_meta into edl["render_meta"] so the caller can audit
    whether transitions were actually applied.
    """
    import subprocess
    import shlex

    render_meta = {
        "transitions_intended": 0,
        "transitions_rendered": 0,
        "transitions_dropped": False,
        "fallback_used": False,
        "fallback_stages": [],
        "total_ffmpeg_passes": 0,
        "probed_resolution": None,
    }

    os.makedirs(temp_dir, exist_ok=True)

    footage_path = None
    for mid, media in edl.get("assets", {}).get("media", {}).items():
        footage_path = media["path"]
        break
    if not footage_path or not os.path.exists(footage_path):
        raise FileNotFoundError(f"Footage not found: {footage_path}")

    video_track = None
    for track in edl["timeline"]["tracks"]:
        if track["type"] == "video":
            video_track = track
            break
    if not video_track:
        raise ValueError("No video track in EDL")

    clips = video_track["clips"]
    n = len(clips)
    print(f"  [render] Rendering {n} clips with transitions to {output_path}")

    if n == 0:
        raise ValueError("No clips to render")
    if n == 1:
        render_meta["total_ffmpeg_passes"] = 1
        c = clips[0]
        subprocess.run([
            "ffmpeg", "-y",
            "-ss", str(c.get("inPoint", c["startTime"])),
            "-i", footage_path,
            "-t", str(c["duration"]),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            output_path,
        ], capture_output=True, text=True, timeout=120)
        sz = os.path.getsize(output_path) / (1024 * 1024)
        print(f"  [render] Done: {output_path} ({sz:.1f}MB)")
        edl["render_meta"] = render_meta
        return output_path

    D = TRANSITION_DUR
    duration = [c["duration"] for c in clips]
    in_pts = [c.get("inPoint", c["startTime"]) for c in clips]
    speeds = [c.get("speed", 1.0) for c in clips]
    shakes = [c.get("shake", 0.0) for c in clips]
    cut_types = [c.get("meta", {}).get("cut_type", "hard_cut") for c in clips]

    # Probe primary footage for canonical target dimensions and fps (E26)
    try:
        probe_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "json", footage_path,
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=15)
        probe_data = json.loads(probe_result.stdout)
        video_stream = probe_data.get("streams", [{}])[0]
        width = int(video_stream.get("width", 1280))
        height = int(video_stream.get("height", 720))
        fps_str = video_stream.get("r_frame_rate", "30/1")
        fps_num, fps_den = (int(x) for x in fps_str.split("/"))
        target_fps = round(float(fps_num) / float(fps_den) if fps_den else 30.0, 2)
    except Exception:
        width, height, target_fps = 1280, 720, 30.0
    render_meta["probed_resolution"] = f"{width}x{height}"
    print(f"  [render] Target: {width}x{height} @ {target_fps}fps")

    # Normalization block: scale+pad+setsar+fps+format for xfade compatibility
    def _normalize_filter() -> str:
        return (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"setsar=1,fps={target_fps},format=yuv420p"
        )

    # Build filtergraph parts
    parts = []
    transition_times = []  # track absolute times of each transition for glitch pass

    # 1. Trim + per-shot effects
    for i in range(n):
        spd = speeds[i]
        shk = shakes[i]
        chain = []

        if spd != 1.0:
            chain.append(
                f"[0:v]trim=start={in_pts[i]}:duration={duration[i] / spd},"
                f"setpts=PTS-STARTPTS/{spd}"
            )
        else:
            chain.append(
                f"[0:v]trim=start={in_pts[i]}:duration={duration[i]},"
                f"setpts=PTS-STARTPTS"
            )

        # Normalize to canonical target (E26: scale+pad+sar+fps+format)
        chain.append(_normalize_filter())

        # Per-shot emphasis punch-in: zoompan with individually quoted
        # expressions so inner commas (between(), if()) are NOT parsed
        # as filterchain separators. Same quoting pattern as the working
        # enable='between(t,...)' at lines 1734/1738/1742/1788.
        punch_ins = clips[i].get("meta", {}).get("punch_ins", [])
        if punch_ins:
            punch = punch_ins[0]
            punch_time = punch["time"]
            in_point = clips[i].get("inPoint", clips[i].get("startTime", 0))
            # t after setpts=PTS-STARTPTS/{spd} is compressed by speed
            t_start = (punch_time - in_point) / spd
            punch_dur = punch.get("duration", 0.5)
            max_zoom = punch.get("scale", 1.15)
            chain.append(
                f"zoompan="
                f"z='if(between(t,{t_start},{t_start+punch_dur}),min(zoom+0.002,{max_zoom}),1)':"
                f"x='if(between(t,{t_start},{t_start+punch_dur}),iw/2-(iw/zoom/2),0)':"
                f"y='if(between(t,{t_start},{t_start+punch_dur}),ih/2-(ih/zoom/2),0)':"
                f"d=1:"
                f"s={width}x{height}:"
                f"fps={target_fps}"
            )

        # Per-shot camera shake: crop with oscillating offset
        if shk > 0:
            chain.append(
                f"crop=iw-{shk}:ih-{shk}:"
                f"x='{shk}/2+{shk}/2*sin(2*PI*t*12+{i*1.7})':"
                f"y='{shk}/2+{shk}/2*sin(2*PI*t*9+{i*2.3})'"
            )
            chain.append(f"scale={width}:{height}")

        parts.append(",".join(chain) + f"[v{i}]")

    # 2. Chain video: concat for hard cuts (frame-accurate), xfade for style transitions.
    # Group clips delimited by non-hard-cut transitions so each hard-cut group
    # concatenates frame-accurately with no blended frame.
    groups = []
    current_group = [0]
    for i in range(1, n):
        if cut_types[i] == "hard_cut":
            current_group.append(i)
        else:
            groups.append(current_group)
            current_group = [i]
    groups.append(current_group)

    cumsum = 0.0  # cumulative duration of processed groups (speed-adjusted)
    total_overlap = 0.0
    prev_out = None
    transition_types = []  # parallel to transition_times (style transitions only)
    render_meta["transitions_intended"] = len(groups) - 1  # non-hard-cut group boundaries
    render_meta["transitions_rendered"] = 0

    for g_idx, group in enumerate(groups):
        # Concat within group (frame-accurate for hard cuts)
        if len(group) > 1:
            clip_labels = "".join(f"[v{i}]" for i in group)
            group_label = f"g{g_idx}"
            parts.append(
                f"{clip_labels}concat=n={len(group)}:v=1:a=0[{group_label}]"
            )
        else:
            group_label = f"v{group[0]}"

        group_dur = sum(duration[i] / speeds[i] for i in group)

        if g_idx == 0:
            prev_out = group_label
            cumsum = group_dur
            continue

        # Transition between groups — always a style transition (hard-cut
        # boundaries are collapsed into the groups above).
        ct = cut_types[group[0]]
        fade_dur = (
            0.4 if ct == "crossfade" else
            0.35 if ct == "zoom_transition" else
            0.25 if ct == "whip_pan" else
            0.5 if ct == "fade_to_black" else D
        )
        off = cumsum - total_overlap - fade_dur
        total_overlap += fade_dur
        transition_times.append(off)
        transition_types.append(ct)

        fade_type = _xfade_type_for(ct, g_idx)
        out_label = f"o{g_idx}"
        parts.append(
            f"[{prev_out}][{group_label}]xfade=transition={fade_type}:"
            f"duration={fade_dur}:offset={off:.4f}[{out_label}]"
        )
        prev_out = out_label
        cumsum += group_dur

    last_v = prev_out

    # 3. Audio: per-clip atrim + group-based concat/acrossfade.
    # Hard-cut groups use concat (zero overlap, no A/V drift accumulation).
    # Style transitions between groups use acrossfade.
    for i in range(n):
        spd = speeds[i]
        a_chain = [
            f"[0:a]atrim=start={in_pts[i]}:duration={duration[i] / spd}",
            "asetpts=PTS-STARTPTS",
        ]
        if spd != 1.0:
            a_chain.append(f"atempo={spd}")
        parts.append(",".join(a_chain) + f"[a{i}]")

    audio_overlap = 0.0
    prev_a = None
    for g_idx, group in enumerate(groups):
        if len(group) > 1:
            a_labels = "".join(f"[a{i}]" for i in group)
            group_label = f"ag{g_idx}"
            parts.append(f"{a_labels}concat=n={len(group)}:v=0:a=1[{group_label}]")
        else:
            group_label = f"a{group[0]}"

        if g_idx == 0:
            prev_a = group_label
            continue

        ct = cut_types[group[0]]
        fade_dur = (
            0.4 if ct == "crossfade" else
            0.35 if ct == "zoom_transition" else
            0.25 if ct == "whip_pan" else
            0.5 if ct == "fade_to_black" else D
        )
        audio_overlap += fade_dur
        out_label = f"agx{g_idx}"
        parts.append(f"[{prev_a}][{group_label}]acrossfade=d={fade_dur}[{out_label}]")
        prev_a = out_label

    last_a = prev_a or f"a{0 if n == 1 else ''}"
    filter_str = "; ".join(parts)

    # First pass: video with transitions + per-shot effects
    intermediate = os.path.join(temp_dir, "xfa_out.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-i", footage_path,
        "-filter_complex", filter_str,
        "-map", f"[{last_v}]",
        "-map", f"[{last_a}]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        intermediate,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        render_meta["fallback_used"] = True
        render_meta["fallback_stages"].append("xfade")
        render_meta["transitions_dropped"] = True
        print(f"  [render] *** WARNING: xfade filtergraph failed, transitions DROPPED. ***")
        print(f"  [render] Transition render failed (E23): {result.stderr[:1200]}")
        print(f"  [render] Falling back to concat (all transitions lost)")
        concat_file = os.path.join(temp_dir, "concat.txt")
        seg_files = []
        for i, c in enumerate(clips):
            sp = os.path.join(temp_dir, f"seg_{i:04d}.mp4")
            norm_vf = (
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
                f"setsar=1,fps={target_fps},format=yuv420p"
            )
            subprocess.run([
                "ffmpeg", "-y",
                "-ss", str(c.get("inPoint", c["startTime"])),
                "-i", footage_path,
                "-t", str(c["duration"]),
                "-vf", norm_vf,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "fast", "-crf", "23",
                sp,
            ], capture_output=True, timeout=60)
            seg_files.append(sp)
        with open(concat_file, "w") as f:
            for sf in seg_files:
                f.write(f"file '{sf}'\n")
        render_meta["total_ffmpeg_passes"] += 1
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_file,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            intermediate,
        ], capture_output=True, text=True, timeout=120)
        render_meta["transitions_rendered"] = 0  # all dropped
        # Clean up segment files
        for sf in seg_files:
            try:
                os.remove(sf)
            except OSError:
                pass
    else:
        render_meta["transitions_rendered"] = len(transition_times)
        render_meta["total_ffmpeg_passes"] += 1

    # Second pass: glitch effects at each transition point
    glitched = os.path.join(temp_dir, "glitched_out.mp4")
    if transition_times:
        glitch_filters = []
        for ti, t in enumerate(transition_times):
            ct = transition_types[ti]
            gp = _glitch_params_for(ct)
            flash_start = t - 0.02
            flash_end = t + gp["flash_dur"]
            static_start = t
            static_end = t + gp["noise_dur"]
            rgb_start = t
            rgb_end = t + gp["rgb_dur"]
            glitch_filters.append(
                f"drawbox=x=0:y=0:w={width}:h={height}:color=white:t=fill:"
                f"enable='between(t,{flash_start},{flash_end})'"
            )
            glitch_filters.append(
                f"noise=alls={gp['noise_level']}:allf=t:"
                f"enable='between(t,{static_start},{static_end})'"
            )
            glitch_filters.append(
                f"rgbashift=rh={gp['rgb_shift']}:gh=0:bh={-gp['rgb_shift']}:"
                f"enable='between(t,{rgb_start},{rgb_end})'"
            )
        if glitch_filters:
            gf_str = ",".join(glitch_filters)
            subprocess.run([
                "ffmpeg", "-y",
                "-i", intermediate,
                "-vf", gf_str,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "fast", "-crf", "23",
                "-c:a", "copy",
                glitched,
            ], capture_output=True, text=True, timeout=120)
            intermediate = glitched
            render_meta["total_ffmpeg_passes"] += 1
            render_meta["glitch_filters_applied"] = len(glitch_filters)
            print(f"  [render] Glitch overlay: {len(glitch_filters)} filters at {len(transition_times)} transitions")

    # Third pass: text overlays using PIL-generated PNG + overlay filter
    # Iterate ALL text tracks (overlays + captions), not just the first
    text_tracks = [t for t in edl["timeline"]["tracks"] if t["type"] == "text"]

    if text_tracks:
        ov_filter_parts = []
        ov_inputs = ["-i", intermediate]
        ov_idx = 0
        all_text_clips = []
        for track in text_tracks:
            all_text_clips.extend(track["clips"])
        for tc in all_text_clips:
            content = tc.get("meta", {}).get("text_content", "")
            if not content:
                continue
            start = tc["startTime"]
            end = start + tc["duration"]
            overlay_h = max(60, height // 15)
            img_path = os.path.join(temp_dir, f"text_overlay_{ov_idx}.png")
            _gen_text_png(content, img_path, width=width, height=overlay_h)
            ov_inputs.append("-i")
            ov_inputs.append(img_path)
            img_label = ov_idx + 1
            prev = "[0:v]" if ov_idx == 0 else f"[v{ov_idx}]"
            curr = f"[v{ov_idx + 1}]"
            overlay_y = f"main_h-overlay_h-{int(height * 0.12)}" if height > width else "main_h-overlay_h-10"
            ov_filter_parts.append(
                f"[{img_label}:v]loop=-1:size=1[l{img_label}]; "
                f"{prev}[l{img_label}]overlay=10:{overlay_y}:shortest=1:"
                f"enable='between(t,{start},{end})'{curr}"
            )
            ov_idx += 1
        if ov_filter_parts:
            out_tmp = os.path.join(temp_dir, "final_output.mp4")
            ov_filter_str = "; ".join(ov_filter_parts)
            ov_result = subprocess.run(
                ["ffmpeg", "-y"] + ov_inputs + [
                    "-filter_complex", ov_filter_str,
                    "-map", f"[v{ov_idx}]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-preset", "fast", "-crf", "23",
                    "-c:a", "copy",
                    out_tmp,
                ], capture_output=True, text=True, timeout=120)
            if ov_result.returncode == 0:
                os.replace(out_tmp, output_path)
                print(f"  [render] Text overlays applied → {output_path}")
                current_video = output_path
                render_meta["total_ffmpeg_passes"] += 1
            else:
                print(f"  [render] *** WARNING: Text overlay pass failed. Captions dropped. ***")
                print(f"  [render] Text overlay failed: {ov_result.stderr[:200]}")
                render_meta["fallback_stages"].append("text_overlay")
                current_video = intermediate
        else:
            current_video = intermediate
    else:
        current_video = intermediate

    # Fourth pass (optional): background music with ducking
    if music_path and os.path.exists(music_path):
        duck_times = []
        if text_tracks:
            for track in text_tracks:
                for tc in track["clips"]:
                    duck_times.append((tc["startTime"], tc["startTime"] + tc["duration"]))
        music_out = os.path.join(temp_dir, "music_mixed.mp4")
        result = _mix_music_with_ducking(
            current_video, music_path, music_out, duck_times
        )
        if result:
            os.replace(music_out, output_path)
            current_video = output_path
            render_meta["total_ffmpeg_passes"] += 1
            render_meta["music_mixed"] = True
        else:
            render_meta["music_mixed"] = False
            render_meta["fallback_stages"].append("music_mix")

    if not os.path.exists(output_path):
        import shutil
        shutil.copy2(current_video, output_path)

    sz = os.path.getsize(output_path) / (1024 * 1024)
    total_speed_ramps = sum(1 for s in speeds if s != 1.0)
    total_shakes = sum(1 for s in shakes if s > 0)
    print(f"  [render] Done: {output_path} ({sz:.1f}MB) [speed_ramps={total_speed_ramps}, shake={total_shakes}, glitch={len(transition_times)} cuts]")

    # Write render_meta into the EDL so downstream can audit truth
    edl["render_meta"] = render_meta
    if render_meta["transitions_dropped"]:
        print(f"  [render] *** RENDER LIED: {render_meta['transitions_intended']} transitions intended, "
              f"0 applied. Check edl['render_meta']['fallback_stages'] for details. ***")

    return output_path


# ═══════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Edit Director (Key 2)")
    parser.add_argument("footage", help="Raw footage path")
    parser.add_argument("profile", nargs="?", help="Style profile JSON file (optional if --preset used)")
    parser.add_argument("-o", "--output", help="Output EDL JSON file")
    parser.add_argument("-t", "--target", type=float, help="Target duration (seconds)")
    parser.add_argument("--no-llm", action="store_true", help="Disable LLM resolution")
    parser.add_argument("--music", help="Background music file for render")
    parser.add_argument("--mode", choices=["dialogue", "montage", "auto"], default="auto",
                        help="Editing mode: dialogue (speech-led), montage (beat-sync), or auto-detect")
    parser.add_argument("--preset", help="Launch preset ID (e.g. fast_tiktok, clean_youtube)")
    parser.add_argument("--render", "-r", help="Render to MP4 at this path (calls render_edl_to_video)")
    args = parser.parse_args()

    if args.preset:
        preset_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "presets", f"{args.preset}.json"
        )
        if not os.path.exists(preset_path):
            print(f"Preset '{args.preset}' not found at {preset_path}")
            print("Available presets: fast_tiktok, clean_youtube, podcast_shorts, "
                  "founder_launch, product_ad, cinematic_travel")
            sys.exit(1)
        profile_path = preset_path
    else:
        profile_path = args.profile
        if not profile_path:
            parser.error("Either profile path or --preset is required")

    with open(profile_path) as f:
        profile = json.load(f)

    # If mode not explicitly specified, use preset's default mode
    if args.mode == "auto" and args.preset:
        preset_mode = profile.get("mode", "auto")
        args.mode = preset_mode

    resolve_mode = {"auto": None, "dialogue": "dialogue", "montage": "montage"}.get(args.mode, None)
    edl = direct_edit(
        footage_path=args.footage,
        profile=profile,
        target_duration=args.target,
        use_llm=not args.no_llm,
        music_path=args.music,
        mode=resolve_mode,
    )

    output = args.output or f"{Path(args.footage).stem}_directed.edl.json"
    with open(output, "w") as f:
        json.dump(edl, f, indent=2, default=str)
    print(f"\nEDL written to {output}")

    if args.render:
        print(f"\nRendering to {args.render}...")
        render_edl_to_video(
            edl=edl,
            output_path=args.render,
            temp_dir=f"/tmp/edl_render_{Path(args.footage).stem}",
            music_path=args.music,
        )
        # Re-save EDL with render_meta appended
        with open(output, "w") as f:
            json.dump(edl, f, indent=2, default=str)
        print(f"EDL re-saved with render_meta to {output}")
