from unittest.mock import patch, MagicMock
from src.critic import Critic, Issue, Critique


@patch("src.critic.genai")
def test_critic_returns_issues(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '{"issues": [{"type": "beat_sync", "description": "Shot not aligned to beat", '
        '"shotId": "clip_1", "severity": "warning"}], '
        '"confidence": 0.85, "alternatives": []}'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    critic = Critic()
    edl = {
        "runtime": {"tracks": [{"clips": [{"id": "clip_1", "timing": {"start": 0.3, "duration": 1.0}}]}]},
        "creative": {"moments": []},
        "duration": 15.0,
    }
    content = MagicMock()
    music = MagicMock()

    result = critic.critique(edl, content, music)

    assert len(result.issues) > 0
    assert result.confidence == 0.85
    assert result.issues[0].type == "beat_sync"


@patch("src.critic.genai")
def test_critic_detects_beat_sync_issues(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"issues": [], "confidence": 1.0, "alternatives": []}'
    mock_genai.GenerativeModel.return_value = mock_model

    critic = Critic()
    edl = {
        "runtime": {
            "tracks": [
                {
                    "clips": [
                        {"id": "clip_1", "timing": {"start": 0.3, "duration": 1.0}},  # not aligned
                        {"id": "clip_2", "timing": {"start": 1.5, "duration": 1.0}},  # aligned
                    ]
                }
            ]
        },
        "creative": {"moments": []},
        "duration": 15.0,
    }
    content = MagicMock()
    music = MagicMock()

    result = critic.critique(edl, content, music)

    beat_sync_issues = [i for i in result.issues if i.type == "beat_sync"]
    assert len(beat_sync_issues) == 1
    assert beat_sync_issues[0].shotId == "clip_1"


@patch("src.critic.genai")
def test_critic_detects_duration_mismatch(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = '{"issues": [], "confidence": 1.0, "alternatives": []}'
    mock_genai.GenerativeModel.return_value = mock_model

    critic = Critic()
    edl = {
        "runtime": {
            "tracks": [
                {
                    "clips": [
                        {"id": "clip_1", "timing": {"start": 0.0, "duration": 5.0}},
                        {"id": "clip_2", "timing": {"start": 5.0, "duration": 5.0}},
                    ]
                }
            ]
        },
        "creative": {"moments": []},
        "duration": 15.0,  # mismatch: total clip duration is 10, edl says 15
    }
    content = MagicMock()
    music = MagicMock()

    result = critic.critique(edl, content, music)

    duration_issues = [i for i in result.issues if i.type == "duration_mismatch"]
    assert len(duration_issues) == 1
    assert duration_issues[0].severity == "error"


@patch("src.critic.genai")
def test_critic_confidence_decreases_with_issues(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '{"issues": [{"type": "energy_flow", "description": "Abrupt energy drop"}, '
        '{"type": "beat_sync", "description": "Off-beat cut"}], '
        '"confidence": 0.7, "alternatives": []}'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    critic = Critic()
    edl = {
        "runtime": {"tracks": [{"clips": [{"id": "c1", "timing": {"start": 0.0, "duration": 1.0}}]}]},
        "creative": {"moments": []},
        "duration": 1.0,
    }
    content = MagicMock()
    music = MagicMock()

    result = critic.critique(edl, content, music)

    assert result.confidence < 1.0
    assert len(result.issues) >= 2


@patch("src.critic.genai")
def test_critic_strips_markdown_fences(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = (
        '```json\n{"issues": [], "confidence": 0.95, "alternatives": []}\n```'
    )
    mock_genai.GenerativeModel.return_value = mock_model

    critic = Critic()
    edl = {
        "runtime": {"tracks": [{"clips": [{"id": "c1", "timing": {"start": 0.0, "duration": 1.0}}]}]},
        "creative": {"moments": []},
        "duration": 1.0,
    }
    content = MagicMock()
    music = MagicMock()

    result = critic.critique(edl, content, music)

    assert result.confidence == 0.95
    assert len(result.issues) == 0


@patch("src.critic.genai")
def test_critic_gracefully_handles_gemini_failure(mock_genai):
    mock_model = MagicMock()
    mock_model.generate_content.side_effect = Exception("API error")
    mock_genai.GenerativeModel.return_value = mock_model

    critic = Critic()
    edl = {
        "runtime": {"tracks": [{"clips": [{"id": "c1", "timing": {"start": 0.0, "duration": 1.0}}]}]},
        "creative": {"moments": []},
        "duration": 1.0,
    }
    content = MagicMock()
    music = MagicMock()

    result = critic.critique(edl, content, music)

    assert isinstance(result, Critique)
    assert isinstance(result.issues, list)
