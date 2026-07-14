import numpy as np
import soundfile as sf
from src.analyzer import MusicAnalyzer


def _make_click_track(bpm: float = 120, duration: float = 10.0) -> str:
    sr = 22050
    t = np.linspace(0, duration, int(sr * duration))
    beat_interval = 60.0 / bpm
    signal = np.zeros_like(t)
    for bt in np.arange(0, duration, beat_interval):
        idx = int(bt * sr)
        if idx < len(signal):
            signal[idx] = 1.0
    signal += np.random.randn(len(signal)) * 0.1
    path = f"/tmp/test_audio_{int(bpm)}bpm.wav"
    sf.write(path, signal, sr)
    return path


def test_analyzer_returns_data_for_valid_audio():
    analyzer = MusicAnalyzer()
    path = _make_click_track(140)
    result = analyzer.analyze(path)
    assert result is not None
    assert result.bpm > 0


def test_full_analysis_returns_complete_data():
    analyzer = MusicAnalyzer()
    path = _make_click_track(120)

    result = analyzer.analyze(path)

    assert 60 < result.bpm < 250, f"BPM was {result.bpm}, expected reasonable range"
    assert len(result.beat_result.beats) > 5
    assert len(result.onsets) > 5
    assert len(result.energy_curve) >= 5


def test_sections_detected():
    analyzer = MusicAnalyzer()
    path = _make_click_track(120, duration=15.0)
    result = analyzer.analyze(path)
    assert len(result.sections) > 0
    assert result.sections[0]["start"] >= 0


def test_energy_curve_covers_duration():
    analyzer = MusicAnalyzer()
    path = _make_click_track(120, duration=10.0)
    result = analyzer.analyze(path)
    assert len(result.energy_curve) >= 5
    last_time = result.energy_curve[-1][0]
    assert last_time >= 8.0


def test_frequency_profile_has_all_bands():
    analyzer = MusicAnalyzer()
    path = _make_click_track(120)
    result = analyzer.analyze(path)
    assert "low" in result.frequency_profile
    assert "mid" in result.frequency_profile
    assert "high" in result.frequency_profile
    total = sum(result.frequency_profile.values())
    assert abs(total - 1.0) < 0.01
