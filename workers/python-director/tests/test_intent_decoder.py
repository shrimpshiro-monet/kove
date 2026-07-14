from unittest.mock import patch, MagicMock
from src.intent_decoder import IntentDecoder


@patch("src.intent_decoder.genai")
def test_decode_intent_returns_structured(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '{"goal": "High-energy TikTok edit", "genre": "tiktok_edit", '
        '"platform": "tiktok", "style": {"aggression": 0.8, "energy": 0.9}, '
        '"constraints": ["keepSubjectVisible"]}'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    decoder = IntentDecoder()
    result = decoder.decode("Make a hype TikTok edit of my friend walking")

    assert result.goal == "High-energy TikTok edit"
    assert result.genre == "tiktok_edit"
    assert result.platform == "tiktok"
    assert result.style.aggression == 0.8
    assert result.style.energy == 0.9
    assert result.constraints == ["keepSubjectVisible"]


@patch("src.intent_decoder.genai")
def test_decode_intent_extracts_mood(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '{"goal": "Cinematic travel montage", "genre": "cinematic", '
        '"platform": "youtube", "style": {"cinematic": 0.9}, '
        '"constraints": [], "mood": "adventurous"}'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    decoder = IntentDecoder()
    result = decoder.decode("Create a cinematic travel video")

    assert result.mood == "adventurous"
    assert result.genre == "cinematic"


@patch("src.intent_decoder.genai")
def test_decode_intent_strips_markdown_fences(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '```json\n{"goal": "Test", "genre": "tiktok_edit", '
        '"platform": "tiktok", "style": {}, "constraints": []}\n```'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    decoder = IntentDecoder()
    result = decoder.decode("test prompt")

    assert result.goal == "Test"


@patch("src.intent_decoder.genai")
def test_decode_intent_applies_style_defaults(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '{"goal": "Test", "genre": "tiktok_edit", '
        '"platform": "tiktok", "style": {"aggression": 0.7}, "constraints": []}'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    decoder = IntentDecoder()
    result = decoder.decode("test prompt")

    assert result.style.aggression == 0.7
    assert result.style.cinematic == 0.5
    assert result.style.chaos == 0.3
    assert result.style.luxury == 0.5
    assert result.style.energy == 0.5
