"""Schema compatibility: Python Director output must use camelCase keys matching EDL v5.1."""
from unittest.mock import patch, MagicMock

from src.director import Director
from src.intent_decoder import Intent, IntentStyle
from src.creative_planner import CreativePlan, StoryPhase, Moment, EmotionArc
from src.critic import Critique
from src.style_transfer import StyleDNA, CutPattern, ColorSignature

MOCK_INTENT = Intent(
    goal="High-energy TikTok edit",
    genre="tiktok_edit",
    platform="tiktok",
    style=IntentStyle(aggression=0.8, energy=0.9),
    constraints=["keepSubjectVisible"],
)

MOCK_CONTENT = {
    "faces": [], "objects": [], "depth": [], "motion": [],
    "scenes": [], "brightness": [], "composition": {},
    "color_palette": [],
    "semantic": {"description": "test", "mood": "calm",
                 "setting": "indoor", "action": "walking", "confidence": 0.9},
}

MOCK_MUSIC = {
    "bpm": 120,
    "beat_result": {"beats": [], "downbeats": [], "bpm": 120},
    "onsets": [], "sections": [], "energy_curve": [],
    "vocal_regions": [], "frequency_profile": {},
}

MOCK_STORY_ARC = [
    StoryPhase(phase="setup", start=0, end=3, emotion="calm"),
    StoryPhase(phase="climax", start=3, end=6, emotion="intense"),
]

MOCK_MOMENTS = [
    Moment(
        id="m1", start=0, end=3, purpose="establish",
        emotion="calm", energy=0.2, shots=["wide"],
        recipes=[], aiPrompt="Set the scene", constraints=[],
    ),
]

MOCK_EMOTION_ARC = EmotionArc(timeline=[
    {"time": 0, "emotion": "calm", "intensity": 0.5},
    {"time": 3, "emotion": "intense", "intensity": 0.5},
])

MOCK_PLAN = CreativePlan(
    story_arc=MOCK_STORY_ARC,
    moments=MOCK_MOMENTS,
    emotion_arc=MOCK_EMOTION_ARC,
)

MOCK_STYLE_DNA = StyleDNA(
    cutPattern=CutPattern(avgShotDuration=1.5, cutRate="rapid"),
    effectVocabulary=["glow", "shake"],
    transitionStyle="stylized",
    colorSignature=ColorSignature(warmth=0.7, contrast=0.8, saturation=0.6),
    pacingProfile="building",
)

MOCK_CRITIQUE_CLEAN = Critique(issues=[], confidence=1.0, alternatives=[])


def _build_director_with_mocks():
    with (
        patch("src.director.IntentDecoder") as mock_intent_cls,
        patch("src.director.ContentAnalyzer") as mock_content_cls,
        patch("src.director.MusicAnalyzer") as mock_music_cls,
        patch("src.director.CreativePlanner") as mock_plan_cls,
        patch("src.director.Critic") as mock_critic_cls,
        patch("src.director.StyleTransfer") as mock_style_cls,
    ):
        mock_intent_cls.return_value.decode.return_value = MOCK_INTENT
        mock_content_cls.return_value.analyze.return_value = MOCK_CONTENT
        mock_music_cls.return_value.analyze.return_value = MOCK_MUSIC
        mock_plan_cls.return_value.plan.return_value = MOCK_PLAN
        mock_critic_cls.return_value.critique.return_value = MOCK_CRITIQUE_CLEAN
        mock_style_cls.return_value.extract_style.return_value = MOCK_STYLE_DNA

        director = Director()
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")
        return edl


def test_creative_section_uses_camelcase_keys():
    edl = _build_director_with_mocks()
    creative = edl["creative"]

    # Must have camelCase keys
    assert "storyArc" in creative, "Expected 'storyArc' (camelCase) in creative"
    assert "intentChains" in creative, "Expected 'intentChains' (camelCase) in creative"
    assert "emotionArc" in creative, "Expected 'emotionArc' (camelCase) in creative"
    assert "generativeSlots" in creative, "Expected 'generativeSlots' in creative"


def test_no_snake_case_keys_in_creative():
    edl = _build_director_with_mocks()
    creative = edl["creative"]

    # Must NOT have snake_case keys
    assert "story_arc" not in creative, "snake_case 'story_arc' should not exist"
    assert "intent_chains" not in creative, "snake_case 'intent_chains' should not exist"
    assert "emotion_arc" not in creative, "snake_case 'emotion_arc' should not exist"


def test_camelcase_story_arc_data_intact():
    edl = _build_director_with_mocks()
    story_arc = edl["creative"]["storyArc"]

    assert isinstance(story_arc, list)
    assert len(story_arc) == 2
    assert story_arc[0]["phase"] == "setup"
    assert story_arc[1]["phase"] == "climax"


def test_camelcase_emotion_arc_data_intact():
    edl = _build_director_with_mocks()
    emotion_arc = edl["creative"]["emotionArc"]

    assert isinstance(emotion_arc, dict)
    assert "timeline" in emotion_arc
    assert len(emotion_arc["timeline"]) == 2


def test_camelcase_intent_chains_data_intact():
    edl = _build_director_with_mocks()
    intent_chains = edl["creative"]["intentChains"]

    assert isinstance(intent_chains, dict)
    assert intent_chains["global"] == "High-energy TikTok edit"
    assert "perMoment" in intent_chains
