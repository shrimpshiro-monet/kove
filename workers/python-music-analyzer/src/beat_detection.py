import numpy as np
import librosa
from .models import BeatResult


class BeatDetector:
    def detect(self, y: np.ndarray, sr: int) -> BeatResult:
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)

        # Handle tempo being an array (librosa 0.10+)
        if hasattr(tempo, '__len__'):
            bpm = float(tempo[0])
        else:
            bpm = float(tempo)

        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        downbeats = beat_times[::4]

        return BeatResult(
            beats=beat_times,
            downbeats=downbeats,
            bpm=bpm,
        )
