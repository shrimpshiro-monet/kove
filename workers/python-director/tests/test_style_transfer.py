from unittest.mock import patch, MagicMock
from src.style_transfer import StyleTransfer, StyleDNA, CutPattern, ColorSignature


@patch("src.style_transfer.LLMClient")
def test_extract_style_returns_dna(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '{"cutPattern": {"avgShotDuration": 1.5, "cutRate": "rapid"}, '
        '"effectVocabulary": ["glow", "shake", "rgb_split"], '
        '"transitionStyle": "stylized", '
        '"colorSignature": {"warmth": 0.7, "contrast": 0.8, "saturation": 0.6}}'
    )
    mock_llm_cls.return_value = mock_client

    transfer = StyleTransfer()
    result = transfer.extract_style("/tmp/reference.mp4")

    assert isinstance(result, StyleDNA)
    assert result.cutPattern.avgShotDuration == 1.5
    assert result.cutPattern.cutRate == "rapid"
    assert "glow" in result.effectVocabulary
    assert "shake" in result.effectVocabulary
    assert "rgb_split" in result.effectVocabulary
    assert result.transitionStyle == "stylized"
    assert result.colorSignature.warmth == 0.7
    assert result.colorSignature.contrast == 0.8
    assert result.colorSignature.saturation == 0.6


@patch("src.style_transfer.LLMClient")
def test_extract_style_strips_markdown_fences(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '```json\n{"cutPattern": {"avgShotDuration": 2.0, "cutRate": "moderate"}, '
        '"effectVocabulary": ["blur"], '
        '"transitionStyle": "smooth", '
        '"colorSignature": {"warmth": 0.5, "contrast": 0.5, "saturation": 0.5}}\n```'
    )
    mock_llm_cls.return_value = mock_client

    transfer = StyleTransfer()
    result = transfer.extract_style("/tmp/reference.mp4")

    assert result.cutPattern.avgShotDuration == 2.0
    assert result.cutPattern.cutRate == "moderate"
    assert result.transitionStyle == "smooth"


@patch("src.style_transfer.LLMClient")
def test_extract_style_handles_missing_optional_fields(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '{"cutPattern": {"avgShotDuration": 1.0, "cutRate": "slow"}, '
        '"effectVocabulary": [], '
        '"transitionStyle": "hard_cuts", '
        '"colorSignature": {"warmth": 0.3, "contrast": 0.9}}'
    )
    mock_llm_cls.return_value = mock_client

    transfer = StyleTransfer()
    result = transfer.extract_style("/tmp/reference.mp4")

    assert result.cutPattern.avgShotDuration == 1.0
    assert result.cutPattern.cutRate == "slow"
    assert result.effectVocabulary == []
    assert result.colorSignature.saturation == 0.5  # default
    assert result.pacingProfile is None


@patch("src.style_transfer.LLMClient")
def test_extract_style_includes_pacing_profile(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = (
        '{"cutPattern": {"avgShotDuration": 1.2, "cutRate": "rapid"}, '
        '"effectVocabulary": ["glitch", "shake"], '
        '"transitionStyle": "mixed", '
        '"colorSignature": {"warmth": 0.8, "contrast": 0.7, "saturation": 0.9}, '
        '"pacingProfile": "building"}'
    )
    mock_llm_cls.return_value = mock_client

    transfer = StyleTransfer()
    result = transfer.extract_style("/tmp/reference.mp4")

    assert result.pacingProfile == "building"


@patch("src.style_transfer.LLMClient")
def test_extract_style_gracefully_handles_llm_failure(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.side_effect = Exception("API error")
    mock_llm_cls.return_value = mock_client

    transfer = StyleTransfer()
    result = transfer.extract_style("/tmp/reference.mp4")

    assert isinstance(result, StyleDNA)
    assert result.cutPattern.avgShotDuration == 2.0  # default from _DEFAULT_STYLE
    assert result.cutPattern.cutRate == "moderate"
    assert result.effectVocabulary == ["vignette", "color_grade"]
    assert result.transitionStyle == "crossfade"
    assert result.colorSignature.warmth == 0.5
    assert result.colorSignature.contrast == 0.5
    assert result.pacingProfile == "steady"
