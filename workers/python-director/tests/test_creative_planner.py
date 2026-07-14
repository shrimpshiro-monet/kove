from unittest.mock import patch, MagicMock
from src.creative_planner import CreativePlanner
from src.intent_decoder import Intent, IntentStyle


MOCK_STORY_ARC_RESPONSE = (
    '{"story_arc": [{"phase": "setup", "start": 0, "end": 3, "emotion": "calm"}, '
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


@patch("src.creative_planner.genai")
def test_plan_returns_creative_plan(mock_genai):
    call_count = 0

    def side_effect(prompt):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        if call_count == 1:
            resp.text = MOCK_STORY_ARC_RESPONSE
        else:
            resp.text = MOCK_MOMENTS_RESPONSE
        return resp

    mock_model = MagicMock()
    mock_model.generate_content.side_effect = side_effect
    mock_genai.GenerativeModel.return_value = mock_model

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.story_arc) == 2
    assert result.story_arc[0].phase == "setup"
    assert len(result.moments) == 1
    assert result.moments[0].id == "m1"
    assert len(result.emotion_arc.timeline) == 2


@patch("src.creative_planner.genai")
def test_story_arc_phases_have_required_fields(mock_genai):
    call_count = 0

    def side_effect(prompt):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        if call_count == 1:
            resp.text = MOCK_STORY_ARC_RESPONSE
        else:
            resp.text = MOCK_MOMENTS_RESPONSE
        return resp

    mock_model = MagicMock()
    mock_model.generate_content.side_effect = side_effect
    mock_genai.GenerativeModel.return_value = mock_model

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    for phase in result.story_arc:
        assert hasattr(phase, "phase")
        assert hasattr(phase, "start")
        assert hasattr(phase, "end")
        assert hasattr(phase, "emotion")


@patch("src.creative_planner.genai")
def test_moments_have_required_fields(mock_genai):
    call_count = 0

    def side_effect(prompt):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        if call_count == 1:
            resp.text = MOCK_STORY_ARC_RESPONSE
        else:
            resp.text = MOCK_MOMENTS_RESPONSE
        return resp

    mock_model = MagicMock()
    mock_model.generate_content.side_effect = side_effect
    mock_genai.GenerativeModel.return_value = mock_model

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


@patch("src.creative_planner.genai")
def test_emotion_arc_derives_from_story_arc(mock_genai):
    call_count = 0

    def side_effect(prompt):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        if call_count == 1:
            resp.text = MOCK_STORY_ARC_RESPONSE
        else:
            resp.text = MOCK_MOMENTS_RESPONSE
        return resp

    mock_model = MagicMock()
    mock_model.generate_content.side_effect = side_effect
    mock_genai.GenerativeModel.return_value = mock_model

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.emotion_arc.timeline) == len(result.story_arc)
    for i, entry in enumerate(result.emotion_arc.timeline):
        assert entry["emotion"] == result.story_arc[i].emotion


@patch("src.creative_planner.genai")
def test_plan_strips_markdown_fences(mock_genai):
    call_count = 0

    def side_effect(prompt):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        if call_count == 1:
            resp.text = '```json\n{"story_arc": [{"phase": "setup", "start": 0, "end": 3, "emotion": "calm"}]}\n```'
        else:
            resp.text = '```json\n{"moments": [{"id": "m1", "start": 0, "end": 3, "purpose": "intro", "emotion": "calm", "energy": 0.3, "shots": [], "recipes": [], "aiPrompt": "open", "constraints": []}]}\n```'
        return resp

    mock_model = MagicMock()
    mock_model.generate_content.side_effect = side_effect
    mock_genai.GenerativeModel.return_value = mock_model

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.story_arc) == 1
    assert len(result.moments) == 1
