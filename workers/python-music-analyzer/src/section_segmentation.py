import librosa
import numpy as np


class SectionSegmenter:
    def segment(self, y: np.ndarray, sr: int) -> list[dict]:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        sim = librosa.segment.recurrence_matrix(mfcc, mode="affinity")

        bounds = librosa.segment.agglomerative(sim, k=8)
        bound_times = librosa.frames_to_time(bounds, sr=sr).tolist()

        sections = []
        for i in range(len(bound_times) - 1):
            sections.append({
                "name": f"section_{i}",
                "start": bound_times[i],
                "end": bound_times[i + 1],
                "energy": 0.5,
            })

        return sections
