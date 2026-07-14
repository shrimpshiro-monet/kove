from unittest.mock import patch, MagicMock
from src.analyzer import ContentAnalyzer
from src.semantic import SemanticUnderstanding


@patch('src.semantic.genai')
def test_analyzer_returns_content_analysis(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"description": "A hallway scene", "mood": "confident", "setting": "indoor", "action": "walking", "confidence": 0.9}'
    mock_genai.GenerativeModel.return_value = mock_model

    analyzer = ContentAnalyzer()
    result = analyzer.analyze("fake_video_path.mp4")
    assert result is not None
    assert isinstance(result.semantic, SemanticUnderstanding)
    assert result.semantic.description == "A hallway scene"
    assert result.semantic.confidence == 0.9


@patch('src.semantic.genai')
def test_analyzer_returns_valid_content_analysis(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"description": "test", "mood": "calm", "setting": "outdoor", "action": "standing", "confidence": 0.7}'
    mock_genai.GenerativeModel.return_value = mock_model

    analyzer = ContentAnalyzer()
    result = analyzer.analyze("anything.mp4")
    assert isinstance(result.semantic, SemanticUnderstanding)
    assert isinstance(result.faces, list)
    assert isinstance(result.objects, list)
    assert isinstance(result.brightness, list)
