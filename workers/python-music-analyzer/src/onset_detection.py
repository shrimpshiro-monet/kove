import librosa
import numpy as np


class OnsetDetector:
    def detect(self, y: np.ndarray, sr: int) -> list[float]:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(
            y=y, sr=sr, onset_envelope=onset_env, backtrack=True
        )
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        return onset_times.tolist()
