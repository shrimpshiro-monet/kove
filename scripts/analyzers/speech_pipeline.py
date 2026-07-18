"""Kove speech-driven director: Components 1, 2, 3.

Component 1 — Word-level transcription (faster-whisper)
Component 2 — Voice Activity Detection + dead-air removal (Silero VAD)
Component 3 — Emphasis detection (loudness z-score + LLM tagging)

All components return plain dicts consumable by edit_director.py.
"""

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

# Prevent OpenMP crash from multiple libiomp5.dylib (torch + librosa clash)
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Component 1: Word-level transcription
# ═══════════════════════════════════════════════════════════════

def transcribe(
    audio_path: str,
    model_size: str = "small",
    device: str = "cpu",
    compute_type: str = "int8",
) -> dict:
    """Transcribe audio with per-word timestamps using faster-whisper.

    Args:
        audio_path: Path to audio file (any format ffmpeg can decode).
        model_size: tiny|base|small|medium|large-v3.
        device: cpu|cuda.
        compute_type: int8|float16|float32.

    Returns:
        {
            "words": [{"word": str, "start": float, "end": float, "confidence": float}],
            "sentences": [{"text": str, "start": float, "end": float}],
            "language": str,
            "duration": float,
        }
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.warning("faster-whisper not installed; using dummy transcription")
        return _dummy_transcription(audio_path)

    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, info = model.transcribe(audio_path, word_timestamps=True)

    words = []
    sentences = []
    for seg in segments:
        sentence_words = []
        if seg.words:
            for w in seg.words:
                words.append({
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "confidence": round(w.probability, 3) if hasattr(w, "probability") else 1.0,
                })
                sentence_words.append(w.word.strip())
        if sentence_words:
            sentences.append({
                "text": " ".join(sentence_words),
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
            })

    return {
        "words": words,
        "sentences": sentences,
        "language": info.language if hasattr(info, "language") else "en",
        "duration": info.duration if hasattr(info, "duration") else 0.0,
    }


def _dummy_transcription(audio_path: str) -> dict:
    """Fallback when faster-whisper is unavailable. Returns silence."""
    duration = _get_audio_duration(audio_path)
    return {
        "words": [],
        "sentences": [],
        "language": "en",
        "duration": duration,
    }


def _get_audio_duration(path: str) -> float:
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", path,
        ], capture_output=True, text=True, timeout=15)
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 0.0


def extract_audio_from_video(video_path: str, temp_dir: Optional[str] = None) -> str:
    """Extract audio track from video for transcription."""
    if temp_dir is None:
        temp_dir = tempfile.gettempdir()
    out = os.path.join(temp_dir, f"speech_audio_{Path(video_path).stem}.wav")
    if os.path.exists(out):
        return out
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        out,
    ], capture_output=True, timeout=120)
    return out


# ═══════════════════════════════════════════════════════════════
# Component 2: Voice Activity Detection + dead-air removal
# ═══════════════════════════════════════════════════════════════

def detect_speech_regions(audio_path: str,
                          transcript_fallback: Optional[list[dict]] = None) -> list[dict]:
    """Detect speech intervals using Silero VAD.

    Falls back to Whisper word timestamps when Silero VAD model is
    unavailable (not cached, first-run download failure, etc).

    Returns:
        [{"start": float, "end": float, "duration": float}, ...]
    """
    try:
        import torch
        torch.set_num_threads(1)
        model, utils = torch.hub.load(
            "snakers4/silero-vad", "silero_vad", force_reload=False, trust_repo=True,
        )
        (get_speech_timestamps, _, read_audio, _, _) = utils
        wav = read_audio(audio_path)
        speech_ts = get_speech_timestamps(wav, model, return_seconds=True)
        return [
            {"start": round(s["start"], 3), "end": round(s["end"], 3),
             "duration": round(s["end"] - s["start"], 3)}
            for s in speech_ts
        ]
    except Exception as e:
        logger.warning(f"Silero VAD failed: {e}, falling back to whisper timestamps")
        # Fallback: derive speech regions from whisper word timestamps
        if transcript_fallback:
            regions = sorted(
                [{"start": w["start"], "end": w["end"],
                  "duration": round(w["end"] - w["start"], 3)}
                 for w in transcript_fallback],
                key=lambda x: x["start"],
            )
            # Merge overlapping/adjacent (within 100ms)
            merged = []
            for r in regions:
                if merged and r["start"] <= merged[-1]["end"] + 0.1:
                    merged[-1]["end"] = max(merged[-1]["end"], r["end"])
                    merged[-1]["duration"] = round(
                        merged[-1]["end"] - merged[-1]["start"], 3)
                else:
                    merged.append(r)
            if merged:
                logger.info(f"Whisper fallback: {len(merged)} speech regions from "
                            f"{len(transcript_fallback)} words")
            return merged
        return []


def compute_speech_coverage(speech_regions: list[dict], total_duration: float) -> float:
    """Fraction of total duration covered by speech."""
    if total_duration <= 0:
        return 0.0
    speech_time = sum(s["duration"] for s in speech_regions)
    return min(1.0, speech_time / total_duration)


def find_dead_air(speech_regions: list[dict], total_duration: float, max_gap: float = 0.4) -> list[dict]:
    """Find gaps between speech regions longer than max_gap.

    Returns:
        [{"start": float, "end": float, "duration": float}, ...]
    """
    if not speech_regions:
        return []

    gaps = []
    prev_end = 0.0
    for s in speech_regions:
        gap = s["start"] - prev_end
        if gap > max_gap:
            gaps.append({
                "start": round(prev_end, 3),
                "end": round(s["start"], 3),
                "duration": round(gap, 3),
            })
        prev_end = s["end"]

    # Trailing silence
    trailing = total_duration - prev_end
    if trailing > max_gap:
        gaps.append({
            "start": round(prev_end, 3),
            "end": round(total_duration, 3),
            "duration": round(trailing, 3),
        })

    return gaps


# ═══════════════════════════════════════════════════════════════
# Component 3: Emphasis detection
# ═══════════════════════════════════════════════════════════════

def detect_emphasis(audio_path: str, transcript: dict) -> list[dict]:
    """Detect emphasized words using loudness z-score spikes.

    Returns:
        [{"word": str, "start": float, "end": float, "score": float}, ...]
    """
    words = transcript.get("words", [])
    if not words:
        return []

    try:
        import librosa
        y, sr = librosa.load(audio_path, sr=22050, mono=True)
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        if rms.std() == 0:
            return []

        z = (rms - rms.mean()) / rms.std()
        times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)

        emphasized = []
        for w in words:
            mask = (times >= w["start"]) & (times <= w["end"])
            if mask.any():
                peak_z = z[mask].max()
                if peak_z > 1.5:
                    emphasized.append({
                        "word": w["word"],
                        "start": w["start"],
                        "end": w["end"],
                        "score": round(float(peak_z), 2),
                    })
        return emphasized
    except Exception as e:
        logger.warning(f"Emphasis detection failed: {e}")
        return []


# ═══════════════════════════════════════════════════════════════
# Composite: Full speech analysis
# ═══════════════════════════════════════════════════════════════

def analyze_speech(
    video_path: str,
    audio_path: Optional[str] = None,
    transcript_model: str = "small",
) -> dict:
    """Run full speech analysis pipeline: transcribe → VAD → emphasize.

    Returns a dict consumable by edit_director.py as speech_grid:
        {
            "words": [...],
            "sentences": [...],
            "language": str,
            "speech_regions": [{"start", "end", "duration"}],
            "speech_coverage": float,
            "dead_air": [{"start", "end", "duration"}],
            "emphasis": [{"word", "start", "end", "score"}],
        }
    """
    if audio_path is None or not os.path.exists(audio_path):
        audio_path = extract_audio_from_video(video_path)

    transcript = transcribe(audio_path, model_size=transcript_model)
    total_dur = transcript["duration"] if transcript["duration"] > 0 else _get_audio_duration(audio_path)
    speech_regions = detect_speech_regions(audio_path, transcript_fallback=transcript.get("words"))
    speech_coverage = compute_speech_coverage(speech_regions, total_dur)
    dead_air = find_dead_air(speech_regions, total_dur)
    emphasis = detect_emphasis(audio_path, transcript)

    return {
        "words": transcript["words"],
        "sentences": transcript["sentences"],
        "language": transcript["language"],
        "speech_regions": speech_regions,
        "speech_coverage": speech_coverage,
        "dead_air": dead_air,
        "emphasis": emphasis,
    }
