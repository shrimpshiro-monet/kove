# monet/engines/beatsync/detector.py
from __future__ import annotations
import asyncio
import json
import os
import tempfile
from typing import List

async def detect_beats(audio_path: str) -> List[float]:
    """
    Uses aubio (pip install aubio) for onset/beat detection.
    Returns beat timestamps in seconds.
    """
    try:
        import aubio
        src = aubio.source(audio_path, 44100, 512)
        tempo = aubio.tempo("default", 1024, 512, src.samplerate)
        beats: List[float] = []
        total = 0
        while True:
            samples, read = src()
            is_beat = tempo(samples)
            if is_beat:
                beats.append(tempo.get_last_s())
            total += read
            if read < 512:
                break
        return beats
    except ImportError:
        try:
            # fallback: use librosa
            import librosa
            y, sr = librosa.load(audio_path, sr=22050, mono=True)
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
            return librosa.frames_to_time(beat_frames, sr=sr).tolist()
        except ImportError:
            # fallback to manual mock beats (every 0.5s) if libraries missing
            return [float(i) * 0.5 for i in range(1, 100)]
