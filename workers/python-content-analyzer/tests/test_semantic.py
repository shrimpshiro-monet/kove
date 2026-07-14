from unittest.mock import patch, MagicMock
from src.semantic import SemanticAnalyzer, SemanticUnderstanding


def _mock_response(text):
    resp = MagicMock()
    resp.choices = [MagicMock(message=MagicMock(content=text))]
    return resp


@patch('src.semantic.OpenAI')
def test_analyze_frame_returns_understanding(mock_openai_cls):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = _mock_response(
        '{"description": "A young man walking in a hallway", "mood": "confident", "setting": "indoor", "action": "walking", "confidence": 0.9}'
    )
    mock_openai_cls.return_value = mock_client

    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)

    result = analyzer.analyze_frame(frame)
    assert result.description == "A young man walking in a hallway"
    assert result.mood == "confident"
    assert result.setting == "indoor"
    assert result.action == "walking"
    assert result.confidence == 0.9


@patch('src.semantic.OpenAI')
def test_analyze_frame_calls_groq_model(mock_openai_cls):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = _mock_response(
        '{"description": "sunset over ocean", "mood": "calm", "setting": "outdoor", "action": "waves crashing", "confidence": 0.85}'
    )
    mock_openai_cls.return_value = mock_client

    analyzer = SemanticAnalyzer()
    import numpy as np
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)

    analyzer.analyze_frame(frame)
    mock_openai_cls.assert_called_with(
        api_key=mock_openai_cls.call_args.kwargs.get('api_key'),
        base_url='https://api.groq.com/openai/v1',
    )
    mock_client.chat.completions.create.assert_called_once()


@patch('src.semantic.OpenAI')
def test_analyze_frames_samples_every_nth(mock_openai_cls):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = _mock_response(
        '{"description": "test", "mood": "test", "setting": "test", "action": "test", "confidence": 0.5}'
    )
    mock_openai_cls.return_value = mock_client

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
