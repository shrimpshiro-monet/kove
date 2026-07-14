from unittest.mock import patch, MagicMock
from src.semantic import SemanticAnalyzer, SemanticUnderstanding


@patch('src.semantic.LLMClient')
def test_analyze_frame_returns_understanding(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '{"description": "A young man walking in a hallway", "mood": "confident", '
        '"setting": "indoor", "action": "walking", "confidence": 0.9}'
    )
    mock_llm_cls.return_value = mock_client

    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)

    result = analyzer.analyze_frame(frame)
    assert result.description == "A young man walking in a hallway"
    assert result.mood == "confident"
    assert result.setting == "indoor"
    assert result.action == "walking"
    assert result.confidence == 0.9


@patch('src.semantic.LLMClient')
def test_analyze_frame_calls_groq_model(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '{"description": "sunset over ocean", "mood": "calm", '
        '"setting": "outdoor", "action": "waves crashing", "confidence": 0.85}'
    )
    mock_llm_cls.return_value = mock_client

    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)

    analyzer.analyze_frame(frame)
    mock_client.generate.assert_called_once()


@patch('src.semantic.LLMClient')
def test_analyze_frames_samples_every_nth(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '{"description": "test", "mood": "test", "setting": "test", '
        '"action": "test", "confidence": 0.5}'
    )
    mock_llm_cls.return_value = mock_client

    analyzer = SemanticAnalyzer()
    import numpy as np
    frames = [np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(90)]

    results = analyzer.analyze_frames(frames, sample_rate=30)
    assert len(results) == 3  # frames 0, 30, 60


def test_semantic_understanding_is_pydantic():
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
