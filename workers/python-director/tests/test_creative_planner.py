from unittest.mock import patch, MagicMock
from src.creative_planner import CreativePlanner
from src.intent_decoder import Intent, IntentStyle


MOCK_STORY_ARC_RESPONSE = (
    '{"storyArc": [{"phase": "setup", "start": 0, "end": 3, "emotion": "calm"}, '
    '{"phase": "climax", "start": 3, "end": 6, "emotion": "intense"}]}'
)

MOCK_MOMENTS_RESPONSE = (
    '{"moments": [{"id": "m1", "start": 0, "end": 3, "purpose": "establish", '
    '"emotion": "calm", "energy": 0.2, "shots": ["scene_0"], '
    '"recipes": ["cinematic_slow_burn"], '
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
        return '```json\n{"moments": [{"id": "m1", "start": 0, "end": 3, "purpose": "intro", "emotion": "calm", "energy": 0.3, "shots": ["clip_0"], "recipes": ["cinematic_slow_burn"], "aiPrompt": "open", "constraints": []}]}\n```'

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())

    assert len(result.storyArc) == 1
    assert len(result.moments) == 1


@patch("src.creative_planner.LLMClient")
def test_build_clip_menu_from_scenes(mock_llm_cls):
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

    content = {
        "scenes": [
            {"start": 0, "end": 3, "label": "indoor"},
            {"start": 3, "end": 6, "label": "outdoor"},
        ],
        "faces": [{"bbox": [0.2, 0.1, 0.6, 0.8]}],
    }

    planner = CreativePlanner()
    clips = planner.build_clip_menu(content)

    assert len(clips) == 2
    assert clips[0]["clipId"] == "scene_0"
    assert clips[1]["clipId"] == "scene_1"
    assert clips[0]["semantic"] == "indoor"
    assert clips[0]["faces"] is True


@patch("src.creative_planner.LLMClient")
def test_build_clip_menu_fallback(mock_llm_cls):
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

    content = {"scenes": []}

    planner = CreativePlanner()
    clips = planner.build_clip_menu(content)

    assert len(clips) == 2
    assert clips[0]["clipId"] == "clip_0"
    assert clips[1]["clipId"] == "clip_1"


@patch("src.creative_planner.LLMClient")
def test_build_recipe_menu(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = MOCK_STORY_ARC_RESPONSE
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    recipes = planner.build_recipe_menu()

    assert len(recipes) == 4
    recipe_ids = [r["id"] for r in recipes]
    assert "streetwear_reveal_v2" in recipe_ids
    assert "cinematic_slow_burn" in recipe_ids
    assert "fast_pace_montage" in recipe_ids
    assert "dramatic_buildup" in recipe_ids


@patch("src.creative_planner.LLMClient")
def test_summarize_content(mock_llm_cls):
    mock_client = MagicMock()
    mock_client.generate.return_value = MOCK_STORY_ARC_RESPONSE
    mock_llm_cls.return_value = mock_client

    content = {
        "semantic": {"description": "person walking", "mood": "calm", "setting": "indoor", "action": "walking"},
        "scenes": [{"start": 0, "end": 3, "label": "indoor"}],
        "faces": [{"bbox": [0.2, 0.1]}],
        "objects": [{"label": "person"}],
    }

    planner = CreativePlanner()
    summary = planner.summarize_content(content)

    assert "person walking" in summary
    assert "calm" in summary
    assert "1" in summary  # 1 scene detected
    assert "person" in summary  # object label


@patch("src.creative_planner.LLMClient")
def test_create_moments_receives_clip_menu(mock_llm_cls):
    """Verify create_moments receives available clips in prompt."""
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MOCK_STORY_ARC_RESPONSE
        # Check that clips are in the prompt
        assert "scene_0" in prompt or "clip_0" in prompt
        return MOCK_MOMENTS_RESPONSE

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())
    assert len(result.moments) == 1


@patch("src.creative_planner.LLMClient")
def test_create_moments_receives_recipe_menu(mock_llm_cls):
    """Verify create_moments receives available recipes in prompt."""
    call_count = 0

    def side_effect(prompt, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MOCK_STORY_ARC_RESPONSE
        # Check that recipes are in the prompt
        assert "streetwear_reveal_v2" in prompt
        return MOCK_MOMENTS_RESPONSE

    mock_client = MagicMock()
    mock_client.generate.side_effect = side_effect
    mock_llm_cls.return_value = mock_client

    planner = CreativePlanner()
    result = planner.plan(_make_intent(), _make_content(), _make_music())
    assert len(result.moments) == 1
