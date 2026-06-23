# monet/styler/mood.py
from __future__ import annotations
from typing import Dict
from monet.engines.freecut.executor.types import CaptionStyle

async def analyze_mood(audio_path: str) -> Dict[str, float]:
    """Returns {energy, brightness, valence} in [0,1]."""
    try:
        import librosa
        import numpy as np
        y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=30)
        rms = float(np.mean(librosa.feature.rms(y=y)))
        spec_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        return {
            "energy": min(1.0, rms * 12),
            "brightness": min(1.0, spec_centroid / 4500),
            "valence": min(1.0, float(tempo) / 180),
        }
    except Exception:
        return {"energy": 0.5, "brightness": 0.5, "valence": 0.5}


def style_from_mood(mood: Dict[str, float]) -> CaptionStyle:
    """Map mood vector → caption style."""
    energy = mood["energy"]
    bright = mood["brightness"]
    if energy > 0.7:
        color = "#ffd700" if bright > 0.5 else "#ff3b3b"
        font = "Impact"
        size = "9vw"
        bg = "rgba(0,0,0,0.4)"
    elif energy > 0.4:
        color = "#ffffff"
        font = "Arial"
        size = "7vw"
        bg = "rgba(0,0,0,0.3)"
    else:
        color = "#e0e0e0"
        font = "Arial"
        size = "6vw"
        bg = None
    return CaptionStyle(
        color=color, fontSize=size, fontFamily=font, fontWeight="bold",
        textAlign="center", verticalAlign="middle", backgroundColor=bg,
    )
