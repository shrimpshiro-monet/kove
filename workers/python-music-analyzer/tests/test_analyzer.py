from src.analyzer import MusicAnalyzer

def test_stub_analyzer_returns_hardcoded_data():
    analyzer = MusicAnalyzer()
    result = analyzer.analyze("fake_audio.wav")
    assert result is not None
    assert result.bpm > 0
