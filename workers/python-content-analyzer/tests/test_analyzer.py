from src.analyzer import ContentAnalyzer


def test_stub_analyzer_returns_hardcoded_data():
    analyzer = ContentAnalyzer()
    result = analyzer.analyze("fake_video_path.mp4")
    assert result is not None
    assert len(result.faces) >= 0
    assert isinstance(result.semantic, str)


def test_stub_analyzer_returns_valid_content_analysis():
    analyzer = ContentAnalyzer()
    result = analyzer.analyze("anything.mp4")
    assert result.semantic == "Hardcoded stub analysis"
    assert isinstance(result.faces, list)
    assert isinstance(result.objects, list)
    assert isinstance(result.brightness, list)
