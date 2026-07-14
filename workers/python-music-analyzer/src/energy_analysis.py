import librosa
import numpy as np


class EnergyAnalyzer:
    def compute(self, y: np.ndarray, sr: int) -> list[tuple[float, float]]:
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)

        if rms.max() > 0:
            rms_normalized = rms / rms.max()
        else:
            rms_normalized = rms

        duration = times[-1]
        energy_curve: list[tuple[float, float]] = []
        for t in np.arange(0, duration, 1.0):
            mask = (times >= t) & (times < t + 1.0)
            if mask.any():
                energy_curve.append((float(t), float(rms_normalized[mask].mean())))

        return energy_curve
