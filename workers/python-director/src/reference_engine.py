"""Complete reference video reverse-engineering pipeline.

Extracts EVERY editing decision from a reference video:
- Cut timing and rhythm
- Effect vocabulary per segment
- Color signature (curves, saturation, contrast)
- Transition types and durations
- Speed ramps (slow-mo, speed-ups)
- Camera motion patterns
- Audio-visual sync points
- Text overlay detection

Then applies the extracted style to new footage.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional

import numpy as np
from pydantic import BaseModel


# ═══════════════════════════════════════════════════════════════
# PATH SETUP — make scripts/ and scripts/analyzers importable
# ═══════════════════════════════════════════════════════════════

_ENGINE_DIR = Path(__file__).resolve().parent
_SCRIPTS_DIR = _ENGINE_DIR.parent.parent.parent / 'scripts'
_ANALYZERS_DIR = _SCRIPTS_DIR / 'analyzers'

for _p in [str(_SCRIPTS_DIR), str(_ANALYZERS_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from analyzers import effect_detector, speed_ramp_detector, text_detector, composite_detector
from analyzers.motion_analyzer import analyze_motion, classify_camera_motion
from analyzers.edit_events_analyzer import analyze_edit_events


# ── Effect-to-SegmentStyle field mapping ──────────────────────
# Maps effect string names (from effect_detector) to SegmentStyle
# float fields and their default intensities.

_EFFECT_TO_STYLE_FIELD: dict[str, str] = {
    "blur": "blur",
    "vignette": "vignette",
    "grain": "grain",
    "glow": "glow",
    "shake": "shake",
    "chromatic_aberration": "rgb_split",
}

_EFFECT_INTENSITY_MAP: dict[str, float] = {
    "blur": 0.7,
    "vignette": 0.7,
    "grain": 0.6,
    "glow": 0.7,
    "shake": 0.8,
    "chromatic_aberration": 0.8,
    "flash": 0.8,
    "glitch": 0.9,
    "desaturation": 0.7,
    "fade_black": 0.6,
    "fade_white": 0.6,
    "high_contrast": 0.7,
    "wipe": 0.8,
    "text": 0.7,
    "watermark": 0.5,
}


def _map_effects_to_style(effects: list[str]) -> dict[str, float]:
    """Map detected effect names to SegmentStyle float fields (0.0-1.0)."""
    style: dict[str, float] = {}
    for eff in effects:
        field = _EFFECT_TO_STYLE_FIELD.get(eff)
        if field is not None:
            intensity = _EFFECT_INTENSITY_MAP.get(eff, 0.7)
            style[field] = max(style.get(field, 0.0), intensity)
    return style


def _pick_transition_type(effect_transitions: list[str]) -> str:
    """Pick the best transition type from a list of detected transition names."""
    priority = ["glitch", "wipe", "blur", "fade_white", "fade_black", "cut"]
    for p in priority:
        if p in effect_transitions:
            return {"fade_black": "crossfade", "fade_white": "crossfade"}.get(p, p)
    return "cut"


# ═══════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════

class CutPoint(BaseModel):
    """A single cut point in the reference."""
    time: float
    confidence: float
    scene_change_score: float
    is_beat_aligned: bool = False


class SegmentStyle(BaseModel):
    """Editing style for one segment."""
    start: float
    end: float
    duration: float

    # Effects
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    blur: float = 0.0
    vignette: float = 0.0
    grain: float = 0.0
    glow: float = 0.0
    shake: float = 0.0
    rgb_split: float = 0.0

    # Color signature
    color_temp: float = 0.0  # -1 cool to +1 warm
    color_tint: float = 0.0  # -1 green to +1 magenta
    shadows_hue: float = 0.0
    highlights_hue: float = 0.0

    # Speed
    speed: float = 1.0
    speed_ramp_start: float = 1.0
    speed_ramp_end: float = 1.0

    # Camera motion
    camera_motion: str = "static"  # static, pan, zoom, handheld, orbit

    # Transition to next segment
    transition_type: str = "cut"  # cut, crossfade, flash, wipe, morph
    transition_duration: float = 0.0

    # Text overlay
    has_text: bool = False
    text_confidence: float = 0.0
    text_content: list[dict] = []  # OCR results: {text, confidence, bbox, fontSize, placement, color}

    # Composite layout
    has_composite: bool = False
    composite_layout: str = "single"  # single, 2panel_h, 2panel_v, 3panel_h, 3panel_v, grid
    composite_confidence: float = 0.0


class TransitionStyle(BaseModel):
    """Transition between two segments."""
    type: str  # cut, crossfade, flash, wipe, morph
    duration: float
    intensity: float = 1.0


class ColorSignature(BaseModel):
    """Overall color profile of the reference."""
    # Global adjustments
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0

    # Color balance
    shadows_hue: float = 0.0
    midtones_hue: float = 0.0
    highlights_hue: float = 0.0

    # Curve shape
    blacks: float = 0.0
    shadows: float = 0.0
    midtones: float = 0.5
    highlights: float = 1.0
    whites: float = 1.0

    # Style
    style: str = "neutral"  # neutral, warm, cool, vintage, cinematic, vibrant


class AudioEvent(BaseModel):
    """A detected audio event (SFX hit, bass drop, etc.)."""
    time: float
    type: str  # punch_impact, bass_drop, beat_accent, sfx_hit, vocal_emphasis
    confidence: float
    energy: float  # RMS energy at this point (0-1)
    spectral_centroid: float  # Hz, lower = more bass


class ReferenceStyleProfile(BaseModel):
    """Complete editing DNA extracted from a reference video."""

    # Source info
    source_path: str
    duration: float
    fps: float
    resolution: tuple[int, int]

    # Rhythm
    total_cuts: int
    avg_shot_duration: float
    shot_duration_variance: float
    bpm: float
    beats: list[float]
    cut_alignment: str  # strict, loose, none

    # Audio events (SFX, impacts, drops)
    audio_events: list[AudioEvent] = []

    # Segments
    segments: list[SegmentStyle]

    # Color signature
    color_signature: ColorSignature

    # Pacing
    energy_curve: list[float]
    climax_position: float
    pacing_type: str  # aggressive, fast, medium, slow

    # Effect vocabulary (what effects appear in the reference)
    effect_vocabulary: list[str]

    # Transition vocabulary
    transition_vocabulary: list[str]
    avg_transition_duration: float

    # Camera motion patterns
    camera_motion_distribution: dict[str, float]

    # Speed patterns
    avg_speed: float
    speed_variance: float

    # Post-analysis overlay video path (set after analysis)
    post_analysis_video_path: str = ""

    # Edit events (transitions, speed ramps, keyframes)
    edit_events: dict = {}

    # Text overlay aggregate
    text_overlay_summary: dict = {}


# ═══════════════════════════════════════════════════════════════
# ANALYSIS FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def get_video_info(path: str) -> dict:
    """Get video metadata."""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'stream=width,height,r_frame_rate,duration',
        '-show_entries', 'format=duration',
        '-of', 'json', path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed on {path}: {result.stderr[:200]}")
    return json.loads(result.stdout)


def detect_cuts(video_path: str, threshold: float = 0.3) -> list[CutPoint]:
    """Detect scene changes using FFmpeg."""
    cmd = [
        'ffmpeg', '-i', video_path,
        '-vf', f"select='gt(scene,{threshold})',metadata=print:file=-",
        '-f', 'null', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    cuts = []
    for line in (result.stdout + result.stderr).split('\n'):
        if 'pts_time:' in line:
            try:
                pts = float(line.split('pts_time:')[1].split()[0])
                cuts.append(CutPoint(
                    time=pts,
                    confidence=0.8,
                    scene_change_score=0.5
                ))
            except (IndexError, ValueError):
                pass

    return sorted(cuts, key=lambda c: c.time)


def extract_segment_color(video_path: str, start: float, duration: float) -> dict:
    """Extract color statistics from a segment using a mid-frame sample."""
    mid = start + duration / 2
    cmd = [
        'ffmpeg', '-ss', str(mid), '-i', video_path,
        '-frames:v', '1',
        '-vf', 'scale=64:64',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    if result.returncode != 0 or len(result.stdout) < 64 * 64 * 3:
        return {}

    pixels = list(result.stdout)
    n = len(pixels) // 3
    if n == 0:
        return {}

    # Brightness = mean of all channels
    brightness = sum(pixels) / (n * 3 * 255)

    # Contrast = std of luminance (Y = 0.299R + 0.587G + 0.114B)
    lums = [0.299 * pixels[i*3] + 0.587 * pixels[i*3+1] + 0.114 * pixels[i*3+2] for i in range(n)]
    mean_lum = sum(lums) / n
    contrast = (sum((l - mean_lum) ** 2 for l in lums) / n) ** 0.5 / 255

    # Saturation = mean of (max(RGB) - min(RGB)) / max(RGB) per pixel
    sat_vals = []
    for i in range(n):
        r, g, b = pixels[i*3], pixels[i*3+1], pixels[i*3+2]
        mx = max(r, g, b)
        mn = min(r, g, b)
        sat_vals.append((mx - mn) / mx if mx > 0 else 0)
    saturation = sum(sat_vals) / n if sat_vals else 0.0

    # Dominant hue (~warm/cool)
    hues = []
    for i in range(n):
        r, g, b = pixels[i*3] / 255, pixels[i*3+1] / 255, pixels[i*3+2] / 255
        mx = max(r, g, b)
        mn = min(r, g, b)
        if mx == mn:
            continue
        if mx == r:
            h = (60 * (g - b) / (mx - mn)) % 360
        elif mx == g:
            h = (60 * (b - r) / (mx - mn) + 120) % 360
        else:
            h = (60 * (r - g) / (mx - mn) + 240) % 360
        hues.append(h)

    return {'brightness': brightness, 'contrast': contrast, 'saturation': saturation, 'hues': hues, 'n': n}


def detect_camera_motion(
    video_path: str,
    start: float,
    duration: float,
    global_motion_data: Optional[list] = None,
) -> str:
    """Detect camera motion type using optical flow."""
    try:
        if global_motion_data is None:
            motion_data = analyze_motion(video_path, fps=10.0)
        else:
            motion_data = global_motion_data

        seg_data = [m for m in motion_data if start <= m['time'] <= start + duration]
        if len(seg_data) >= 3:
            return classify_camera_motion(seg_data, duration)
    except Exception as e:
        print(f"  Camera motion detection failed: {e}")

    return "static"


def extract_beats(video_path: str) -> tuple[float, list[float]]:
    """Extract BPM and beat timestamps."""
    try:
        import librosa

        y, sr = librosa.load(video_path, sr=22050, mono=True)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

        if hasattr(tempo, '__len__'):
            bpm = float(tempo[0])
        else:
            bpm = float(tempo)

        return bpm, beat_times
    except Exception as e:
        print(f"Beat detection failed: {e}")
        return 120.0, []


def extract_audio_events(video_path: str, beats: list[float]) -> list[AudioEvent]:
    """Detect SFX hits, punch impacts, bass drops from audio.

    Uses percussive/harmonic separation so punches and drum hits stand out
    clearly from the music bed. Classifies each onset by spectral profile.
    """
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(video_path, sr=22050, mono=True)

        # ── Percussive / harmonic separation ──
        y_harm, y_perc = librosa.effects.hpss(y)

        # ── Onsets on percussive component ──
        onset_frames = librosa.onset.onset_detect(y=y_perc, sr=sr, backtrack=False)
        if len(onset_frames) < 3:
            return [
                AudioEvent(time=b, type="beat_accent", confidence=0.5, energy=0.3, spectral_centroid=500.0)
                for b in beats if 0 < b < len(y) / sr
            ]

        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        onset_strength = librosa.onset.onset_strength(y=y_perc, sr=sr)
        onset_str_values = onset_strength[onset_frames].copy()

        # ── Full-mix STFT for spectral features ──
        stft = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        spectral_centroids = librosa.feature.spectral_centroid(S=stft, sr=sr)[0]
        onset_spec_cent = spectral_centroids[onset_frames]

        # ── Mid-band energy (300-3000 Hz) catches punch transients ──
        # Punches are wideband but most distinct from drums in the midrange
        mid_mask = (freqs > 300) & (freqs < 3000)
        mid_energy = np.sqrt(np.sum(stft[mid_mask] ** 2, axis=0)) if mid_mask.any() else np.zeros(stft.shape[1])
        onset_mid = mid_energy[onset_frames]

        # ── Sub-bass energy (<200 Hz) for bass drops ──
        sub_mask = freqs < 200
        sub_energy = np.sqrt(np.sum(stft[sub_mask] ** 2, axis=0)) if sub_mask.any() else np.zeros(stft.shape[1])
        onset_sub = sub_energy[onset_frames]

        # ── Percussive RMS (how sharp the hit is) ──
        rms_perc = librosa.feature.rms(y=y_perc)[0]
        onset_rms = rms_perc[onset_frames]

        # ── Normalise ──
        norm_mid = onset_mid / max(onset_mid.max(), 1e-6)
        norm_str = onset_str_values / max(onset_str_values.max(), 1e-6)
        norm_sub = onset_sub / max(sub_energy.max(), 1e-6)

        beat_set = set(round(b, 2) for b in beats)

        events = []
        for t, sc, mid, s, sub in zip(
            onset_times, onset_spec_cent, norm_mid, norm_str, norm_sub,
        ):
            if t < 0.5 or t > len(y) / sr - 0.5:
                continue

            is_on_beat = round(t, 2) in beat_set or any(abs(t - b) < 0.08 for b in beats)
            event_type = "sfx_hit"
            conf = min(1.0, 0.3 + mid * 0.3 + s * 0.4)

            # Punch impact: strong mid-band transient + sharp onset + midrange centroid
            if mid > 0.5 and s > 0.5 and 300 < sc < 4000:
                event_type = "punch_impact"
                conf = min(1.0, 0.4 + mid * 0.3 + s * 0.3)
            # Bass drop: sub-bass energy surge, low centroid
            elif sub > 0.6 and sc < 2000:
                event_type = "bass_drop"
                conf = min(1.0, 0.4 + sub * 0.3 + (1 - min(sc, 2000) / 2000) * 0.2)
            # Beat accent: on-beat, moderate percussive energy
            elif is_on_beat and s > 0.3:
                event_type = "beat_accent"
                conf = min(1.0, 0.4 + s * 0.3)

            events.append(AudioEvent(
                time=t, type=event_type, confidence=round(conf, 3),
                energy=round(float(mid), 3),
                spectral_centroid=round(float(sc), 1),
            ))

        print(f"  Audio events: {len(events)} total")
        type_counts = {}
        for e in events:
            type_counts[e.type] = type_counts.get(e.type, 0) + 1
        for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
            print(f"    {t}: {c}")

        return events
    except Exception as e:
        print(f"Audio event detection failed: {e}")
        return []


def build_shots_from_cuts(cuts: list[CutPoint], duration: float) -> list[dict]:
    """Build the shots list format expected by analyzers.

    Each shot: {"start": float, "end": float, "duration": float, "index": int}
    """
    cut_times = [c.time for c in cuts]
    cut_times = [0] + cut_times + [duration]

    shots = []
    for i in range(len(cut_times) - 1):
        s = cut_times[i]
        e = cut_times[i + 1]
        d = e - s
        if d < 0.1:
            continue
        shots.append({"start": s, "end": e, "duration": d, "index": i})

    return shots


def detect_edit_zone(cuts: list[CutPoint], duration: float) -> tuple[float, float]:
    """Auto-detect the edit zone — the contiguous region with real editing.

    Uses sliding window cut density and merges any gap < 3s. Returns (start, end).
    If no dense zone found, returns (0, duration).
    """
    if len(cuts) < 3:
        return (0.0, duration)

    cut_times = [c.time for c in cuts]
    window = 5.0
    stride = 0.5
    densities = []
    pos = 0.0
    while pos + window <= duration:
        count = sum(1 for t in cut_times if pos <= t < pos + window)
        densities.append((pos + window / 2, count / window))
        pos += stride

    if not densities:
        return (0.0, duration)

    # Find peak density
    peak_density = max(d for _, d in densities)
    # Threshold: 40% of peak or 0.3 cuts/sec, whichever is higher
    threshold = max(0.4 * peak_density, 0.3)

    # Mark windows above threshold
    hot = [t for t, d in densities if d >= threshold]
    if not hot:
        return (0.0, duration)

    # Merge hot regions with gaps < 3s
    zones = []
    zone_start = hot[0] - window / 2
    zone_end = hot[0] + window / 2
    for t in hot[1:]:
        if t - zone_end < 3.0:
            zone_end = t + window / 2
        else:
            zones.append((max(0, zone_start), min(duration, zone_end)))
            zone_start = t - window / 2
            zone_end = t + window / 2
    zones.append((max(0, zone_start), min(duration, zone_end)))

    # Pick the longest zone
    zone = max(zones, key=lambda z: z[1] - z[0])
    return zone


def analyze_reference_style(
    video_path: str,
    trim_start: Optional[float] = None,
    trim_end: Optional[float] = None,
) -> ReferenceStyleProfile:
    """Complete analysis of a reference video's editing style.

    Args:
        video_path: Path to the reference video
        trim_start: Trim start in seconds (None = auto-detect)
        trim_end: Trim end in seconds (None = auto-detect)
    """
    print(f"Analyzing: {video_path}")

    # 1. Get video info
    info = get_video_info(video_path)
    duration = float(info['format']['duration'])
    # Find the video stream (not audio — audio has 0/0 r_frame_rate)
    video_stream = info['streams'][0]
    for s in info['streams']:
        if s.get('width'):
            video_stream = s
            break
    fps_str = video_stream.get('r_frame_rate', '30/1')
    fps_num, fps_den = (int(x) for x in fps_str.split('/'))
    fps = float(fps_num) / float(fps_den) if fps_den else 30.0
    width = int(video_stream['width'])
    height = int(video_stream['height'])

    print(f"  Duration: {duration:.1f}s, FPS: {fps:.1f}, Resolution: {width}x{height}")

    # 2. Detect cuts
    cuts = detect_cuts(video_path)
    print(f"  Cuts detected: {len(cuts)}")

    # 3. Trim pre/post-roll padding
    if trim_start is None or trim_end is None:
        auto_start, auto_end = detect_edit_zone(cuts, duration)
        if trim_start is None:
            trim_start = auto_start
        if trim_end is None:
            trim_end = auto_end

    # 4. Build shots from all cuts, then filter to trim window
    shots = build_shots_from_cuts(cuts, duration)
    # Filter shots to the active edit zone
    shots = [s for s in shots if s["end"] > trim_start and s["start"] < trim_end]
    for i, s in enumerate(shots):
        s["index"] = i
    print(f"  Shots (segments) in edit zone [{trim_start:.1f}s–{trim_end:.1f}s]: {len(shots)}")
    print(f"    (trimmed from {len(cuts)} cuts over {duration:.1f}s)")

    # 5. Run analyzer detection passes
    # These each extract frames independently — acceptable for analysis,
    # not for real-time.
    per_shot_effects = effect_detector.detect_effects(video_path, shots)
    per_shot_text = text_detector.detect_text(video_path, shots)
    per_shot_speed = speed_ramp_detector.detect_speed_ramps(video_path, shots)
    per_shot_composite = composite_detector.detect_composites(video_path, shots)
    composites_found = sum(1 for c in per_shot_composite if c.get("hasComposite"))
    print(f"  Effects: {sum(e['effectCount'] for e in per_shot_effects)}")
    print(f"  Text shots: {sum(1 for t in per_shot_text if t['hasText'])}")
    print(f"  Speed ramps: {sum(1 for s in per_shot_speed if s.get('hasRamp', False))}")
    print(f"  Composites: {composites_found} segments with multi-clip layouts")

    # 5. Run edit events analysis (transitions + speed ramps + keyframes)
    # Only analyze cuts within the edit zone
    zone_cuts = [c for c in cuts if trim_start <= c.time <= trim_end]
    cut_dicts = [{"time": c.time} for c in zone_cuts]
    edit_events = analyze_edit_events(video_path, cut_dicts, shots, fps)
    print(f"  Edit events: {edit_events['total_events']} total")
    for te in edit_events["transitions"]:
        if te["type"] != "cut":
            print(f"    transition: {te['type']} @ {te['time']:.2f}s")

    # 6. Run global motion analysis (once, used by all segments)
    print("  Running optical flow analysis...")
    motion_data = analyze_motion(video_path, fps=10.0)

    # 7. Extract beats
    bpm, beats = extract_beats(video_path)
    print(f"  BPM: {bpm:.0f}, Beats: {len(beats)}")

    # 7b. Extract audio events (SFX, impacts, drops)
    audio_events = extract_audio_events(video_path, beats)

    # 8. Build segment list with full detection data
    segments: list[SegmentStyle] = []
    shot_idx = 0
    all_hues: list[float] = []
    for s in shots:
        seg_start_abs = s["start"]
        seg_end_abs = s["end"]
        seg_duration = s["duration"]

        if seg_duration < 0.1:
            continue

        # Color for this segment (ffmpeg uses absolute timestamps)
        color_stats = extract_segment_color(video_path, seg_start_abs, seg_duration)
        all_hues.extend(color_stats.get("hues", []))

        # Camera motion (from pre-computed optical flow)
        camera_motion = detect_camera_motion(
            video_path, seg_start_abs, seg_duration,
            global_motion_data=motion_data,
        )

        # Look up effect, text, speed, and composite data for this shot index
        shot_eff = per_shot_effects[shot_idx] if shot_idx < len(per_shot_effects) else {}
        shot_txt = per_shot_text[shot_idx] if shot_idx < len(per_shot_text) else {}
        shot_spd = per_shot_speed[shot_idx] if shot_idx < len(per_shot_speed) else {}
        shot_comp = per_shot_composite[shot_idx] if shot_idx < len(per_shot_composite) else {}
        shot_idx += 1

        # Map effects to SegmentStyle fields
        eff_style = _map_effects_to_style(shot_eff.get("effects", []))

        # Transition type from effect detection
        transition_type = "cut"
        detected_transitions = shot_eff.get("transitions", [])
        if detected_transitions:
            transition_type = _pick_transition_type(detected_transitions)

        # Store relative times (shifted by trim_start)
        rel_start = seg_start_abs - trim_start
        rel_end = seg_end_abs - trim_start

        seg = SegmentStyle(
            start=rel_start,
            end=rel_end,
            duration=seg_duration,
            brightness=color_stats.get('brightness', 1.0),
            contrast=color_stats.get('contrast', 1.0),
            saturation=color_stats.get('saturation', 0.5),
            blur=eff_style.get("blur", 0.0),
            vignette=eff_style.get("vignette", 0.0),
            grain=eff_style.get("grain", 0.0),
            glow=eff_style.get("glow", 0.0),
            shake=eff_style.get("shake", 0.0),
            rgb_split=eff_style.get("rgb_split", 0.0),
            camera_motion=camera_motion,
            transition_type=transition_type,
            transition_duration=0.3 if transition_type != "cut" else 0.0,
            speed=shot_spd.get("avgSpeed", 1.0),
            has_text=shot_txt.get("hasText", False),
            text_confidence=shot_txt.get("confidence", 0.0),
            text_content=shot_txt.get("textContent", []),
            has_composite=shot_comp.get("hasComposite", False),
            composite_layout=shot_comp.get("layout", "single"),
            composite_confidence=shot_comp.get("confidence", 0.0),
        )
        segments.append(seg)

    print(f"  Segments built: {len(segments)}")

    # 8. Calculate rhythm metrics
    if len(segments) > 1:
        durations = [s.duration for s in segments]
        avg_shot = sum(durations) / len(durations)
        variance = sum((d - avg_shot) ** 2 for d in durations) / len(durations) ** 0.5
    else:
        avg_shot = duration
        variance = 0

    # 9. Classify cuts as beat-aligned
    beat_set = set(round(b, 1) for b in beats)
    for cut in cuts:
        cut.is_beat_aligned = any(abs(cut.time - b) < 0.1 for b in beat_set)

    beat_aligned = sum(1 for c in cuts if c.is_beat_aligned)
    cut_alignment = "strict" if beat_aligned > len(cuts) * 0.7 else "loose"
    if len(cuts) == 0:
        cut_alignment = "none"

    # 10. Build energy curve (40 buckets — cut density + audio RMS)
    energy = []
    buckets = 40
    segment = duration / buckets
    # Compute audio RMS energy per bucket
    rms_energy = [0.0] * buckets
    try:
        y, sr = librosa.load(video_path, sr=22050, mono=True)
        samples_per_bucket = max(1, int(len(y) / buckets))
        for b in range(buckets):
            chunk = y[b * samples_per_bucket : (b + 1) * samples_per_bucket]
            if len(chunk) > 0:
                rms_energy[b] = min(1.0, float(np.sqrt(np.mean(chunk ** 2))) * 5)
    except Exception:
        pass
    for i in range(buckets):
        s = i * segment
        e = (i + 1) * segment
        cuts_here = len([c for c in cuts if s <= c.time < e])
        cut_density = min(1.0, cuts_here / 3)
        combined = cut_density * 0.4 + rms_energy[i] * 0.6
        energy.append(min(1.0, combined))

    # 11. Determine pacing
    if avg_shot < 1.0:
        pacing = "aggressive"
    elif avg_shot < 2.0:
        pacing = "fast"
    elif avg_shot < 3.0:
        pacing = "medium"
    else:
        pacing = "slow"

    # 12. Build effect vocabulary from all detected effects
    all_effects: list[str] = []
    for se in per_shot_effects:
        all_effects.extend(se.get("effects", []))
    effect_vocab = sorted(set(all_effects))

    # 13. Build transition vocabulary
    all_transitions: list[str] = []
    for se in per_shot_effects:
        all_transitions.extend(se.get("transitions", []))
    transition_vocab = sorted(set(all_transitions)) or ["cut"]

    # Compute average transition duration
    if "crossfade" in transition_vocab or "wipe" in transition_vocab:
        avg_trans_dur = 0.3
    elif "glitch" in transition_vocab or "blur" in transition_vocab:
        avg_trans_dur = 0.15
    else:
        avg_trans_dur = 0.0

    # 14. Build color signature
    all_brightness = [s.brightness for s in segments]
    all_contrast = [s.contrast for s in segments]
    all_saturation = [s.saturation for s in segments]

    # Classify color style from accumulated hue distribution
    if len(all_hues) > 10:
        warm = sum(1 for h in all_hues if 0 <= h < 60 or 300 <= h < 360)
        cool = sum(1 for h in all_hues if 180 <= h < 270)
        avg_sat = sum(all_saturation) / len(all_saturation) if all_saturation else 0.5
        vintage = sum(1 for h in all_hues if 30 <= h < 90)
        if warm > len(all_hues) * 0.5:
            style_str = "warm"
        elif cool > len(all_hues) * 0.4:
            style_str = "cool"
        elif vintage > len(all_hues) * 0.3 and avg_sat < 0.4:
            style_str = "vintage"
        else:
            style_str = "neutral"
    else:
        style_str = "neutral"

    color_sig = ColorSignature(
        brightness=sum(all_brightness) / len(all_brightness) if all_brightness else 1.0,
        contrast=sum(all_contrast) / len(all_contrast) if all_contrast else 1.0,
        saturation=sum(all_saturation) / len(all_saturation) if all_saturation else 0.5,
        style=style_str,
    )

    # 15. Camera motion distribution
    motion_counts: dict[str, int] = {}
    for seg in segments:
        motion_counts[seg.camera_motion] = motion_counts.get(seg.camera_motion, 0) + 1
    motion_dist = {k: v / len(segments) for k, v in motion_counts.items()} if segments else {}

    # 16. Speed patterns
    all_speeds = [s.speed for s in segments]
    avg_speed_val = float(np.mean(all_speeds)) if all_speeds else 1.0
    speed_var = float(np.var(all_speeds)) if all_speeds else 0.0

    profile = ReferenceStyleProfile(
        source_path=video_path,
        duration=duration,
        fps=fps,
        resolution=(width, height),
        total_cuts=len(cuts),
        avg_shot_duration=avg_shot,
        shot_duration_variance=variance,
        bpm=bpm,
        beats=beats,
        audio_events=audio_events,
        cut_alignment=cut_alignment,
        segments=segments,
        color_signature=color_sig,
        energy_curve=energy,
        climax_position=energy.index(max(energy)) / len(energy) if energy else 0.7,
        pacing_type=pacing,
        effect_vocabulary=effect_vocab,
        transition_vocabulary=transition_vocab,
        avg_transition_duration=avg_trans_dur,
        camera_motion_distribution=motion_dist,
        avg_speed=avg_speed_val,
        speed_variance=speed_var,
        edit_events=edit_events,
        text_overlay_summary=text_detector.aggregate_text_results(per_shot_text),
    )

    # 17. LLM deep analysis (auto-selects provider: Groq → Cerebras → NVIDIA)
    try:
        from analyzers.llm_analyzer import analyze_with_llm
        profile_dict = {
            "metadata": {
                "duration": duration, "width": width, "height": height,
                "fps": fps, "cuts": len(cuts),
            },
            "audio": {
                "bpm": bpm,
                "beats": len(beats),
                "events": [
                    {"time": e.time, "type": e.type, "confidence": e.confidence}
                    for e in audio_events
                ],
            },
            "edit_events": edit_events,
            "segments": [
                {
                    "start": s.start, "duration": s.duration,
                    "text_content": s.text_content,
                    "camera_motion": s.camera_motion,
                }
                for s in segments
            ],
            "motion": {
                "dominantDirection": "unknown",
                "avgMagnitude": float(np.mean([m.get("magnitude", 0) for m in motion_data])) if motion_data else 0,
                "variance": float(np.var([m.get("magnitude", 0) for m in motion_data])) if motion_data else 0,
            },
            "effects": [{"type": e} for e in effect_vocab],
            "energyCurve": energy,
        }
        llm_analysis = analyze_with_llm(profile_dict)
        if llm_analysis:
            profile._llm_analysis = llm_analysis
            timeline = llm_analysis.get("timeline", [])
            print(f"  [llm] Style DNA: {llm_analysis.get('styleDNA', {}).get('editingPhilosophy', 'n/a')}")
            print(f"  [llm] Timeline: {len(timeline)} segments analyzed")
    except Exception as e:
        print(f"  [llm] Skipped: {e}")

    return profile


# ═══════════════════════════════════════════════════════════════
# STYLE APPLICATION
# ═══════════════════════════════════════════════════════════════

def apply_reference_style(
    profile: ReferenceStyleProfile,
    footage_path: str,
    output_path: str,
    target_duration: Optional[float] = None,
) -> str:
    """Apply the extracted reference style to user footage."""

    target_dur = target_duration or profile.duration

    print(f"\nApplying style to: {footage_path}")
    print(f"  Target duration: {target_dur:.1f}s")
    print(f"  Reference had {profile.total_cuts} cuts in {profile.duration:.1f}s")
    print(f"  Applying {len(profile.segments)} segments")

    # Get footage duration
    info = get_video_info(footage_path)
    footage_duration = float(info['format']['duration'])

    # Calculate segment mapping
    # Scale reference segments to fit target duration
    time_scale = target_dur / profile.duration if profile.duration > 0 else 1

    # Build FFmpeg filter chain for each segment
    temp_files = []

    for i, seg in enumerate(profile.segments[:int(target_dur / profile.avg_shot_duration)]):
        # Map reference segment to footage time
        footage_start = seg.start * time_scale * (footage_duration / target_dur)
        footage_duration_seg = seg.duration * time_scale

        # Clamp to footage bounds
        footage_start = max(0, min(footage_start, footage_duration - 0.1))
        footage_duration_seg = min(footage_duration_seg, footage_duration - footage_start)

        if footage_duration_seg < 0.1:
            continue

        # Build filters for this segment
        filters = []

        # Color adjustments
        if seg.brightness != 1.0:
            filters.append(f"eq=brightness={seg.brightness - 1:.2f}")
        if seg.contrast != 1.0:
            filters.append(f"eq=contrast={seg.contrast}")
        if seg.saturation != 1.0:
            filters.append(f"eq=saturation={seg.saturation}")

        # Speed
        if seg.speed != 1.0:
            filters.append(f"setpts={1/seg.speed}*PTS")

        # Scale to output
        filters.append("scale=1080:1920")

        filter_str = ",".join(filters) if filters else "scale=1080:1920"

        # Extract segment
        temp_file = f'/tmp/segment_{i:03d}.mp4'
        temp_files.append(temp_file)

        cmd = [
            'ffmpeg', '-y',
            '-ss', str(footage_start),
            '-i', footage_path,
            '-t', str(footage_duration_seg),
            '-vf', filter_str,
            '-r', '30',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            temp_file
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  WARNING: Segment {i} failed")
            continue

        print(f"  Segment {i}: {footage_start:.1f}-{footage_start + footage_duration_seg:.1f}s")

    # Concatenate all segments
    if not temp_files:
        print("  ERROR: No segments produced")
        return ""

    concat_file = '/tmp/concat.txt'
    with open(concat_file, 'w') as f:
        for tf in temp_files:
            if Path(tf).exists():
                f.write(f"file '{tf}'\n")

    # Apply final color grade
    grade_filters = []
    if profile.color_signature.brightness != 1.0:
        grade_filters.append(f"eq=brightness={profile.color_signature.brightness - 1:.2f}")
    if profile.color_signature.contrast != 1.0:
        grade_filters.append(f"eq=contrast={profile.color_signature.contrast}")
    if profile.color_signature.saturation != 1.0:
        grade_filters.append(f"eq=saturation={profile.color_signature.saturation}")

    grade_str = ",".join(grade_filters) if grade_filters else "null"

    # Final render
    cmd = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', concat_file,
        '-vf', grade_str,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-r', '30',
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # Cleanup temp files
    for tf in temp_files:
        if Path(tf).exists():
            Path(tf).unlink()

    if result.returncode == 0:
        size = Path(output_path).stat().st_size
        print(f"\n  DONE: {output_path} ({size:,} bytes)")
        return output_path
    else:
        print(f"\n  FAILED: {result.stderr[:300]}")
        return ""


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # ── analyze subcommand (new) ───────────────────────────────
    if len(sys.argv) >= 3 and sys.argv[1] == "analyze":
        video_path = sys.argv[2]
        output_path = None
        if len(sys.argv) >= 5 and sys.argv[3] == "-o":
            output_path = sys.argv[4]

        profile = analyze_reference_style(video_path)
        profile_dict = profile.model_dump(mode="json")

        if output_path:
            with open(output_path, "w") as f:
                json.dump(profile_dict, f, indent=2)
            print(f"\nAnalysis written to {output_path}")
        else:
            print(json.dumps(profile_dict, indent=2))

        sys.exit(0)

    # ── legacy apply mode (unchanged) ──────────────────────────
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python reference_engine.py analyze <video.mp4> [-o analysis.json]")
        print("  python reference_engine.py <reference.mp4> <footage.mp4> [output.mp4]")
        sys.exit(1)

    reference = sys.argv[1]
    footage = sys.argv[2]
    output = sys.argv[3] if len(sys.argv) > 3 else "styled_output.mp4"

    # Analyze reference
    print("=" * 60)
    print("REFERENCE ANALYSIS")
    print("=" * 60)
    profile = analyze_reference_style(reference)

    print(f"\n{'=' * 60}")
    print("STYLE PROFILE")
    print(f"{'=' * 60}")
    print(f"Duration: {profile.duration:.1f}s")
    print(f"Cuts: {profile.total_cuts}")
    print(f"Avg shot: {profile.avg_shot_duration:.2f}s")
    print(f"BPM: {profile.bpm:.0f}")
    print(f"Cut alignment: {profile.cut_alignment}")
    print(f"Pacing: {profile.pacing_type}")
    print(f"Color: brightness={profile.color_signature.brightness:.2f}, contrast={profile.color_signature.contrast:.2f}")
    print(f"Camera motion: {profile.camera_motion_distribution}")

    # Apply style
    print(f"\n{'=' * 60}")
    print("STYLE APPLICATION")
    print(f"{'=' * 60}")
    result = apply_reference_style(profile, footage, output)

    if result:
        print(f"\nSuccess! Output: {result}")
    else:
        print("\nFailed to render")
