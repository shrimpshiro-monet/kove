from .models import MusicAnalysis, BeatResult


class MusicAnalyzer:
    def analyze(self, audio_path: str) -> MusicAnalysis:
        # STUB: returns hardcoded analysis
        return MusicAnalysis(
            bpm=140.0,
            beat_result=BeatResult(beats=[0.0, 0.429, 0.857], downbeats=[0.0, 1.714], bpm=140.0),
            onsets=[0.0, 0.42, 0.86],
            sections=[{"name": "intro", "start": 0, "end": 3, "energy": 0.3}],
            energy_curve=[(0, 0.2), (3, 0.5)],
            vocal_regions=[],
            frequency_profile={"low": 0.5, "mid": 0.5, "high": 0.5},
        )
