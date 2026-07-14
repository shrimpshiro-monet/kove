"""E2E integration test: full Director pipeline from prompt → EDL v5.1."""
from contextlib import contextmanager
from unittest.mock import patch, MagicMock

from src.director import Director
from src.intent_decoder import Intent, IntentStyle
from src.creative_planner import (
    CreativePlan, StoryPhase, Moment, EmotionArc,
)
from src.critic import Critique
from src.style_transfer import StyleDNA, CutPattern, ColorSignature


MOCK_INTENT = Intent(
    goal="High-energy TikTok edit",
    genre="tiktok_edit",
    platform="tiktok",
    style=IntentStyle(aggression=0.8, energy=0.9, cinematic=0.6),
    constraints=["keepSubjectVisible", "avoidFaceOcclusion"],
)

MOCK_CONTENT = {
    "faces": [{"bbox": [0.2, 0.1, 0.6, 0.8], "confidence": 0.95}],
    "objects": [{"label": "person", "confidence": 0.9}],
    "depth": [],
    "motion": [{"frame": 0, "magnitude": 0.3}],
    "scenes": [{"start": 0, "end": 6, "label": "indoor"}],
    "brightness": [],
    "composition": {"rule_of_thirds": True},
    "color_palette": ["#FF5733", "#33FF57"],
    "semantic": {
        "description": "Person walking indoors",
        "mood": "energetic",
        "setting": "indoor",
        "action": "walking",
        "confidence": 0.88,
    },
}

MOCK_MUSIC = {
    "bpm": 140,
    "beat_result": {"beats": [0, 0.43, 0.86], "downbeats": [0, 1.71], "bpm": 140},
    "onsets": [0.1, 0.43, 0.86],
    "sections": [{"start": 0, "end": 6, "label": "verse"}],
    "energy_curve": [0.3, 0.5, 0.8],
    "vocal_regions": [],
    "frequency_profile": {"bass": 0.6, "mid": 0.4, "treble": 0.3},
}

MOCK_STORY_ARC = [
    StoryPhase(phase="setup", start=0, end=2, emotion="anticipation"),
    StoryPhase(phase="build", start=2, end=4, emotion="rising"),
    StoryPhase(phase="climax", start=4, end=5.5, emotion="intense"),
    StoryPhase(phase="resolve", start=5.5, end=6, emotion="satisfaction"),
]

MOCK_MOMENTS = [
    Moment(
        id="m1", start=0, end=2, purpose="establish",
        emotion="anticipation", energy=0.3, shots=["wide", "medium"],
        recipes=[], aiPrompt="Set the scene with a wide establishing shot",
        constraints=["keepSubjectVisible"],
    ),
    Moment(
        id="m2", start=2, end=4, purpose="build",
        emotion="rising", energy=0.6, shots=["medium", "close"],
        recipes=[], aiPrompt="Build energy with quick cuts",
        constraints=[],
    ),
    Moment(
        id="m3", start=4, end=5.5, purpose="peak",
        emotion="intense", energy=1.0, shots=["close", "detail"],
        recipes=[], aiPrompt="Climactic moment with fast edits",
        constraints=["avoidFaceOcclusion"],
    ),
    Moment(
        id="m4", start=5.5, end=6, purpose="resolve",
        emotion="satisfaction", energy=0.4, shots=["wide"],
        recipes=[], aiPrompt="Slow down and resolve",
        constraints=[],
    ),
]

MOCK_EMOTION_ARC = EmotionArc(timeline=[
    {"time": 0, "emotion": "anticipation", "intensity": 0.3},
    {"time": 2, "emotion": "rising", "intensity": 0.6},
    {"time": 4, "emotion": "intense", "intensity": 1.0},
    {"time": 5.5, "emotion": "satisfaction", "intensity": 0.4},
])

MOCK_PLAN = CreativePlan(
    storyArc=MOCK_STORY_ARC,
    moments=MOCK_MOMENTS,
    emotionArc=MOCK_EMOTION_ARC,
)

MOCK_STYLE_DNA = StyleDNA(
    cutPattern=CutPattern(avgShotDuration=0.8, cutRate="rapid"),
    effectVocabulary=["glow", "shake", "morph_cut"],
    transitionStyle="stylized",
    colorSignature=ColorSignature(warmth=0.7, contrast=0.8, saturation=0.6),
    pacingProfile="building",
)

MOCK_CRITIQUE_CLEAN = Critique(issues=[], confidence=1.0, alternatives=[])


@contextmanager
def _build_director_with_mocks(**overrides):
    """Wire all mocks and yield (Director, mock_map)."""
    mocks = {
        "intent": MagicMock(),
        "content": MagicMock(),
        "music": MagicMock(),
        "plan": MagicMock(),
        "critic": MagicMock(),
        "style": MagicMock(),
    }

    mocks["intent"].decode.return_value = MOCK_INTENT
    mocks["content"].analyze.return_value = MOCK_CONTENT
    mocks["music"].analyze.return_value = MOCK_MUSIC
    mocks["plan"].plan.return_value = MOCK_PLAN
    mocks["critic"].critique.return_value = overrides.get("critique", MOCK_CRITIQUE_CLEAN)
    mocks["style"].extract_style.return_value = MOCK_STYLE_DNA

    with (
        patch("src.director.IntentDecoder", return_value=mocks["intent"]),
        patch("src.director.ContentAnalyzer", return_value=mocks["content"]),
        patch("src.director.MusicAnalyzer", return_value=mocks["music"]),
        patch("src.director.CreativePlanner", return_value=mocks["plan"]),
        patch("src.director.Critic", return_value=mocks["critic"]),
        patch("src.director.StyleTransfer", return_value=mocks["style"]),
    ):
        director = Director()
        yield director, mocks


def test_full_pipeline_produces_valid_edl():
    """Full pipeline: prompt → IntentDecoder → ContentAnalyzer → MusicAnalyzer
    → CreativePlanner → _build_edl → Critic → final EDL."""
    with _build_director_with_mocks() as (director, mocks):
        edl = director.direct("Make a hype TikTok edit", "/tmp/video.mp4", "/tmp/audio.mp3")

        # Top-level structure
        assert edl["version"] == "5.1"
        assert "id" in edl
        assert "created" in edl
        assert "duration" in edl

        # Style section
        assert "style" in edl
        assert "tokens" in edl["style"]
        assert "genre" in edl["style"]
        assert "constraints" in edl["style"]

        # Creative section — camelCase keys
        assert "creative" in edl
        assert "storyArc" in edl["creative"], "Expected camelCase 'storyArc'"
        assert "intentChains" in edl["creative"], "Expected camelCase 'intentChains'"
        assert "emotionArc" in edl["creative"], "Expected camelCase 'emotionArc'"
        assert "generativeSlots" in edl["creative"], "Expected camelCase 'generativeSlots'"
        assert "moments" in edl["creative"]
        assert "entities" in edl["creative"]

        # Runtime section
        assert "runtime" in edl
        assert "timeline" in edl["runtime"]
        assert "tracks" in edl["runtime"]

        # Editorial section
        assert "editorial" in edl
        assert "sequences" in edl["editorial"]

        # Verify pipeline components were called
        mocks["intent"].decode.assert_called_once()
        mocks["content"].analyze.assert_called_once()
        mocks["music"].analyze.assert_called_once()
        mocks["plan"].plan.assert_called_once()
        mocks["critic"].critique.assert_called_once()


def test_no_snake_case_keys_in_edl():
    """Verify no snake_case keys leak into EDL output."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        # Creative section
        creative = edl["creative"]
        assert "story_arc" not in creative
        assert "intent_chains" not in creative
        assert "emotion_arc" not in creative
        assert "generative_slots" not in creative

        # Style section
        style = edl["style"]
        assert "token_influence" not in style
        assert "style_profile" not in style

        # Runtime section
        runtime = edl["runtime"]
        assert "color_science" not in runtime


def test_creative_section_has_correct_data():
    """Verify creative section data flows through from plan correctly."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        creative = edl["creative"]

        # storyArc has 4 phases
        assert len(creative["storyArc"]) == 4
        assert creative["storyArc"][0]["phase"] == "setup"
        assert creative["storyArc"][2]["phase"] == "climax"

        # moments has 4 moments
        assert len(creative["moments"]) == 4
        assert creative["moments"][0]["id"] == "m1"
        assert creative["moments"][0]["purpose"] == "establish"

        # emotionArc has timeline
        assert len(creative["emotionArc"]["timeline"]) == 4

        # intentChains has global goal
        assert creative["intentChains"]["global"] == "High-energy TikTok edit"
        assert "perMoment" in creative["intentChains"]

        # generativeSlots starts empty
        assert creative["generativeSlots"] == []


def test_style_tokens_from_intent():
    """Verify style tokens are correctly derived from intent."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        tokens = edl["style"]["tokens"]
        assert tokens["aggression"] == 0.8
        assert tokens["energy"] == 0.9
        assert tokens["epicness"] == 0.9
        assert tokens["cinematic"] == 0.6


def test_genre_and_platform_propagated():
    """Verify genre and platform flow from intent into EDL."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        assert edl["style"]["genre"]["primary"] == "tiktok_edit"
        assert edl["style"]["genre"]["platform"] == "tiktok"
        assert "tiktok_edit" in edl["id"]
        assert "tiktok" in edl["id"]


def test_duration_from_moments():
    """Verify EDL duration is derived from the last moment's end time."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        assert edl["duration"] == 6.0
        assert edl["runtime"]["timeline"]["duration"] == 6.0


def test_reference_style_applied():
    """Verify reference style DNA is merged into EDL when provided."""
    with _build_director_with_mocks() as (director, mocks):
        edl = director.direct(
            "test", "/tmp/v.mp4", "/tmp/a.mp3",
            reference_path="/tmp/ref.mp4",
        )

        mocks["style"].extract_style.assert_called_once_with("/tmp/ref.mp4")
        assert edl["style"]["cutRate"] == "rapid"
        assert edl["style"]["avgShotDuration"] == 0.8
        assert edl["style"]["transitionStyle"] == "stylized"
        assert edl["style"]["effectVocabulary"] == ["glow", "shake", "morph_cut"]


def test_reference_style_skipped_when_none():
    """Verify reference style extraction is skipped when no reference provided."""
    with _build_director_with_mocks() as (director, mocks):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        mocks["style"].extract_style.assert_not_called()
        assert "cutRate" not in edl["style"]
        assert "effectVocabulary" not in edl["style"]


def test_critic_called_on_edl():
    """Verify critic receives the EDL for review."""
    with _build_director_with_mocks() as (director, mocks):
        director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        mocks["critic"].critique.assert_called_once()
        call_args = mocks["critic"].critique.call_args
        edl_arg = call_args[0][0]
        assert edl_arg["version"] == "5.1"
        assert "style" in edl_arg
        assert "creative" in edl_arg


def test_refinement_triggered_on_issues():
    """Verify refinement path is triggered when critic finds issues."""
    from src.critic import Issue

    critique_with_issues = Critique(
        issues=[Issue(type="beat_sync", description="Off-beat cut", severity="warning")],
        confidence=0.8,
        alternatives=[],
    )

    with _build_director_with_mocks(critique=critique_with_issues) as (director, mocks):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        mocks["critic"].critique.assert_called_once()
        assert edl["version"] == "5.1"
        assert "style" in edl
        assert "creative" in edl


def test_edl_has_unique_id():
    """Verify each EDL gets a unique ID."""
    with _build_director_with_mocks() as (director, _):
        edl1 = director.direct("test1", "/tmp/v.mp4", "/tmp/a.mp3")
        edl2 = director.direct("test2", "/tmp/v.mp4", "/tmp/a.mp3")

        assert edl1["id"] != edl2["id"]
        assert edl1["id"].startswith("edl_tiktok_edit_tiktok_")
        assert edl2["id"].startswith("edl_tiktok_edit_tiktok_")


def test_edl_timestamp_is_iso():
    """Verify EDL creation timestamp is ISO 8601 format."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        from datetime import datetime
        parsed = datetime.fromisoformat(edl["created"])
        assert parsed.tzinfo is not None


def test_constraints_propagated():
    """Verify constraints from intent are captured in style section."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        constraints = edl["style"]["constraints"]
        assert constraints["avoidFaceOcclusion"] is True
        assert constraints["keepSubjectVisible"] is True
        assert constraints["preserveAudioSync"] is True


def test_content_and_music_passed_to_planner():
    """Verify content analysis and music analysis flow into the planner."""
    with _build_director_with_mocks() as (director, mocks):
        director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        call_args = mocks["plan"].plan.call_args
        assert call_args[0][0] == MOCK_INTENT
        assert call_args[0][1] == MOCK_CONTENT
        assert call_args[0][2] == MOCK_MUSIC


def test_runtime_timeline_structure():
    """Verify runtime.timeline has correct sub-structure."""
    with _build_director_with_mocks() as (director, _):
        edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

        timeline = edl["runtime"]["timeline"]
        assert "resolution" in timeline
        assert timeline["resolution"]["width"] == 1080
        assert timeline["resolution"]["height"] == 1920
        assert timeline["fps"] == 30
        assert timeline["duration"] == 6.0

        assert "colorScience" in edl["runtime"]
        assert "tracks" in edl["runtime"]
