from __future__ import annotations

import importlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass(frozen=True)
class AudioVFXRequest:
    input_path: str
    output_path: str
    preset: str
    gain_db: float = 0.0


def _gpl_audio_enabled() -> bool:
    return os.getenv("MONET_ENABLE_GPL_AUDIO", "false").lower() == "true"


def _require_pedalboard() -> Any:
    if not _gpl_audio_enabled():
        raise PermissionError(
            "Spotify Pedalboard integration is GPL-gated. Set MONET_ENABLE_GPL_AUDIO=true only if GPL usage is acceptable."
        )

    try:
        return importlib.import_module("pedalboard")
    except Exception as exc:
        raise RuntimeError(
            "Pedalboard is not installed. Install optional GPL dependency with: pip install -r requirements.gpl.txt"
        ) from exc


def render_audio_vfx(request: AudioVFXRequest) -> dict[str, Any]:
    if not request.input_path:
        raise ValueError("input_path is required")

    if not Path(request.input_path).exists():
        raise FileNotFoundError(f"Input audio file does not exist: {request.input_path}")

    if not request.output_path:
        raise ValueError("output_path is required")

    pedalboard = _require_pedalboard()

    Pedalboard = getattr(pedalboard, "Pedalboard")
    Compressor = getattr(pedalboard, "Compressor")
    Gain = getattr(pedalboard, "Gain")
    Limiter = getattr(pedalboard, "Limiter")
    Reverb = getattr(pedalboard, "Reverb")
    HighpassFilter = getattr(pedalboard, "HighpassFilter")
    LowpassFilter = getattr(pedalboard, "LowpassFilter")
    Distortion = getattr(pedalboard, "Distortion")
    PitchShift = getattr(pedalboard, "PitchShift")

    io = importlib.import_module("pedalboard.io")
    AudioFile = getattr(io, "AudioFile")

    preset = request.preset

    if preset == "viral-master":
        board = Pedalboard([
            HighpassFilter(cutoff_frequency_hz=60),
            Compressor(threshold_db=-18, ratio=3.0),
            Gain(gain_db=request.gain_db + 2.0),
            Limiter(threshold_db=-1.0),
        ])
    elif preset == "cinematic-space":
        board = Pedalboard([
            HighpassFilter(cutoff_frequency_hz=45),
            Reverb(room_size=0.32, wet_level=0.18, dry_level=0.82),
            Compressor(threshold_db=-20, ratio=2.2),
            Limiter(threshold_db=-1.2),
        ])
    elif preset == "impact-distort":
        board = Pedalboard([
            HighpassFilter(cutoff_frequency_hz=80),
            Distortion(drive_db=8.0),
            Compressor(threshold_db=-16, ratio=4.0),
            Limiter(threshold_db=-1.0),
        ])
    elif preset == "pitch-hype":
        board = Pedalboard([
            PitchShift(semitones=2.0),
            Compressor(threshold_db=-18, ratio=2.5),
            Gain(gain_db=request.gain_db),
            Limiter(threshold_db=-1.0),
        ])
    else:
        raise ValueError(f"Unsupported audio VFX preset: {preset}")

    output_parent = Path(request.output_path).parent
    output_parent.mkdir(parents=True, exist_ok=True)

    with AudioFile(request.input_path) as source:
        audio = source.read(source.frames)
        sample_rate = source.samplerate

    if not isinstance(audio, np.ndarray) or audio.size == 0:
        raise RuntimeError("Input audio decoded to empty array")

    processed = board(audio, sample_rate)

    with AudioFile(request.output_path, "w", sample_rate, processed.shape[0]) as destination:
        destination.write(processed)

    return {
        "inputPath": request.input_path,
        "outputPath": request.output_path,
        "preset": preset,
        "sampleRate": sample_rate,
        "channels": int(processed.shape[0]),
        "frames": int(processed.shape[1]) if processed.ndim > 1 else int(processed.shape[0]),
        "engine": "spotify-pedalboard",
        "licenseMode": "gpl-enabled",
    }
