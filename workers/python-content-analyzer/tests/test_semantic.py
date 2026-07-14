from unittest.mock import patch, MagicMock
from src.semantic import SemanticAnalyzer, SemanticUnderstanding


@patch('src.semantic.genai')
def test_analyze_frame_returns_understanding(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"description": "A young man walking in a hallway", "mood": "confident", "setting": "indoor", "action": "walking", "confidence": 0.9}'
    mock_genai.GenerativeModel.return_value = mock_model

    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)

    result = analyzer.analyze_frame(frame)
    assert result.description == "A young man walking in a hallway"
    assert result.mood == "confident"
    assert result.setting == "indoor"
    assert result.action == "walking"
    assert result.confidence == 0.9


@patch('src.semantic.genai')
def test_analyze_frame_calls_gemini_model(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"description": "sunset over ocean", "mood": "calm", "setting": "outdoor", "action": "waves crashing", "confidence": 0.85}'
    mock_genai.GenerativeModel.return_value = mock_model

    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)

    analyzer.analyze_frame(frame)
    mock_genai.GenerativeModel.assert_called_with('gemini-2.5-flash')
    mock_model.generate_content.assert_called_once()


@patch('src.semantic.genai')
def test_analyze_frames_samples_every_nth(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"description": "test", "mood": "test", "setting": "test", "action": "test", "confidence": 0.5}'
    mock_genai.GenerativeModel.return_value = mock_model

    analyzer = SemanticAnalyzer()
    import numpy as np
    frames = [np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(90)]

    results = analyzer.analyze_frames(frames, sample_rate=30)
    assert len(results) == 3  # frames 0, 30, 60


@patch('src.semantic.genai')
def test_semantic_understanding_is_pydantic(mock_genai):
    data = {
        "description": "A person dancing",
        "mood": "energetic",
        "setting": "outdoor",
        "action": "dancing",
        "confidence": 0.92,
    }
    result = SemanticUnderstanding(**data)
    assert result.description == "A person dancing"
    assert result.mood == "energetic"
    assert result.confidence == 0.92
