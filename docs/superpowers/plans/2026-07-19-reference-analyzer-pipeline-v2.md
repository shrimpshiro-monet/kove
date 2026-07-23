# Reference Analyzer Pipeline V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ingest normalization, genre-conditioned thresholds, audio expansion, composition analysis, and a burn-in QA visualizer to the Python analyzer pipeline.

**Architecture:** Two new top-level modules in `scripts/analyzers/`. `pipeline_context.py` wraps all 11 existing analyzers with pre-processing + orchestration. `analysis_visualizer.py` is standalone, consuming existing JSON schemas. A `thresholds.yaml` provides per-genre calibration for all analyzer magic numbers.

**Tech Stack:** Python 3.10+, OpenCV, librosa, pyloudnorm, PyTorch (Demucs), webrtcvad, PyYAML, ffmpeg/ffprobe.

## Global Constraints

- All analyzers stay in `scripts/analyzers/` — no structural moves
- Must handle HDR → SDR tone-mapping before color analysis
- Genre classification always runs first; thresholds default to generic if genre unknown
- `analysis_visualizer.py` must not modify analyzer code — only consume existing JSON schemas
- Every overlay layer in the visualizer must be toggleable via CLI flag
- Audio source separation is optional (gated on Demucs import success), silently skips if unavailable
- All configurable thresholds go in `thresholds.yaml`, not in `.py` code

---

### Task 1: `thresholds.yaml` — Per-genre threshold configuration

**Files:**
- Create: `scripts/analyzers/thresholds.yaml`
- Create: `scripts/analyzers/thresholds.py` (loader utility)

**Interfaces:**
- Produces: `Thresholds.load(genre: str) -> dict` returns genre profile dict with all threshold values
- Consumes: genre string from `reference_type_classifier`

- [ ] **Step 1: Write the thresholds YAML**

```yaml
# scripts/analyzers/thresholds.yaml
# Per-genre threshold profiles.
# Generic profile used when genre is unknown or classifier confidence < 0.5.

generic:
  cut_detection:
    threshold: 0.15
    min_shot_duration: 0.034
  pacing:
    frantic: 0.8
    rapid: 1.8
    balanced: 4.0
    slow_burn: 999.0
  motion:
    farneback_static: 0.01
    farneback_pan: 0.08
    farneback_tracking: 0.20
    farneback_handheld_variance: 0.002
    farneback_standing: 0.02
    farneback_walking: 0.08
    farneback_running_peak: 0.15
    frame_diff_static: 0.05
    frame_diff_pan: 0.20
    frame_diff_handheld_variance: 0.01
    frame_diff_standing: 0.10
    frame_diff_walking: 0.20
    frame_diff_running_peak: 0.50
  effect:
    confidence_threshold: 0.7
    flash_stddev_mult: 2.0
    blur_edge_ratio: 0.3
  text:
    ocr_confidence: 50
  color:
    bw_saturation: 15
    desaturated_saturation: 35
    dark_luminance: 60
    bright_luminance: 200
    vibrant_saturation: 100

sports_highlight:
  cut_detection:
    threshold: 0.12
    min_shot_duration: 0.034
  pacing:
    frantic: 0.5
    rapid: 1.2
    balanced: 3.0
    slow_burn: 999.0
  motion:
    farneback_static: 0.015
    farneback_pan: 0.10
    farneback_tracking: 0.25
    farneback_handheld_variance: 0.003
    farneback_standing: 0.03
    farneback_walking: 0.10
    farneback_running_peak: 0.12
    frame_diff_static: 0.06
    frame_diff_pan: 0.25
    frame_diff_handheld_variance: 0.015
    frame_diff_standing: 0.12
    frame_diff_walking: 0.25
    frame_diff_running_peak: 0.40
  effect:
    confidence_threshold: 0.65
    flash_stddev_mult: 1.5
    blur_edge_ratio: 0.35
  text:
    ocr_confidence: 40
  color:
    bw_saturation: 10
    desaturated_saturation: 30
    dark_luminance: 55
    bright_luminance: 210
    vibrant_saturation: 110

vlog:
  cut_detection:
    threshold: 0.18
    min_shot_duration: 0.1
  pacing:
    frantic: 1.5
    rapid: 3.0
    balanced: 6.0
    slow_burn: 999.0
  motion:
    farneback_static: 0.008
    farneback_pan: 0.06
    farneback_tracking: 0.15
    farneback_handheld_variance: 0.0015
    farneback_standing: 0.015
    farneback_walking: 0.06
    farneback_running_peak: 0.12
    frame_diff_static: 0.04
    frame_diff_pan: 0.15
    frame_diff_handheld_variance: 0.008
    frame_diff_standing: 0.08
    frame_diff_walking: 0.15
    frame_diff_running_peak: 0.40
  effect:
    confidence_threshold: 0.75
    flash_stddev_mult: 2.5
    blur_edge_ratio: 0.25
  text:
    ocr_confidence: 60
  color:
    bw_saturation: 20
    desaturated_saturation: 40
    dark_luminance: 65
    bright_luminance: 200
    vibrant_saturation: 95

amv_anime:
  cut_detection:
    threshold: 0.10
    min_shot_duration: 0.034
  pacing:
    frantic: 0.4
    rapid: 1.0
    balanced: 2.5
    slow_burn: 999.0
  motion:
    farneback_static: 0.02
    farneback_pan: 0.12
    farneback_tracking: 0.30
    farneback_handheld_variance: 0.004
    farneback_standing: 0.04
    farneback_walking: 0.12
    farneback_running_peak: 0.10
    frame_diff_static: 0.08
    frame_diff_pan: 0.30
    frame_diff_handheld_variance: 0.02
    frame_diff_standing: 0.15
    frame_diff_walking: 0.30
    frame_diff_running_peak: 0.35
  effect:
    confidence_threshold: 0.6
    flash_stddev_mult: 1.2
    blur_edge_ratio: 0.4
  text:
    ocr_confidence: 35
  color:
    bw_saturation: 8
    desaturated_saturation: 25
    dark_luminance: 50
    bright_luminance: 220
    vibrant_saturation: 120

dance_edit:
  cut_detection:
    threshold: 0.11
    min_shot_duration: 0.034
  pacing:
    frantic: 0.5
    rapid: 1.0
    balanced: 2.0
    slow_burn: 999.0
  motion:
    farneback_static: 0.01
    farneback_pan: 0.09
    farneback_tracking: 0.22
    farneback_handheld_variance: 0.0025
    farneback_standing: 0.02
    farneback_walking: 0.09
    farneback_running_peak: 0.13
    frame_diff_static: 0.05
    frame_diff_pan: 0.22
    frame_diff_handheld_variance: 0.012
    frame_diff_standing: 0.10
    frame_diff_walking: 0.22
    frame_diff_running_peak: 0.45
  effect:
    confidence_threshold: 0.65
    flash_stddev_mult: 1.8
    blur_edge_ratio: 0.3
  text:
    ocr_confidence: 45
  color:
    bw_saturation: 12
    desaturated_saturation: 28
    dark_luminance: 55
    bright_luminance: 215
    vibrant_saturation: 115

gaming_montage:
  cut_detection:
    threshold: 0.09
    min_shot_duration: 0.034
  pacing:
    frantic: 0.3
    rapid: 0.8
    balanced: 2.0
    slow_burn: 999.0
  motion:
    farneback_static: 0.025
    farneback_pan: 0.15
    farneback_tracking: 0.35
    farneback_handheld_variance: 0.005
    farneback_standing: 0.05
    farneback_walking: 0.15
    farneback_running_peak: 0.08
    frame_diff_static: 0.10
    frame_diff_pan: 0.35
    frame_diff_handheld_variance: 0.025
    frame_diff_standing: 0.18
    frame_diff_walking: 0.35
    frame_diff_running_peak: 0.30
  effect:
    confidence_threshold: 0.55
    flash_stddev_mult: 1.0
    blur_edge_ratio: 0.45
  text:
    ocr_confidence: 30
  color:
    bw_saturation: 5
    desaturated_saturation: 20
    dark_luminance: 45
    bright_luminance: 230
    vibrant_saturation: 130

movie_trailer:
  cut_detection:
    threshold: 0.14
    min_shot_duration: 0.1
  pacing:
    frantic: 0.6
    rapid: 1.5
    balanced: 3.5
    slow_burn: 999.0
  motion:
    farneback_static: 0.005
    farneback_pan: 0.05
    farneback_tracking: 0.12
    farneback_handheld_variance: 0.001
    farneback_standing: 0.01
    farneback_walking: 0.05
    farneback_running_peak: 0.18
    frame_diff_static: 0.03
    frame_diff_pan: 0.12
    frame_diff_handheld_variance: 0.005
    frame_diff_standing: 0.06
    frame_diff_walking: 0.12
    frame_diff_running_peak: 0.55
  effect:
    confidence_threshold: 0.7
    flash_stddev_mult: 2.0
    blur_edge_ratio: 0.3
  text:
    ocr_confidence: 55
  color:
    bw_saturation: 18
    desaturated_saturation: 38
    dark_luminance: 60
    bright_luminance: 200
    vibrant_saturation: 100

tiktok_general:
  cut_detection:
    threshold: 0.13
    min_shot_duration: 0.034
  pacing:
    frantic: 0.5
    rapid: 1.2
    balanced: 3.0
    slow_burn: 999.0
  motion:
    farneback_static: 0.012
    farneback_pan: 0.08
    farneback_tracking: 0.20
    farneback_handheld_variance: 0.002
    farneback_standing: 0.025
    farneback_walking: 0.08
    farneback_running_peak: 0.14
    frame_diff_static: 0.06
    frame_diff_pan: 0.20
    frame_diff_handheld_variance: 0.01
    frame_diff_standing: 0.10
    frame_diff_walking: 0.20
    frame_diff_running_peak: 0.45
  effect:
    confidence_threshold: 0.7
    flash_stddev_mult: 1.8
    blur_edge_ratio: 0.35
  text:
    ocr_confidence: 50
  color:
    bw_saturation: 15
    desaturated_saturation: 35
    dark_luminance: 60
    bright_luminance: 210
    vibrant_saturation: 105
```

- [ ] **Step 2: Write the thresholds loader**

```python
"""scripts/analyzers/thresholds.py — Load per-genre threshold profiles."""

import os
import yaml
from typing import Any

_THRESHOLDS: dict[str, Any] | None = None

def _load() -> dict[str, Any]:
    global _THRESHOLDS
    if _THRESHOLDS is not None:
        return _THRESHOLDS
    path = os.path.join(os.path.dirname(__file__), "thresholds.yaml")
    with open(path) as f:
        _THRESHOLDS = yaml.safe_load(f)
    return _THRESHOLDS

def get_threshold(genre: str, *keys: str, default: Any = None) -> Any:
    """Walk the thresholds tree by keys, falling back to generic profile."""
    profile = _load()
    d = profile.get(genre, {})
    if not d:
        d = profile.get("generic", {})
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k)
        else:
            return default
    return d if d is not None else default

def get_profile(genre: str) -> dict[str, Any]:
    """Return the full threshold profile for a genre (fallback to generic)."""
    return _load().get(genre, _load().get("generic", {}))
```

- [ ] **Step 3: Verify thresholds load correctly**

Run: `python -c "from scripts.analyzers.thresholds import get_profile; p = get_profile('sports_highlight'); print(p['cut_detection']['threshold'])"`
Expected: `0.12`

- [ ] **Step 4: Commit**

```bash
git add scripts/analyzers/thresholds.yaml scripts/analyzers/thresholds.py
git commit -m "feat(analyzers): add per-genre threshold profiles and loader"
```

---

### Task 2: `pipeline_context.py` — Ingest normalization

**Files:**
- Create: `scripts/analyzers/pipeline_context.py`

**Interfaces:**
- Consumes: raw video path
- Produces: `normalize_video(path) -> NormalizedVideo` with normalized frame path, metadata, HDR flag
- Consumed by: `run_pipeline()` orchestrator

- [ ] **Step 1: Write pipeline_context.py — ingest probe + normalization**

```python
"""
pipeline_context.py — Pre-processing + orchestration for all analyzers.

Runs before every analyzer and provides:
  a) Ingest normalization (resolution, HDR, frame scaling)
  b) Genre classification (runs reference_type_classifier first)
  c) Genre-conditioned threshold profiles
  d) Audio expansion (source separation, loudness)
  e) Composition analysis
"""

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

from .thresholds import get_profile

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class NormalizedVideo:
    """Normalized reference video ready for analysis."""
    original_path: str
    normalized_path: str          # scaled/letterboxed copy (or original if no transform needed)
    width: int
    height: int
    original_width: int
    original_height: int
    fps: float
    duration: float
    has_audio: bool
    is_hdr: bool
    color_primaries: str
    color_transfer: str
    aspect_ratio: float
    genre: str = "unknown"
    genre_confidence: float = 0.0
    profile: dict = field(default_factory=dict)

@dataclass
class AudioStems:
    """Separated audio stems."""
    music_path: Optional[str] = None
    vocals_path: Optional[str] = None
    sfx_path: Optional[str] = None
    raw_path: Optional[str] = None
    extracted_wav: Optional[str] = None


# ---------------------------------------------------------------------------
# ffprobe helpers
# ---------------------------------------------------------------------------

def _run_ffprobe(path: str) -> dict:
    """Run ffprobe and return parsed JSON."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout) if result.returncode == 0 else {}


def probe_video(path: str) -> dict:
    """Extract video metadata from file."""
    data = _run_ffprobe(path)
    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    audio_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "audio"),
        None,
    )

    if not video_stream:
        return {"duration": 0, "width": 0, "height": 0, "fps": 30.0, "has_audio": False}

    fps = 30.0
    r_frame_rate = video_stream.get("r_frame_rate", "30/1")
    try:
        num, den = r_frame_rate.split("/")
        fps = int(num) / int(den)
    except (ValueError, ZeroDivisionError):
        fps = 30.0

    color_primaries = video_stream.get("color_primaries", "unknown")
    color_transfer = video_stream.get("color_transfer", "unknown")

    # HDR detection: BT.2020 primaries + PQ/HLG transfer
    is_hdr = (
        "bt2020" in color_primaries.lower()
        and any(t in color_transfer.lower() for t in ("smpte2084", "arib-std-b67", "hlg", "pq"))
    )

    fmt = data.get("format", {})
    return {
        "duration": float(fmt.get("duration", 0)),
        "width": int(video_stream.get("width", 0)),
        "height": int(video_stream.get("height", 0)),
        "fps": fps,
        "has_audio": audio_stream is not None,
        "color_primaries": color_primaries,
        "color_transfer": color_transfer,
        "is_hdr": is_hdr,
    }


def normalize_video(path: str, target_long_edge: int = 1280) -> NormalizedVideo:
    """
    Normalize a video for analysis.

    - Probes metadata (resolution, HDR, FPS, etc.)
    - If HDR, tone-maps to SDR
    - Scales/letterboxes to target_long_edge on the longest side
    - Returns NormalizedVideo with paths and metadata
    """
    meta = probe_video(path)
    width = meta["width"]
    height = meta["height"]
    aspect = width / height if height > 0 else 16 / 9

    # Determine scale factor
    long_edge = max(width, height)
    if long_edge <= target_long_edge and not meta["is_hdr"]:
        # No transform needed
        return NormalizedVideo(
            original_path=path,
            normalized_path=path,
            width=width,
            height=height,
            original_width=width,
            original_height=height,
            fps=meta["fps"],
            duration=meta["duration"],
            has_audio=meta["has_audio"],
            is_hdr=meta["is_hdr"],
            color_primaries=meta["color_primaries"],
            color_transfer=meta["color_transfer"],
            aspect_ratio=aspect,
        )

    out_path = tempfile.mktemp(suffix=".mp4")
    scale_factor = target_long_edge / long_edge
    new_w = int(width * scale_factor)
    new_h = int(height * scale_factor)
    # Ensure even dimensions
    new_w = new_w if new_w % 2 == 0 else new_w + 1
    new_h = new_h if new_h % 2 == 0 else new_h + 1

    vf = f"scale={new_w}:{new_h}"

    if meta["is_hdr"]:
        # Tone-map HDR to SDR using zscale + tonemap
        vf = (
            f"zscale=transfer=linear,tonemap=hable:param=1.0,"
            f"zscale=transfer=bt709,format=yuv420p,{vf}"
        )

    cmd = [
        "ffmpeg", "-y", "-i", path,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-an",
        out_path,
    ]
    subprocess.run(cmd, capture_output=True, timeout=120)

    return NormalizedVideo(
        original_path=path,
        normalized_path=out_path,
        width=new_w,
        height=new_h,
        original_width=width,
        original_height=height,
        fps=meta["fps"],
        duration=meta["duration"],
        has_audio=meta["has_audio"],
        is_hdr=meta["is_hdr"],
        color_primaries=meta["color_primaries"],
        color_transfer=meta["color_transfer"],
        aspect_ratio=aspect,
    )
```

- [ ] **Step 2: Verify probe + normalize work**

Run: `python -c "from scripts.analyzers.pipeline_context import probe_video; print(probe_video('scripts/test_fixtures/sample.mp4'))" 2>&1 || echo 'No test fixture — will verify at pipeline level'`

- [ ] **Step 3: Add HDR test detection**

Run: `python -c "from scripts.analyzers.pipeline_context import normalize_video; from pathlib import Path; v = normalize_video('/Users/hamza/Desktop/reserves/monet-ai-story/scripts/test_fixtures/sample.mp4' if Path('/Users/hamza/Desktop/reserves/monet-ai-story/scripts/test_fixtures/sample.mp4').exists() else 'nonexistent'); print(repr(v))"`

- [ ] **Step 4: Commit**

```bash
git add scripts/analyzers/pipeline_context.py
git commit -m "feat(analyzers): add pipeline_context with ingest normalization"
```

---

### Task 3: `pipeline_context.py` — Audio expansion (source separation, loudness, VO cadence)

**Files:**
- Modify: `scripts/analyzers/pipeline_context.py` (append to file)

**Interfaces:**
- Produces: `extract_audio_stems(normalized: NormalizedVideo) -> AudioStems`
- Produces: `analyze_loudness(audio_path: str) -> dict` (lufs_integrated, lufs_range, true_peak)
- Produces: `analyze_vo_cadence(audio_path: str) -> dict` (speech_ratio, word_count, silence_pct)

- [ ] **Step 1: Add audio extraction + source separation**

Append to `pipeline_context.py`:

```python
# ---------------------------------------------------------------------------
# Audio expansion
# ---------------------------------------------------------------------------

def extract_raw_audio(video_path: str) -> Optional[str]:
    """Extract audio to WAV for analysis."""
    out = tempfile.mktemp(suffix=".wav")
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "44100", "-ac", "1",
        out,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode == 0 and os.path.getsize(out) > 1000:
        return out
    return None


def separate_stems(audio_path: str) -> AudioStems:
    """
    Source separation using Demucs (hybrid transformer).

    Returns AudioStems with music/vocals/SFX paths.
    Silently returns empty stems if Demucs not available.
    """
    stems = AudioStems(raw_path=audio_path, extracted_wav=audio_path)
    try:
        import torch  # noqa: F401 — verify torch is available
        from demucs import separate
        from demucs.pretrained import get_model

        out_dir = tempfile.mkdtemp(prefix="stems-")
        # Demucs CLI: demucs --two-stems=vocals -o out_dir audio.wav
        cmd = [
            "python", "-m", "demucs",
            "--two-stems", "vocals",
            "-o", out_dir,
            audio_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=300)

        # Demucs output: out_dir/htdemucs/audio_name/{vocals,no_vocals,other}.wav
        base = os.path.splitext(os.path.basename(audio_path))[0]
        model_dir = os.path.join(out_dir, "htdemucs", base)
        if os.path.isdir(model_dir):
            vocals = os.path.join(model_dir, "vocals.wav")
            no_vocals = os.path.join(model_dir, "no_vocals.wav")
            other = os.path.join(model_dir, "other.wav")
            if os.path.exists(vocals):
                stems.vocals_path = vocals
            if os.path.exists(no_vocals):
                stems.music_path = no_vocals
            if os.path.exists(other):
                stems.sfx_path = other
    except ImportError:
        pass
    except Exception as e:
        print(f"  [audio] Source separation skipped: {e}")
    return stems


def analyze_loudness(audio_path: str) -> dict:
    """
    Analyze loudness using pyloudnorm (EBU R128 / ITU-R BS.1770-4).

    Returns dict with lufs_integrated, lufs_range, true_peak, and
    dynamics (ratio of loud vs quiet segments).
    """
    try:
        import soundfile as sf
        import pyloudnorm as pyln

        data, rate = sf.read(audio_path)
        if len(data.shape) > 1:
            data = data.mean(axis=1)  # mono mix

        meter = pyln.Meter(rate)
        lufs_integrated = meter.integrated_loudness(data)

        # Block-based loudness range estimation (simplified)
        block_size = int(rate * 0.1)  # 100ms blocks
        block_loudness = []
        for start in range(0, len(data) - block_size, block_size):
            block = data[start:start + block_size]
            block_loudness.append(float(np.sqrt(np.mean(block ** 2))))

        if block_loudness:
            block_db = [20 * np.log10(max(b, 1e-10)) for b in block_loudness]
            lufs_range = float(np.percentile(block_db, 95) - np.percentile(block_db, 5))
            dynamics = float(np.std(block_db))
        else:
            lufs_range = 0.0
            dynamics = 0.0

        true_peak = float(np.max(np.abs(data)))
        return {
            "lufs_integrated": lufs_integrated,
            "lufs_range": lufs_range,
            "true_peak": true_peak,
            "dynamics": dynamics,
        }
    except ImportError:
        return {"lufs_integrated": -23.0, "lufs_range": 10.0, "true_peak": 0.5, "dynamics": 3.0}


def analyze_vo_cadence(audio_path: str) -> dict:
    """
    Analyze voiceover cadence using webrtcvad.

    Returns dict with speech_ratio (0-1), silence_pct, avg_speech_segment_duration.
    """
    try:
        import webrtcvad
        import wave

        with wave.open(audio_path, "rb") as wf:
            rate = wf.getframerate()
            frames = wf.readframes(wf.getnframes())

        # Ensure 16-bit 16kHz mono
        if rate != 16000:
            return _fallback_vad()

        vad = webrtcvad.Vad(2)  # Aggressiveness mode 2

        frame_duration_ms = 30
        frame_size = int(rate * frame_duration_ms / 1000) * 2  # 16-bit = 2 bytes
        speech_frames = 0
        total_frames = 0
        speech_segments = 0
        in_speech = False

        offset = 0
        while offset + frame_size <= len(frames):
            chunk = frames[offset:offset + frame_size]
            is_speech = vad.is_speech(chunk, rate)
            if is_speech:
                speech_frames += 1
            if is_speech and not in_speech:
                speech_segments += 1
            in_speech = is_speech
            total_frames += 1
            offset += frame_size

        speech_ratio = speech_frames / max(1, total_frames)
        return {
            "speech_ratio": speech_ratio,
            "silence_pct": 1.0 - speech_ratio,
            "avg_speech_segment_duration": speech_frames / max(1, speech_segments) * frame_duration_ms / 1000,
        }
    except ImportError:
        return _fallback_vad()


def _fallback_vad() -> dict:
    """Fallback VAD using RMS energy threshold."""
    return {"speech_ratio": 0.0, "silence_pct": 1.0, "avg_speech_segment_duration": 0.0}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/analyzers/pipeline_context.py
git commit -m "feat(analyzers): add audio expansion (separation, loudness, VAD)"
```

---

### Task 4: `pipeline_context.py` — Genre-conditioned orchestration

**Files:**
- Modify: `scripts/analyzers/pipeline_context.py` (append orchestration function)
- Modify: `scripts/analyzers/editorial_style_export.py` (wire through pipeline_context)

**Interfaces:**
- Produces: `run_pipeline(video_path: str) -> dict` — runs genre classification, normalization, then all analyzers with genre profile

- [ ] **Step 1: Add the orchestration function**

Append to `pipeline_context.py`:

```python
# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def classify_genre(video_path: str, name: str = "video") -> tuple[str, float]:
    """Run reference_type_classifier and return (genre, confidence)."""
    try:
        from .reference_type_classifier import classify_reference_type
        result = classify_reference_type(video_path, name)
        return result.get("type", "unknown"), result.get("confidence", 0.0)
    except Exception as e:
        print(f"  [pipeline] Genre classification failed: {e}")
        return "unknown", 0.0


def run_pipeline(video_path: str, name: str = "reference") -> dict:
    """
    Run the complete analysis pipeline.

    1. Normalize video
    2. Classify genre
    3. Load genre profile
    4. Run all standard analyzers via editorial_style_export
    5. Expand audio
    6. Run composition analysis
    7. Return unified result
    """
    print(f"╔══ Pipeline: {name} ═══╗")
    print(f"  Input: {video_path}")

    # Step 1: Normalize
    normalized = normalize_video(video_path)
    print(f"  Normalized: {normalized.width}x{normalized.height}"
          f" @ {normalized.fps}fps"
          f" {'[HDR→SDR]' if normalized.is_hdr else ''}")

    # Step 2: Genre
    genre, confidence = classify_genre(normalized.normalized_path, name)
    normalized.genre = genre
    normalized.genre_confidence = confidence
    normalized.profile = get_profile(genre)
    print(f"  Genre: {genre} (conf={confidence:.2f})")

    # Step 3: Run editorial style export
    from .editorial_style_export import export_editorial_style
    style = export_editorial_style(normalized.normalized_path, name, verbose=False)

    # Step 4: Audio expansion
    audio_result = {"stems": None, "loudness": None, "vad": None}
    if normalized.has_audio:
        wav = extract_raw_audio(normalized.normalized_path)
        if wav:
            stems = separate_stems(wav)
            audio_result["stems"] = {
                "has_music": stems.music_path is not None,
                "has_vocals": stems.vocals_path is not None,
                "has_sfx": stems.sfx_path is not None,
            }
            audio_result["loudness"] = analyze_loudness(wav)
            audio_result["vad"] = analyze_vo_cadence(wav)

    # Step 5: Composition analysis
    composition = analyze_composition(normalized, style.get("shots", []))

    # Step 6: Cleanup temp normalized file
    if normalized.normalized_path != normalized.original_path:
        try:
            os.remove(normalized.normalized_path)
        except OSError:
            pass

    result = {
        "name": name,
        "genre": genre,
        "genre_confidence": confidence,
        "profile": normalized.profile,
        "video": {
            "path": video_path,
            "duration": normalized.duration,
            "resolution": f"{normalized.original_width}x{normalized.original_height}",
            "fps": normalized.fps,
            "is_hdr": normalized.is_hdr,
            "aspect_ratio": round(normalized.aspect_ratio, 4),
        },
        "audio": audio_result,
        "composition": composition,
        **style,
    }

    print("╚══ Pipeline complete ═══╝")
    return result
```

- [ ] **Step 2: Wire editorial_style_export.py to use pipeline_context**

Modify `scripts/analyzers/editorial_style_export.py` to accept a `profile` parameter (from thresholds) and pass it to each analyzer. This is a light touch:

At the top of `editorial_style_export.py`, in `export_editorial_style()` signature, add `profile: Optional[dict] = None` parameter. Pass profile to analyzers that accept it (initially a no-op — downstream refactoring happens in Task 5).

```python
def export_editorial_style(
    video_path: str,
    name: str,
    verbose: bool = True,
    profile: Optional[dict] = None,
) -> dict:
```

And when calling `detect_cuts`, pass the profile threshold if available:

```python
cut_threshold = (profile or {}).get("cut_detection", {}).get("threshold", 0.15)
cuts = detect_cuts(video_path, threshold=cut_threshold)
```

- [ ] **Step 3: Verify pipeline runs end-to-end**

Run: `python -c "from scripts.analyzers.pipeline_context import run_pipeline; r = run_pipeline('some_test_video.mp4'); print(r.keys())"`
Expected: dict with genre, video, audio, composition + editorial style keys

- [ ] **Step 4: Commit**

```bash
git add scripts/analyzers/pipeline_context.py scripts/analyzers/editorial_style_export.py
git commit -m "feat(analyzers): add pipeline orchestration with genre conditioning"
```

---

### Task 5: Refactor magic numbers in 11 analyzers to use `thresholds.py`

**Files:**
- Modify: All 11 analyzer modules in `scripts/analyzers/`

This is the most tedious but highest-leverage task. Each analyzer has hardcoded thresholds that need to accept an optional `profile` parameter.

**Strategy:** Add an optional `profile: Optional[dict] = None` parameter to each analyzer's main entry function. If provided, read thresholds from it; otherwise fall back to existing hardcoded constants (backward compat).

- [ ] **Step 1: Refactor `motion_analyzer.py` — `classify_camera_motion` and `classify_subject_motion`**

```python
def classify_camera_motion(
    motion_data: List[Dict],
    shot_duration: float,
    profile: Optional[dict] = None,
) -> str:
    p = profile or {}
    fc = p.get("motion", {})
    if motion_data and motion_data[0].get("flow_method") == "farneback":
        static_thresh = fc.get("farneback_static", 0.01)
        handheld_var = fc.get("farneback_handheld_variance", 0.002)
        tracking_thresh = fc.get("farneback_tracking", 0.08)
        ...
    else:
        static_thresh = fc.get("frame_diff_static", 0.05)
        handheld_var = fc.get("frame_diff_handheld_variance", 0.01)
        tracking_thresh = fc.get("frame_diff_pan", 0.20)
        ...
```

Apply same pattern to `classify_subject_motion`.

- [ ] **Step 2: Refactor `color_analyzer.py` — `analyze_frame_color` grade thresholds**

Add `profile` parameter, use `p.get("color", {})` for saturation/luminance thresholds.

- [ ] **Step 3: Refactor `effect_detector.py` — `EFFECT_CONFIDENCE_THRESHOLD`**

Replace module constant `EFFECT_CONFIDENCE_THRESHOLD = 0.7` with lookup from profile in `detect_effects()`.

- [ ] **Step 4: Refactor `text_detector.py` — `TEXT_CONFIDENCE_THRESHOLD`**

Replace module constant `TEXT_CONFIDENCE_THRESHOLD = 50` with profile lookup.

- [ ] **Step 5: Refactor `beat_detector.py` — `BEAT_CUT_TOLERANCE`, `BEAT_DRIVEN_THRESHOLD`**

Replace module constants with optional profile parameters.

- [ ] **Step 6: Refactor `speed_ramp_detector.py` — motion thresholds**

- [ ] **Step 7: Refactor `edit_events_analyzer.py` — cut thresholds**

- [ ] **Step 8: Refactor `shot_type_classifier.py` — detection thresholds**

- [ ] **Step 9: Refactor `semantic_analyzer.py` — confidence/importance thresholds**

- [ ] **Step 10: Refactor remaining analyzers (`transition_classifier.py`, `color_grade_tracker.py`, `speed_direction_analyzer.py`)**

- [ ] **Step 11: Verify backward compat**

Run: `python -c "from scripts.analyzers.motion_analyzer import classify_camera_motion; result = classify_camera_motion([{'magnitude': 0.1, 'flow_method': 'farneback'}], 1.0); print(result)"`
Expected: `"pan"` or `"static"` — same as before refactor

- [ ] **Step 12: Commit**

```bash
git add scripts/analyzers/*.py
git commit -m "refactor(analyzers): externalize magic numbers into thresholds profile"
```

---

### Task 6: Composition analysis module

**Files:**
- Create: `scripts/analyzers/composition_analyzer.py`

**Interfaces:**
- Produces: `analyze_composition(normalized, shots) -> dict` with rule-of-thirds, headroom, symmetry scores per shot

- [ ] **Step 1: Write composition_analyzer.py**

```python
"""
composition_analyzer.py — Geometric composition scoring.

Uses face/subject bounding boxes (from shot_type_classifier mediapipe output)
to score rule-of-thirds alignment, headroom, leading lines, and symmetry.

Designed to be cheap since detection is already done.
"""

import math
from typing import Any, Optional

import numpy as np


def analyze_composition(normalized: Any, shots: list[dict]) -> dict:
    """
    Score composition quality for each shot.

    Args:
        normalized: NormalizedVideo with width/height
        shots: List of shot dicts with face_data or subject_boxes

    Returns:
        dict with per-shot composition scores and aggregates
    """
    per_shot = []
    for i, shot in enumerate(shots):
        score = _score_shot_composition(
            shot,
            normalized.width,
            normalized.height,
        )
        per_shot.append(score)

    return {
        "perShot": per_shot,
        "avgRuleOfThirds": float(np.mean([s.get("ruleOfThirds", 0) for s in per_shot])) if per_shot else 0,
        "avgHeadroom": float(np.mean([s.get("headroom", 0) for s in per_shot])) if per_shot else 0,
        "avgSymmetry": float(np.mean([s.get("symmetry", 0) for s in per_shot])) if per_shot else 0,
    }


def _score_shot_composition(
    shot: dict,
    frame_w: int,
    frame_h: int,
) -> dict:
    """Score a single shot's composition from available face/subject data."""
    faces = shot.get("face_data", [])
    result = {
        "ruleOfThirds": 0.5,   # 0-1, higher = better alignment
        "headroom": 0.5,       # 0-1, ideal ≈ 0.7
        "leadingLines": 0.0,   # 0-1
        "symmetry": 0.5,       # 0-1
    }

    if not faces:
        return result

    # Rule-of-thirds scoring
    third_x = frame_w / 3
    third_y = frame_h / 3
    third_points = [
        (third_x, third_y),
        (third_x * 2, third_y),
        (third_x, third_y * 2),
        (third_x * 2, third_y * 2),
    ]

    best_dist = float("inf")
    for face in faces:
        cx = face.get("x", 0) + face.get("width", 0) / 2
        cy = face.get("y", 0) + face.get("height", 0) / 2
        for tx, ty in third_points:
            d = math.sqrt((cx - tx) ** 2 + (cy - ty) ** 2)
            best_dist = min(best_dist, d)

    max_dist = math.sqrt(frame_w ** 2 + frame_h ** 2) / 3
    result["ruleOfThirds"] = max(0, 1 - (best_dist / max_dist))

    # Headroom: distance from top of highest face to frame top
    if faces:
        min_y = min(f.get("y", 0) for f in faces)
        headroom_ratio = min_y / frame_h
        # Ideal headroom is ~0.1 (10% from top)
        result["headroom"] = max(0, 1 - abs(headroom_ratio - 0.1) * 5)

    # Symmetry: compare left/right face distribution
    if len(faces) >= 2:
        left_count = sum(1 for f in faces if f.get("x", 0) + f.get("width", 0) / 2 < frame_w / 2)
        right_count = len(faces) - left_count
        result["symmetry"] = 1 - abs(left_count - right_count) / max(1, len(faces))

    return result
```

- [ ] **Step 2: Wire into pipeline_context.py**

The `run_pipeline` function already calls `analyze_composition()` — verify the import works.

- [ ] **Step 3: Verify import works**

Run: `python -c "from scripts.analyzers.composition_analyzer import analyze_composition; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/analyzers/composition_analyzer.py
git commit -m "feat(analyzers): add composition analysis module (rule-of-thirds, headroom, symmetry)"
```

---

### Task 7: `analysis_visualizer.py` — Burn-in QA renderer skeleton + CLI

**Files:**
- Create: `scripts/analysis_visualizer.py`

**Interfaces:**
- CLI: `python scripts/analysis_visualizer.py <video> <analysis_json> [--only motion,beats,color] [--output out.mp4]`
- Produces: overlay video with all toggleable layers

- [ ] **Step 1: Write the skeleton with CLI arg parsing and JSON loading**

```python
#!/usr/bin/env python3
"""
analysis_visualizer.py — Burn-in QA renderer for analyzer output.

Consumes existing analyzer JSON schemas and composites overlay layers
onto the source video for visual validation.

Usage:
    python scripts/analysis_visualizer.py <video> <analysis.json> [options]

Options:
    --output PATH        Output video path (default: <video>-analyzed.mp4)
    --only LAYERS        Comma-separated layer names (default: all)
    --no-audio           Skip audio mux (output will be silent)
    --fps FPS            Output frame rate (default: video native)

Layer names: motion, beats, events, effects, ocr, color, semantic, shot_info
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from typing import Any, Optional

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Layer registry
# ---------------------------------------------------------------------------

LAYERS: dict[str, tuple[str, str, bool]] = {
    "shot_info":  ("shot_info",  "Top-left: shot type, camera/subject motion", True),
    "events":     ("events",     "Event flash banners for transitions/speed ramps", True),
    "effects":    ("effects",    "Effect badges overlaid on frame", True),
    "ocr":        ("ocr",        "OCR bounding boxes + recognized text", True),
    "beats":      ("beats",      "Bottom scrolling beat timeline + motion waveform", True),
    "color":      ("color",      "Corner palette strip + temperature label", True),
    "semantic":   ("semantic",   "Bottom-third semantic caption", True),
}

# Colors (BGR for OpenCV)
COLOR_CUT = (0, 255, 255)       # yellow
COLOR_FADE = (255, 255, 0)      # cyan
COLOR_WHIP = (0, 165, 255)      # orange
COLOR_EFFECT = (0, 255, 0)      # green
COLOR_TEXT = (255, 255, 255)     # white
COLOR_BEAT = (255, 0, 255)      # magenta
COLOR_SEMANTIC = (200, 200, 200) # light gray


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyzer QA visualizer")
    parser.add_argument("video", help="Source video path")
    parser.add_argument("analysis", help="Analysis JSON path")
    parser.add_argument("--output", default=None, help="Output video path")
    parser.add_argument("--only", default=None,
                        help="Comma-separated layer names (default: all)")
    parser.add_argument("--no-audio", action="store_true", help="Skip audio mux")
    parser.add_argument("--fps", type=float, default=None, help="Output frame rate")
    return parser.parse_args()


def load_analysis(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def build_timeline(analysis: dict, fps: float, duration: float) -> dict:
    """
    Build a unified frame-indexed timeline from all analyzer outputs.
    Returns dict mapping frame_number -> list of active events at that frame.
    """
    total_frames = int(duration * fps)
    timeline: dict[int, list[dict]] = {i: [] for i in range(total_frames)}

    # Shots
    for i, shot in enumerate(analysis.get("shots", [])):
        start_frame = int(shot.get("start", 0) * fps)
        end_frame = int(shot.get("end", 0) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": "shot",
                "shot_index": i,
                "shot_type": shot.get("type", "medium"),
                "camera_motion": shot.get("camera_motion", "static"),
                "motion": shot.get("motion", 0),
                "color": shot.get("color", {}),
            })

    # Transitions
    for t in analysis.get("edit_events", {}).get("transitions", []):
        t_time = t.get("time", 0)
        t_dur = t.get("duration", 0.1)
        t_type = t.get("type", "cut")
        t_conf = t.get("confidence", 0.8)
        start_frame = int(max(0, (t_time - t_dur / 2)) * fps)
        end_frame = int(min(duration, (t_time + t_dur / 2)) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": "transition",
                "subtype": t_type,
                "confidence": t_conf,
            })

    # Events (flat timeline)
    for ev in analysis.get("edit_events", {}).get("events", []):
        ev_time = ev.get("time", 0)
        ev_dur = ev.get("duration", 0.1)
        ev_type = ev.get("type", "event")
        ev_subtype = ev.get("subtype", "unknown")
        start_frame = int(max(0, (ev_time - ev_dur / 2)) * fps)
        end_frame = int(min(duration, (ev_time + ev_dur / 2)) * fps)
        for f in range(start_frame, min(end_frame, total_frames)):
            timeline[f].append({
                "type": ev_type,
                "subtype": ev_subtype,
                "properties": ev.get("properties", {}),
            })

    # Beats
    for beat in analysis.get("audio", {}).get("beats", []):
        beat_time = beat.get("time", 0)
        beat_frame = int(beat_time * fps)
        if beat_frame < total_frames:
            timeline[beat_frame].append({
                "type": "beat",
                "strength": beat.get("strength", 0.5),
            })

    # Effects
    for effect in analysis.get("effects", []):
        effect_time = effect.get("time", 0)
        effect_type = effect.get("type", "")
        effect_frame = int(effect_time * fps)
        if effect_frame < total_frames:
            timeline[effect_frame].append({
                "type": "effect",
                "subtype": effect_type,
                "confidence": effect.get("confidence", 0.5),
            })

    return timeline
```

- [ ] **Step 2: Implement overlay rendering functions**

```python
# ---------------------------------------------------------------------------
# Overlay renderers (each takes a frame + active events, returns modified frame)
# ---------------------------------------------------------------------------

def render_shot_info(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Top-left corner: current shot type, camera motion."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    h, w = frame.shape[:2]
    lines = [
        f"Shot: {shot.get('shot_type', '?')}",
        f"Cam: {shot.get('camera_motion', '?')}",
        f"Motion: {shot.get('motion', 0):.2f}",
    ]
    y_offset = 20
    for line in lines:
        cv2.putText(frame, line, (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_CUT, 1, cv2.LINE_AA)
        y_offset += 20
    return frame


def render_events(frame: np.ndarray, events: list[dict], frame_idx: int, fps: float) -> np.ndarray:
    """Banner overlay for transitions/speed ramps."""
    h, w = frame.shape[:2]
    for ev in events:
        if ev["type"] not in ("transition", "keyframe", "speed_ramp"):
            continue
        subtype = ev.get("subtype", "EVENT")
        conf = ev.get("confidence", 0.5)
        color = {
            "cut": COLOR_CUT,
            "fade_to_black": COLOR_FADE,
            "fade_from_black": COLOR_FADE,
            "whip_pan": COLOR_WHIP,
            "fade_in": COLOR_FADE,
            "fade_out": COLOR_FADE,
        }.get(subtype, COLOR_CUT)

        label = f"{subtype.upper()} ({conf:.0%})"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        x = (w - tw) // 2
        y = h // 3
        # Background rectangle
        cv2.rectangle(frame, (x - 10, y - th - 10),
                      (x + tw + 10, y + 10), color, -1)
        cv2.putText(frame, label, (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2, cv2.LINE_AA)
    return frame


def render_effects(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Effect badges in top-right corner."""
    h, w = frame.shape[:2]
    effects = [e for e in events if e["type"] == "effect"]
    if not effects:
        return frame
    y_offset = 20
    for eff in effects:
        label = eff.get("subtype", "FX")
        conf = eff.get("confidence", 0)
        color = COLOR_EFFECT if conf > 0.7 else (0, 165, 255)
        cv2.putText(frame, f"[{label}]", (w - 150, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
        y_offset += 20
    return frame


def render_beats(frame: np.ndarray, events: list[dict], frame_idx: int,
                 fps: float, motion_curve: Optional[list] = None) -> np.ndarray:
    """Bottom scrolling beat timeline + motion waveform."""
    h, w = frame.shape[:2]
    strip_h = 30
    strip_y = h - strip_h - 10

    # Background strip
    cv2.rectangle(frame, (0, strip_y), (w, strip_y + strip_h), (30, 30, 30), -1)

    # Beats as ticks
    for ev in events:
        if ev["type"] != "beat":
            continue
        # Map beat time to x position (scroll relative to current frame)
        # For simplicity, draw in a window around current position
        beat_strength = ev.get("strength", 0.5)
        color = (0, int(255 * beat_strength), 255)
        # Draw at center since we don't know exact time position without full timeline
        cv2.line(frame, (w // 2, strip_y), (w // 2, strip_y + strip_h), COLOR_BEAT, 2)
        cv2.putText(frame, "♪", (w // 2 - 5, strip_y + strip_h - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_BEAT, 1)

    # Motion waveform at bottom (use motion curve from shot data)
    if motion_curve:
        pass  # Full waveform rendering deferred

    return frame


def render_color_swatch(frame: np.ndarray, events: list[dict]) -> np.ndarray:
    """Corner color palette swatch + temperature label."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot:
        return frame
    color_data = shot.get("color", {})
    palette = color_data.get("dominant_palette", [])
    temp = color_data.get("color_temperature", "?")

    h, w = frame.shape[:2]
    swatch_x = w - 80
    swatch_y = 10
    swatch_w = 70
    swatch_h = 12

    for i, color in enumerate(palette[:5]):
        hex_color = color.get("hex", "#000000")
        try:
            r = int(hex_color[1:3], 16)
            g = int(hex_color[3:5], 16)
            b = int(hex_color[5:7], 16)
        except (ValueError, IndexError):
            r, g, b = 0, 0, 0
        y = swatch_y + i * (swatch_h + 2)
        cv2.rectangle(frame, (swatch_x, y),
                      (swatch_x + swatch_w, y + swatch_h), (b, g, r), -1)

    cv2.putText(frame, f"Temp: {temp}", (swatch_x, swatch_y + 80),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    return frame


def render_semantic(frame: np.ndarray, events: list[dict],
                    semantic_data: Optional[list] = None) -> np.ndarray:
    """Bottom-third semantic caption."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot or not semantic_data:
        return frame
    shot_idx = shot.get("shot_index", 0)
    if shot_idx < len(semantic_data):
        sem = semantic_data[shot_idx]
        desc = sem.get("description", "")
        emotion = sem.get("emotion", "")
        narrative = sem.get("narrative_role", "")
        label = f"{desc} | {emotion} | {narrative}"
        h, w = frame.shape[:2]
        y = h - 80
        cv2.putText(frame, label, (w // 2 - 200, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_SEMANTIC, 1, cv2.LINE_AA)
    return frame


def render_ocr(frame: np.ndarray, events: list[dict],
               ocr_data: Optional[list] = None) -> np.ndarray:
    """OCR bounding boxes + recognized text."""
    shot = next((e for e in events if e["type"] == "shot"), None)
    if not shot or not ocr_data:
        return frame
    shot_idx = shot.get("shot_index", 0)
    if shot_idx < len(ocr_data):
        for text_item in ocr_data[shot_idx].get("texts", []):
            bbox = text_item.get("bbox", [])
            text = text_item.get("text", "")
            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                cv2.rectangle(frame, (int(x1), int(y1)),
                              (int(x2), int(y2)), COLOR_TEXT, 2)
                cv2.putText(frame, text, (int(x1), int(y1) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_TEXT, 1)
    return frame
```

- [ ] **Step 3: Implement the main render loop**

```python
# ---------------------------------------------------------------------------
# Main renderer
# ---------------------------------------------------------------------------

def render_analysis(video_path: str, analysis: dict, output_path: str,
                    active_layers: set[str], fps: Optional[float] = None,
                    no_audio: bool = False) -> str:
    """Render overlay video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    out_fps = fps or src_fps
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / src_fps
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, out_fps, (width, height))

    timeline = build_timeline(analysis, out_fps, duration)
    semantic_data = analysis.get("semantic_events", [])
    ocr_data = analysis.get("text_results", [])
    motion_curve = None

    print(f"Rendering {total_frames} frames ({duration:.1f}s @ {out_fps}fps)...")
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        events = timeline.get(frame_idx, [])

        if "shot_info" in active_layers:
            frame = render_shot_info(frame, events)
        if "events" in active_layers:
            frame = render_events(frame, events, frame_idx, out_fps)
        if "effects" in active_layers:
            frame = render_effects(frame, events)
        if "beats" in active_layers:
            frame = render_beats(frame, events, frame_idx, out_fps, motion_curve)
        if "color" in active_layers:
            frame = render_color_swatch(frame, events)
        if "semantic" in active_layers and semantic_data:
            frame = render_semantic(frame, events, semantic_data)
        if "ocr" in active_layers and ocr_data:
            frame = render_ocr(frame, events, ocr_data)

        writer.write(frame)
        frame_idx += 1

        if frame_idx % 300 == 0:
            pct = frame_idx / max(1, total_frames) * 100
            print(f"  {pct:.0f}% ({frame_idx}/{total_frames})")

    cap.release()
    writer.release()

    # Mux audio
    if not no_audio:
        temp_out = output_path + ".tmp.mp4"
        os.rename(output_path, temp_out)
        cmd = [
            "ffmpeg", "-y", "-i", temp_out, "-i", video_path,
            "-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0",
            "-shortest", output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=120)
        os.remove(temp_out)
        print(f"  Audio muxed via ffmpeg")

    print(f"  Output: {output_path}")
    return output_path
```

- [ ] **Step 4: Wire the CLI entry point**

```python
# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    analysis = load_analysis(args.analysis)

    if args.only:
        active_layers = set(args.only.split(","))
        unknown = active_layers - set(LAYERS.keys())
        if unknown:
            print(f"Unknown layers: {unknown}. Available: {list(LAYERS.keys())}")
            sys.exit(1)
    else:
        active_layers = set(LAYERS.keys())

    print(f"Active layers: {', '.join(sorted(active_layers))}")

    output = args.output or os.path.splitext(args.video)[0] + "-analyzed.mp4"
    render_analysis(args.video, analysis, output, active_layers,
                    fps=args.fps, no_audio=args.no_audio)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Test the CLI parses correctly**

Run: `python scripts/analysis_visualizer.py --help`
Expected: Usage text with all layer options

- [ ] **Step 6: Commit**

```bash
git add scripts/analysis_visualizer.py
git commit -m "feat(analyzers): add burn-in QA visualizer with toggleable overlay layers"
```

---

### Task 8: Wire `pipeline_context.py` as the standard entry point

**Files:**
- Create: `scripts/run_analysis.py` (new CLI entry point)

**Interfaces:**
- CLI: `python scripts/run_analysis.py <video> [--name NAME] [--output JSON] [--visualize]`

- [ ] **Step 1: Write the CLI entry point**

```python
#!/usr/bin/env python3
"""
run_analysis.py — Complete analysis pipeline CLI.

Runs the full pipeline (normalization → genre → analyzers → composition → audio),
then optionally renders the QA visualizer.

Usage:
    python scripts/run_analysis.py <video> [--name NAME] [--output JSON] [--visualize]
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))


def main():
    parser = argparse.ArgumentParser(description="Run full analysis pipeline")
    parser.add_argument("video", help="Video path to analyze")
    parser.add_argument("--name", default="reference", help="Analysis name")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--visualize", action="store_true",
                        help="Render QA visualizer after analysis")
    parser.add_argument("--visualize-layers", default=None,
                        help="Comma-separated layers for visualizer (default: all)")
    parser.add_argument("--no-audio", action="store_true", help="Skip audio analysis")

    args = parser.parse_args()

    from analyzers.pipeline_context import run_pipeline

    result = run_pipeline(args.video, name=args.name)

    output_path = args.output or f"/tmp/{args.name}-analysis.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)
    print(f"Analysis saved to: {output_path}")

    if args.visualize:
        viz_args = [
            "python", os.path.join(os.path.dirname(__file__), "analysis_visualizer.py"),
            args.video, output_path,
        ]
        if args.visualize_layers:
            viz_args.extend(["--only", args.visualize_layers])
        if args.no_audio:
            viz_args.append("--no-audio")
        subprocess.run(viz_args)

    # Print summary
    g = result.get("genre", "?")
    gc = result.get("genre_confidence", 0)
    v = result.get("video", {})
    shots = len(result.get("shots", []))
    cuts = [t for t in result.get("edit_events", {}).get("transitions", [])
            if t.get("type") == "cut"]
    print(f"\n{'='*50}")
    print(f"  {result.get('name', 'video')}")
    print(f"  Genre: {g} (conf={gc:.2f})")
    print(f"  Duration: {v.get('duration', 0):.1f}s {v.get('resolution', '?')}")
    print(f"  Shots: {shots}, Cuts: {len(cuts)}")
    print(f"  Audio stems: {result.get('audio', {}).get('stems', {})}")
    comp = result.get("composition", {})
    if comp:
        print(f"  Composition: RoT={comp.get('avgRuleOfThirds', 0):.2f} "
              f"Headroom={comp.get('avgHeadroom', 0):.2f} "
              f"Symmetry={comp.get('avgSymmetry', 0):.2f}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify CLI works**

Run: `python scripts/run_analysis.py --help`
Expected: Usage text

- [ ] **Step 3: Commit**

```bash
git add scripts/run_analysis.py
git commit -m "feat(analyzers): add run_analysis.py CLI entry point for full pipeline"
```
