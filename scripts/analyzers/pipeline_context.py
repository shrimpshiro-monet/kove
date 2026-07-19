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
        return {
            "duration": 0, "width": 0, "height": 0, "fps": 30.0, "has_audio": False,
            "color_primaries": "unknown", "color_transfer": "unknown", "is_hdr": False,
        }

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
    """Fallback VAD returning silence (no voiceover detected)."""
    return {"speech_ratio": 0.0, "silence_pct": 1.0, "avg_speech_segment_duration": 0.0}
