from .models import MusicAnalysis, BeatResult
from .beat_detection import BeatDetector
from .onset_detection import OnsetDetector
from .section_segmentation import SectionSegmenter
from .energy_analysis import EnergyAnalyzer
import librosa
import numpy as np


class MusicAnalyzer:
    def __init__(self) -> None:
        self.beat_detector = BeatDetector()
        self.onset_detector = OnsetDetector()
        self.section_segmenter = SectionSegmenter()
        self.energy_analyzer = EnergyAnalyzer()

    def analyze(self, audio_path: str) -> MusicAnalysis:
        y, sr = librosa.load(audio_path, sr=22050)

        beat_result = self.beat_detector.detect(y, sr)
        onsets = self.onset_detector.detect(y, sr)
        sections = self.section_segmenter.segment(y, sr)
        energy_curve = self.energy_analyzer.compute(y, sr)
        vocal_regions = self._detect_vocals(y, sr)
        freq_profile = self._analyze_frequency(y, sr)

        return MusicAnalysis(
            bpm=beat_result.bpm,
            beat_result=beat_result,
            onsets=onsets,
            sections=sections,
            energy_curve=energy_curve,
            vocal_regions=vocal_regions,
            frequency_profile=freq_profile,
        )

    def _detect_vocals(self, y: np.ndarray, sr: int) -> list[tuple[float, float]]:
        S = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        vocal_mask = (freqs >= 300) & (freqs <= 3000)
        vocal_energy = S[vocal_mask].mean(axis=0)
        threshold = vocal_energy.mean() + vocal_energy.std()

        frames = np.where(vocal_energy > threshold)[0]
        if len(frames) == 0:
            return []

        regions: list[tuple[float, float]] = []
        start = frames[0]
        for i in range(1, len(frames)):
            if frames[i] - frames[i - 1] > 10:
                regions.append((
                    float(librosa.frames_to_time(start, sr=sr)),
                    float(librosa.frames_to_time(frames[i - 1], sr=sr)),
                ))
                start = frames[i]
        regions.append((
            float(librosa.frames_to_time(start, sr=sr)),
            float(librosa.frames_to_time(frames[-1], sr=sr)),
        ))
        return regions

    def _analyze_frequency(self, y: np.ndarray, sr: int) -> dict[str, float]:
        S = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)

        low = S[freqs < 300].mean()
        mid = S[(freqs >= 300) & (freqs <= 3000)].mean()
        high = S[freqs > 3000].mean()

        total = low + mid + high
        return {
            "low": low / total if total > 0 else 0,
            "mid": mid / total if total > 0 else 0,
            "high": high / total if total > 0 else 0,
        }
