from unittest.mock import patch, MagicMock

from src.director import Director
from src.intent_decoder import Intent, IntentStyle
from src.creative_planner import (
    CreativePlan, StoryPhase, Moment, EmotionArc,
)
from src.critic import Critique, Issue
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
        emotion="calm", energy=0.2, shots=["scene_0"],
        recipes=["cinematic_slow_burn"], aiPrompt="Set the scene", constraints=[],
    ),
]

MOCK_EMOTION_ARC = EmotionArc(timeline=[
    {"time": 0, "emotion": "calm", "intensity": 0.5},
    {"time": 3, "emotion": "intense", "intensity": 0.5},
])

MOCK_PLAN = CreativePlan(
    storyArc=MOCK_STORY_ARC,
    moments=MOCK_MOMENTS,
    emotionArc=MOCK_EMOTION_ARC,
)

MOCK_STYLE_DNA = StyleDNA(
    cutPattern=CutPattern(avgShotDuration=1.5, cutRate="rapid"),
    effectVocabulary=["glow", "shake"],
    transitionStyle="stylized",
    colorSignature=ColorSignature(warmth=0.7, contrast=0.8, saturation=0.6),
    pacingProfile="building",
)

MOCK_CRITIQUE_CLEAN = Critique(issues=[], confidence=1.0, alternatives=[])
MOCK_CRITIQUE_ISSUES = Critique(
    issues=[Issue(type="beat_sync", description="Off-beat cut", severity="warning")],
    confidence=0.85,
    alternatives=[],
)


def _wire_mocks(mock_modules: dict) -> MagicMock:
    """Configure all mock sub-components and return the mock map."""
    m = mock_modules
    m["intent"].decode.return_value = MOCK_INTENT
    m["content"].analyze.return_value = MOCK_CONTENT
    m["music"].analyze.return_value = MOCK_MUSIC
    m["plan"].plan.return_value = MOCK_PLAN
    m["critic"].critique.return_value = MOCK_CRITIQUE_CLEAN
    m["style"].extract_style.return_value = MOCK_STYLE_DNA
    return m


def _build_mock_map() -> dict[str, MagicMock]:
    return {k: MagicMock() for k in (
        "intent", "content", "music", "plan", "critic", "style",
    )}


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_runs_full_pipeline(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    result = director.direct("Make a hype TikTok edit", "/tmp/video.mp4", "/tmp/audio.mp3")

    assert result["version"] == "5.1"
    assert "style" in result
    assert "creative" in result
    mocks["intent"].decode.assert_called_once_with("Make a hype TikTok edit")
    mocks["content"].analyze.assert_called_once_with("/tmp/video.mp4")
    mocks["music"].analyze.assert_called_once_with("/tmp/audio.mp3")
    mocks["plan"].plan.assert_called_once_with(MOCK_INTENT, MOCK_CONTENT, MOCK_MUSIC)
    mocks["critic"].critique.assert_called_once()


# ---------------------------------------------------------------------------
# EDL structure
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_edl_has_required_sections(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    for key in ("version", "id", "style", "creative", "runtime", "editorial"):
        assert key in edl, f"Missing EDL section: {key}"
    assert edl["version"] == "5.1"
    assert "tokens" in edl["style"]
    assert "genre" in edl["style"]
    assert "constraints" in edl["style"]


# ---------------------------------------------------------------------------
# Style tokens from intent
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_applies_intent_style_tokens(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    tokens = edl["style"]["tokens"]
    assert tokens["aggression"] == 0.8
    assert tokens["energy"] == 0.9
    assert tokens["epicness"] == 0.9


# ---------------------------------------------------------------------------
# Reference style
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_extracts_style_from_reference(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    mocks["critic"].critique.return_value = MOCK_CRITIQUE_CLEAN
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct(
        "test", "/tmp/v.mp4", "/tmp/a.mp3",
        reference_path="/tmp/ref.mp4",
    )

    mocks["style"].extract_style.assert_called_once_with("/tmp/ref.mp4")
    assert edl["style"]["cutRate"] == "rapid"
    assert edl["style"]["avgShotDuration"] == 1.5
    assert edl["style"]["transitionStyle"] == "stylized"
    assert edl["style"]["effectVocabulary"] == ["glow", "shake"]


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_skips_style_when_no_reference(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    mocks["style"].extract_style.assert_not_called()
    assert "cutRate" not in edl["style"]
    assert "effectVocabulary" not in edl["style"]


# ---------------------------------------------------------------------------
# Critic
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_runs_critic_on_edl(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    mocks["critic"].critique.return_value = MOCK_CRITIQUE_ISSUES
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    mocks["critic"].critique.assert_called_once()
    call_args = mocks["critic"].critique.call_args
    edl_arg = call_args[0][0]
    assert edl_arg["version"] == "5.1"


# ---------------------------------------------------------------------------
# Refinement
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_refines_when_issues_found(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    mocks["critic"].critique.return_value = MOCK_CRITIQUE_ISSUES
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    assert edl["version"] == "5.1"
    assert "style" in edl


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_skips_refinement_when_clean(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    mocks["critic"].critique.assert_called_once()
    assert edl["version"] == "5.1"


# ---------------------------------------------------------------------------
# Content & music passed to planner
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_analyzes_content_and_music(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    call_args = mocks["plan"].plan.call_args
    assert call_args[0][0] == MOCK_INTENT
    assert call_args[0][1] == MOCK_CONTENT
    assert call_args[0][2] == MOCK_MUSIC


# ---------------------------------------------------------------------------
# Creative section populated
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_populates_creative_section(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    creative = edl["creative"]
    assert "storyArc" in creative
    assert "moments" in creative
    assert "emotionArc" in creative
    assert len(creative["storyArc"]) == 2
    assert len(creative["moments"]) == 1


# ---------------------------------------------------------------------------
# Genre and platform propagation
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_propagates_genre_and_platform(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    assert edl["style"]["genre"]["primary"] == "tiktok_edit"
    assert edl["style"]["genre"]["platform"] == "tiktok"
    assert "tiktok_edit" in edl["id"]
    assert "tiktok" in edl["id"]


# ---------------------------------------------------------------------------
# Duration from moments
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_director_sets_duration_from_moments(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    assert edl["duration"] == 3.0
    assert edl["runtime"]["timeline"]["duration"] == 3.0


# ---------------------------------------------------------------------------
# Runtime tracks (Issue 2 fix)
# ---------------------------------------------------------------------------

@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_runtime_tracks_not_empty(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    tracks = edl["runtime"]["tracks"]
    assert len(tracks) == 1
    assert tracks[0]["id"] == "track_v1"
    assert tracks[0]["type"] == "video"
    assert len(tracks[0]["clips"]) > 0


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_runtime_clips_have_correct_structure(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    clips = edl["runtime"]["tracks"][0]["clips"]
    assert len(clips) == 1
    clip = clips[0]
    assert clip["id"] == "m1_clip_0"
    assert clip["momentId"] == "m1"
    assert clip["source"]["clipId"] == "scene_0"
    assert clip["source"]["type"] == "video"
    assert clip["timing"]["start"] == 0
    assert clip["timing"]["duration"] == 3.0
    assert "effects" in clip
    assert "transition" in clip


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_recipe_effects_applied_to_clips(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    clips = edl["runtime"]["tracks"][0]["clips"]
    clip = clips[0]
    # cinematic_slow_burn recipe has vignette + film_grain
    assert len(clip["effects"]) == 2
    effect_types = [e["type"] for e in clip["effects"]]
    assert "vignette" in effect_types
    assert "film_grain" in effect_types


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_fallback_effects_when_no_recipe(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    # Moment with no recipes
    plan_no_recipes = CreativePlan(
        storyArc=MOCK_STORY_ARC,
        moments=[Moment(
            id="m1", start=0, end=3, purpose="establish",
            emotion="calm", energy=0.2, shots=["scene_0"],
            recipes=[], aiPrompt="Set the scene", constraints=[],
        )],
        emotionArc=MOCK_EMOTION_ARC,
    )
    mocks["plan"].plan.return_value = plan_no_recipes

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    clips = edl["runtime"]["tracks"][0]["clips"]
    assert len(clips[0]["effects"]) == 1
    assert clips[0]["effects"][0]["type"] == "vignette"


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_fallback_clip_when_no_shots(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    plan_no_shots = CreativePlan(
        storyArc=MOCK_STORY_ARC,
        moments=[Moment(
            id="m1", start=0, end=3, purpose="establish",
            emotion="calm", energy=0.2, shots=[],
            recipes=[], aiPrompt="Set the scene", constraints=[],
        )],
        emotionArc=MOCK_EMOTION_ARC,
    )
    mocks["plan"].plan.return_value = plan_no_shots

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    clips = edl["runtime"]["tracks"][0]["clips"]
    assert len(clips) == 1
    assert clips[0]["source"]["clipId"] == "clip_0"


@patch("src.director.StyleTransfer")
@patch("src.director.MusicAnalyzer")
@patch("src.director.ContentAnalyzer")
@patch("src.director.Critic")
@patch("src.director.CreativePlanner")
@patch("src.director.IntentDecoder")
def test_multiple_shots_split_duration(
    mock_intent_cls, mock_plan_cls, mock_critic_cls,
    mock_content_cls, mock_music_cls, mock_style_cls,
):
    mocks = _build_mock_map()
    _wire_mocks(mocks)
    mock_intent_cls.return_value = mocks["intent"]
    mock_content_cls.return_value = mocks["content"]
    mock_music_cls.return_value = mocks["music"]
    mock_plan_cls.return_value = mocks["plan"]
    mock_critic_cls.return_value = mocks["critic"]
    mock_style_cls.return_value = mocks["style"]

    plan_multi = CreativePlan(
        storyArc=MOCK_STORY_ARC,
        moments=[Moment(
            id="m1", start=0, end=6, purpose="climax",
            emotion="intense", energy=1.0, shots=["scene_0", "scene_1"],
            recipes=["streetwear_reveal_v2"], aiPrompt="Fast cuts", constraints=[],
        )],
        emotionArc=MOCK_EMOTION_ARC,
    )
    mocks["plan"].plan.return_value = plan_multi

    director = Director()
    edl = director.direct("test", "/tmp/v.mp4", "/tmp/a.mp3")

    clips = edl["runtime"]["tracks"][0]["clips"]
    assert len(clips) == 2
    assert clips[0]["source"]["clipId"] == "scene_0"
    assert clips[1]["source"]["clipId"] == "scene_1"
    assert clips[0]["timing"]["start"] == 0
    assert clips[0]["timing"]["duration"] == 3.0
    assert clips[1]["timing"]["start"] == 3.0
    assert clips[1]["timing"]["duration"] == 3.0
