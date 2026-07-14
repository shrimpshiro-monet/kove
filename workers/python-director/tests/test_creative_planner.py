from unittest.mock import patch, MagicMock
from src.creative_planner import CreativePlanner
from src.intent_decoder import Intent, IntentStyle


MOCK_STORY_ARC_RESPONSE = (
    '{"storyArc": [{"phase": "setup", "start": 0, "end": 3, "emotion": "calm"}, '
    '{"phase": "climax", "start": 3, "end": 6, "emotion": "intense"}]}'
)

MOCK_MOMENTS_RESPONSE = (
    '{"moments": [{"id": "m1", "start": 0, "end": 3, "purpose": "establish", '
    '"emotion": "calm", "energy": 0.2, "shots": ["wide"], "recipes": [], '
    '"aiPrompt": "Set the scene", "constraints": []}]}'
)


def _make_intent() -> Intent:
    return Intent(
        goal="High-energy TikTok edit",
        genre="tiktok_edit",
        platform="tiktok",
        style=IntentStyle(aggression=0.8, energy=0.9),
        constraints=["keepSubjectVisible"],
    )


def _make_content() -> dict:
    return {
        "faces": [],
        "objects": [],
        "depth": [],
        "motion": [],
        "scenes": [],
        "brightness": [],
        "composition": {},
        "color_palette": [],
        "semantic": {"description": "test", "mood": "calm",
                     "setting": "indoor", "action": "walking", "confidence": 0.9},
    }


def _make_music() -> dict:
    return {
        "bpm": 120,
        "beat_result": {"beats": [], "downbeats": [], "bpm": 120},
        "onsets": [],
        "sections": [],
        "energy_curve": [],
        "vocal_regions": [],
        "frequency_profile": {},
    }


@patch("src.creative_planner.LLMClient")
def test_plan_returns_creative_plan(mock_llm_cls):
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MOCK_STORY_ARC_RESPONSE
        return MOCK_MOMENTS_RESPONSE

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.storyArc) == 2
    assert result.storyArc[0].phase == "setup"
    assert len(result.moments) == 1
    assert result.moments[0].id == "m1"
    assert len(result.emotionArc.timeline) == 2


@patch("src.creative_planner.LLMClient")
def test_story_arc_phases_have_required_fields(mock_llm_cls):
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MOCK_STORY_ARC_RESPONSE
        return MOCK_MOMENTS_RESPONSE

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    for phase in result.storyArc:
        assert hasattr(phase, "phase")
        assert hasattr(phase, "start")
        assert hasattr(phase, "end")
        assert hasattr(phase, "emotion")


@patch("src.creative_planner.LLMClient")
def test_moments_have_required_fields(mock_llm_cls):
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MOCK_STORY_ARC_RESPONSE
        return MOCK_MOMENTS_RESPONSE

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    for moment in result.moments:
        assert hasattr(moment, "id")
        assert hasattr(moment, "start")
        assert hasattr(moment, "end")
        assert hasattr(moment, "purpose")
        assert hasattr(moment, "emotion")
        assert hasattr(moment, "energy")
        assert hasattr(moment, "shots")
        assert hasattr(moment, "aiPrompt")


@patch("src.creative_planner.LLMClient")
def test_emotion_arc_derives_from_story_arc(mock_llm_cls):
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MOCK_STORY_ARC_RESPONSE
        return MOCK_MOMENTS_RESPONSE

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.emotionArc.timeline) == len(result.storyArc)
    for i, entry in enumerate(result.emotionArc.timeline):
        assert entry["emotion"] == result.storyArc[i].emotion


@patch("src.creative_planner.LLMClient")
def test_plan_strips_markdown_fences(mock_llm_cls):
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return '```json\n{"storyArc": [{"phase": "setup", "start": 0, "end": 3, "emotion": "calm"}]}\n```'
        return '```json\n{"moments": [{"id": "m1", "start": 0, "end": 3, "purpose": "intro", "emotion": "calm", "energy": 0.3, "shots": [], "recipes": [], "aiPrompt": "open", "constraints": []}]}\n```'

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.storyArc) == 1
    assert len(result.moments) == 1
