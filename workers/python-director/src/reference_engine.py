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

from analyzers import effect_detector, speed_ramp_detector, text_detector
from analyzers.motion_analyzer import analyze_motion, classify_camera_motion


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


def detect_cuts(video_path: str, threshold: float = 0.1) -> list[CutPoint]:
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
    """Extract color statistics from a segment."""
    cmd = [
        'ffmpeg', '-ss', str(start), '-t', str(duration),
        '-i', video_path,
        '-vf', 'signalstats=stat=totall',
        '-f', 'null', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    stats = {}
    for line in result.stderr.split('\n'):
        if 'YAVG' in line:
            try:
                stats['brightness'] = float(line.split('YAVG:')[1].split()[0]) / 255
            except (IndexError, ValueError):
                pass
        if 'YDIF' in line:
            try:
                stats['contrast'] = float(line.split('YDIF:')[1].split()[0]) / 255
            except (IndexError, ValueError):
                pass

    return stats


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


def analyze_reference_style(video_path: str) -> ReferenceStyleProfile:
    """Complete analysis of a reference video's editing style."""

    print(f"Analyzing: {video_path}")

    # 1. Get video info
    info = get_video_info(video_path)
    duration = float(info['format']['duration'])
    fps_parts = info['streams'][0]['r_frame_rate'].split('/')
    fps = float(fps_parts[0]) / float(fps_parts[1])
    width = int(info['streams'][0]['width'])
    height = int(info['streams'][0]['height'])

    print(f"  Duration: {duration:.1f}s, FPS: {fps:.1f}, Resolution: {width}x{height}")

    # 2. Detect cuts
    cuts = detect_cuts(video_path)
    print(f"  Cuts detected: {len(cuts)}")

    # 3. Build shots list for analyzers
    shots = build_shots_from_cuts(cuts, duration)
    print(f"  Shots (segments): {len(shots)}")

    # 4. Run analyzer detection passes
    # These each extract frames independently — acceptable for analysis,
    # not for real-time.
    per_shot_effects = effect_detector.detect_effects(video_path, shots)
    per_shot_text = text_detector.detect_text(video_path, shots)
    per_shot_speed = speed_ramp_detector.detect_speed_ramps(video_path, shots)
    print(f"  Effects: {sum(e['effectCount'] for e in per_shot_effects)}")
    print(f"  Text shots: {sum(1 for t in per_shot_text if t['hasText'])}")
    print(f"  Speed ramps: {sum(1 for s in per_shot_speed if s.get('hasRamp', False))}")

    # 5. Run global motion analysis (once, used by all segments)
    print("  Running optical flow analysis...")
    motion_data = analyze_motion(video_path, fps=10.0)

    # 6. Extract beats
    bpm, beats = extract_beats(video_path)
    print(f"  BPM: {bpm:.0f}, Beats: {len(beats)}")

    # 7. Build segment list with full detection data
    cut_times = [c.time for c in cuts]
    cut_times = [0] + cut_times + [duration]

    segments: list[SegmentStyle] = []
    for i in range(len(cut_times) - 1):
        seg_start = cut_times[i]
        seg_end = cut_times[i + 1]
        seg_duration = seg_end - seg_start

        if seg_duration < 0.1:
            continue

        # Color for this segment
        color_stats = extract_segment_color(video_path, seg_start, seg_duration)

        # Camera motion (from pre-computed optical flow)
        camera_motion = detect_camera_motion(
            video_path, seg_start, seg_duration,
            global_motion_data=motion_data,
        )

        # Look up effect, text, and speed data for this shot index
        shot_eff = per_shot_effects[i] if i < len(per_shot_effects) else {}
        shot_txt = per_shot_text[i] if i < len(per_shot_text) else {}
        shot_spd = per_shot_speed[i] if i < len(per_shot_speed) else {}

        # Map effects to SegmentStyle fields
        eff_style = _map_effects_to_style(shot_eff.get("effects", []))

        # Transition type from effect detection
        transition_type = "cut"
        detected_transitions = shot_eff.get("transitions", [])
        if detected_transitions:
            transition_type = _pick_transition_type(detected_transitions)

        seg = SegmentStyle(
            start=seg_start,
            end=seg_end,
            duration=seg_duration,
            brightness=color_stats.get('brightness', 1.0),
            contrast=color_stats.get('contrast', 1.0),
            saturation=1.0,
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

    # 10. Build energy curve
    energy = []
    segment = duration / 10
    for i in range(10):
        start = i * segment
        end = (i + 1) * segment
        cuts_in_segment = len([c for c in cuts if start <= c.time < end])
        energy.append(min(1.0, cuts_in_segment / 5))

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

    color_sig = ColorSignature(
        brightness=sum(all_brightness) / len(all_brightness) if all_brightness else 1.0,
        contrast=sum(all_contrast) / len(all_contrast) if all_contrast else 1.0,
        saturation=1.0,
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
        cut_alignment=cut_alignment,
        segments=segments,
        color_signature=color_sig,
        energy_curve=energy,
        climax_position=energy.index(max(energy)) / 10 if energy else 0.7,
        pacing_type=pacing,
        effect_vocabulary=effect_vocab,
        transition_vocabulary=transition_vocab,
        avg_transition_duration=avg_trans_dur,
        camera_motion_distribution=motion_dist,
        avg_speed=avg_speed_val,
        speed_variance=speed_var,
    )

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
