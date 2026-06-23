from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import librosa
import numpy as np


@dataclass(frozen=True)
class AudioAnalysisRequest:
    file_path: str
    sample_rate: int = 22050
    hop_length: int = 512


def _to_float_list(values: np.ndarray) -> list[float]:
    return [float(v) for v in values.tolist()]


def _normalize_array(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values.astype(float)

    min_value = float(np.min(values))
    max_value = float(np.max(values))

    if max_value - min_value <= 1e-9:
        return np.zeros_like(values, dtype=float)

    return (values - min_value) / (max_value - min_value)


def analyze_audio(request: AudioAnalysisRequest) -> dict[str, Any]:
    if not request.file_path or not isinstance(request.file_path, str):
        raise ValueError("file_path is required")

    y, sr = librosa.load(request.file_path, sr=request.sample_rate, mono=True)

    if y.size == 0:
        raise ValueError("Audio file contains no samples")

    duration = float(librosa.get_duration(y=y, sr=sr))

    onset_env = librosa.onset.onset_strength(
        y=y,
        sr=sr,
        hop_length=request.hop_length,
        aggregate=np.median,
    )

    tempo, beat_times = librosa.beat.beat_track(
        y=y,
        sr=sr,
        onset_envelope=onset_env,
        hop_length=request.hop_length,
        units="time",
    )

    onset_frames = librosa.onset.onset_detect(
        y=y,
        sr=sr,
        onset_envelope=onset_env,
        hop_length=request.hop_length,
        units="frames",
        backtrack=False,
    )

    transient_times = librosa.frames_to_time(
        onset_frames,
        sr=sr,
        hop_length=request.hop_length,
    )

    rms = librosa.feature.rms(y=y, hop_length=request.hop_length)[0]
    rms_times = librosa.frames_to_time(
        np.arange(rms.shape[0]),
        sr=sr,
        hop_length=request.hop_length,
    )

    spectral_centroid = librosa.feature.spectral_centroid(
        y=y,
        sr=sr,
        hop_length=request.hop_length,
    )[0]

    normalized_energy = _normalize_array(rms)
    normalized_onsets = _normalize_array(onset_env)

    if isinstance(tempo, np.ndarray):
        tempo_value = float(tempo[0]) if tempo.size > 0 else 0.0
    else:
        tempo_value = float(tempo)

    beats = _to_float_list(np.asarray(beat_times, dtype=float))
    transients = _to_float_list(np.asarray(transient_times, dtype=float))

    energy_curve = [
        {
            "time": float(time),
            "value": float(value),
        }
        for time, value in zip(rms_times.tolist(), normalized_energy.tolist())
    ]

    onset_curve = [
        {
            "time": float(time),
            "value": float(value),
        }
        for time, value in zip(
            librosa.frames_to_time(
                np.arange(normalized_onsets.shape[0]),
                sr=sr,
                hop_length=request.hop_length,
            ).tolist(),
            normalized_onsets.tolist(),
        )
    ]

    centroid_curve = [
        {
            "time": float(time),
            "value": float(value),
        }
        for time, value in zip(
            rms_times.tolist(),
            spectral_centroid[: rms_times.shape[0]].tolist(),
        )
    ]

    return {
        "duration": duration,
        "sampleRate": int(sr),
        "tempo": tempo_value,
        "beats": beats,
        "transients": transients,
        "energyCurve": energy_curve,
        "onsetCurve": onset_curve,
        "spectralCentroidCurve": centroid_curve,
        "summary": {
            "beatCount": len(beats),
            "transientCount": len(transients),
            "averageEnergy": float(np.mean(normalized_energy)) if normalized_energy.size else 0.0,
            "maxEnergy": float(np.max(normalized_energy)) if normalized_energy.size else 0.0,
        },
    }