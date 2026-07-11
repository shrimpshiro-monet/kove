from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from faster_whisper import WhisperModel


_MODEL_CACHE: dict[str, WhisperModel] = {}


@dataclass(frozen=True)
class TranscribeRequest:
    file_path: str
    model_name: str
    device: str
    compute_type: str
    language: str | None = None


def _get_model(model_name: str, device: str, compute_type: str) -> WhisperModel:
    cache_key = f"{model_name}:{device}:{compute_type}"

    if cache_key not in _MODEL_CACHE:
        _MODEL_CACHE[cache_key] = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
        )

    return _MODEL_CACHE[cache_key]


def transcribe_audio(request: TranscribeRequest) -> dict[str, Any]:
    if not request.file_path:
        raise ValueError("file_path is required")

    model_name = request.model_name or os.getenv("WHISPER_MODEL", "small")
    device = request.device or os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = request.compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "int8")

    model = _get_model(model_name, device, compute_type)

    segments, info = model.transcribe(
        request.file_path,
        language=request.language,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
    )

    segment_results: list[dict[str, Any]] = []
    word_results: list[dict[str, Any]] = []

    for segment in segments:
        segment_payload = {
            "id": int(segment.id),
            "start": float(segment.start),
            "end": float(segment.end),
            "text": segment.text.strip(),
        }
        segment_results.append(segment_payload)

        if segment.words:
            for word in segment.words:
                cleaned_word = word.word.strip()

                if cleaned_word:
                    word_results.append(
                        {
                            "word": cleaned_word,
                            "start": float(word.start),
                            "end": float(word.end),
                            "probability": float(word.probability),
                        }
                    )

    return {
        "language": info.language,
        "languageProbability": float(info.language_probability),
        "duration": float(info.duration),
        "segments": segment_results,
        "words": word_results,
        "summary": {
            "segmentCount": len(segment_results),
            "wordCount": len(word_results),
        },
    }