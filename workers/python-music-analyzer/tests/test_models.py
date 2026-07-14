from src.models import MusicAnalysis, BeatResult

def test_music_analysis_creation():
    result = MusicAnalysis(
        bpm=140.0,
        beat_result=BeatResult(beats=[0.0, 0.429, 0.857], downbeats=[0.0, 1.714], bpm=140.0),
        onsets=[0.0, 0.42, 0.86],
        sections=[{"name": "intro", "start": 0, "end": 3, "energy": 0.3}],
        energy_curve=[(0, 0.2), (3, 0.5)],
        vocal_regions=[(2.0, 5.0)],
        frequency_profile={"low": 0.6, "mid": 0.4, "high": 0.3},
    )
    assert result.bpm == 140.0
    assert result.beat_result.bpm == 140.0
