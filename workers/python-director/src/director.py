from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from .content_analyzer import ContentAnalyzer
from .creative_planner import CreativePlan, CreativePlanner
from .critic import Critic, Critique
from .intent_decoder import Intent, IntentDecoder
from .music_analyzer import MusicAnalyzer
from .style_transfer import StyleDNA, StyleTransfer


RECIPE_EFFECTS: dict[str, list[dict]] = {
    'streetwear_reveal_v2': [
        {'id': 'fx_glow', 'type': 'glow', 'targetStrength': 0.6, 'params': {'radius': 20}},
        {'id': 'fx_shake', 'type': 'shake', 'targetStrength': 0.3, 'params': {}},
        {'id': 'fx_rgb', 'type': 'rgb_split', 'targetStrength': 0.2, 'params': {}},
    ],
    'cinematic_slow_burn': [
        {'id': 'fx_vignette', 'type': 'vignette', 'targetStrength': 0.4, 'params': {}},
        {'id': 'fx_grain', 'type': 'film_grain', 'targetStrength': 0.2, 'params': {}},
    ],
    'fast_pace_montage': [
        {'id': 'fx_color', 'type': 'color_grade', 'targetStrength': 0.7, 'params': {'preset': 'teal_orange'}},
        {'id': 'fx_shake', 'type': 'shake', 'targetStrength': 0.4, 'params': {}},
    ],
    'dramatic_buildup': [
        {'id': 'fx_zoom', 'type': 'zoom', 'targetStrength': 0.5, 'params': {}},
        {'id': 'fx_vignette', 'type': 'vignette', 'targetStrength': 0.3, 'params': {}},
    ],
}

DEFAULT_EFFECTS: list[dict] = [
    {'id': 'fx_default', 'type': 'vignette', 'targetStrength': 0.3, 'params': {}},
]


class Director:
    """Main orchestrator — prompt -> EDL v5.1 pipeline."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.intent_decoder = IntentDecoder(api_key)
        self.content_analyzer = ContentAnalyzer()
        self.music_analyzer = MusicAnalyzer()
        self.creative_planner = CreativePlanner(api_key)
        self.critic = Critic(api_key)
        self.style_transfer = StyleTransfer(api_key)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def direct(
        self,
        prompt: str,
        footage_path: str,
        music_path: str,
        reference_path: Optional[str] = None,
    ) -> dict[str, Any]:
        intent = self.intent_decoder.decode(prompt)
        content = self.content_analyzer.analyze(footage_path)
        music = self.music_analyzer.analyze(music_path)

        style_dna: Optional[StyleDNA] = None
        if reference_path:
            style_dna = self.style_transfer.extract_style(reference_path)

        plan = self.creative_planner.plan(intent, content, music)
        edl = self._build_edl(plan, intent, content, music, style_dna)

        critique = self.critic.critique(edl, content, music)
        if critique.issues:
            edl = self._refine(edl, critique, content, music)

        return edl

    # ------------------------------------------------------------------
    # EDL construction
    # ------------------------------------------------------------------

    def _build_edl(
        self,
        plan: CreativePlan,
        intent: Intent,
        content: dict[str, Any],
        music: dict[str, Any],
        style_dna: Optional[StyleDNA] = None,
    ) -> dict[str, Any]:
        duration = self._compute_duration(plan)
        edl_id = f"edl_{intent.genre}_{intent.platform}_{uuid4().hex[:8]}"
        created = datetime.now(timezone.utc).isoformat()

        tokens = {
            "aggression": intent.style.aggression,
            "cinematic": intent.style.cinematic,
            "chaos": intent.style.chaos,
            "luxury": intent.style.luxury,
            "warmth": 0.5,
            "nostalgia": 0.3,
            "futurism": 0.5,
            "intimacy": 0.5,
            "epicness": intent.style.energy,
            "playfulness": 0.2,
            "darkness": 0.3,
            "energy": intent.style.energy,
        }

        style_section: dict[str, Any] = {
            "tokens": tokens,
            "tokenInfluence": {},
            "genre": {
                "primary": intent.genre,
                "platform": intent.platform,
                "styleProfile": {
                    "cutRate": 1.2,
                    "avgShotDuration": 1.2,
                    "effectDensity": 0.8,
                    "transitionStyle": "stylized",
                    "colorMood": 0.8,
                    "textFrequency": 0.5,
                    "energyCurve": "building",
                },
            },
            "constraints": {
                "avoidFaceOcclusion": True,
                "maxTextCoverage": 0.12,
                "keepSubjectVisible": True,
                "preserveMotionDirection": True,
                "safeArea": True,
                "avoidOverEditing": True,
                "maxEffectsPerShot": 5,
                "minShotDuration": 0.3,
                "maxTransitionDuration": 1.5,
                "preserveAudioSync": True,
                "maintainColorConsistency": True,
            },
        }

        if style_dna is not None:
            style_section["cutRate"] = style_dna.cutPattern.cutRate
            style_section["avgShotDuration"] = style_dna.cutPattern.avgShotDuration
            style_section["transitionStyle"] = style_dna.transitionStyle
            style_section["effectVocabulary"] = style_dna.effectVocabulary

        runtime_tracks = self._build_runtime_tracks(plan, content, music)

        return {
            "version": "5.1",
            "id": edl_id,
            "created": created,
            "duration": duration,
            "refs": {"entities": {}, "recipes": {}, "detections": {}},
            "style": style_section,
            "creative": {
                "entities": {},
                "storyArc": [p.model_dump() for p in plan.storyArc],
                "emotionArc": plan.emotionArc.model_dump(),
                "moments": [m.model_dump() for m in plan.moments],
                "intentChains": {"global": intent.goal, "perMoment": {}},
                "generativeSlots": [],
            },
            "editorial": {
                "sequences": [],
                "shotRelationships": [],
                "rhythm": {"pattern": "building", "musicalPhraseAlignment": []},
            },
            "runtime": {
                "timeline": {
                    "resolution": {"width": 1080, "height": 1920},
                    "fps": 30,
                    "duration": duration,
                },
                "tracks": runtime_tracks,
                "colorScience": {
                    "workingSpace": "ACES2065-1",
                    "inputTransform": {
                        "source": "camera_log",
                        "cameraProfile": "Sony_SLog3",
                    },
                    "outputTransform": {
                        "target": "Rec709",
                        "toneMapping": "aces_filmic",
                    },
                },
            },
            "capabilities": {},
            "dependencies": {},
            "analysis": {},
        }

    # ------------------------------------------------------------------
    # Runtime tracks
    # ------------------------------------------------------------------

    def _build_runtime_tracks(
        self,
        plan: CreativePlan,
        content: dict[str, Any],
        music: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Deterministically build runtime tracks from moments."""
        clips = []

        for moment in plan.moments:
            moment_clips = moment.shots if moment.shots else []

            if not moment_clips:
                moment_clips = ['clip_0']

            for i, clip_id in enumerate(moment_clips):
                clip_duration = (moment.end - moment.start) / len(moment_clips)
                clip_start = moment.start + (i * clip_duration)

                if moment.recipes:
                    recipe_effects = _get_recipe_effects(moment.recipes[0])
                else:
                    recipe_effects = [e.copy() for e in DEFAULT_EFFECTS]

                clips.append({
                    'id': f'{moment.id}_clip_{i}',
                    'momentId': moment.id,
                    'source': {
                        'clipId': clip_id,
                        'type': 'video',
                        'in': 0,
                        'out': clip_duration,
                    },
                    'timing': {
                        'start': clip_start,
                        'duration': clip_duration,
                        'speed': 1.0,
                    },
                    'effects': recipe_effects,
                    'transition': {
                        'type': 'crossfade',
                        'duration': 0.3,
                    },
                })

        return [{
            'id': 'track_v1',
            'type': 'video',
            'name': 'Main',
            'clips': clips,
        }]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_duration(plan: CreativePlan) -> float:
        if plan.moments:
            return max(m.end for m in plan.moments)
        if plan.storyArc:
            return max(p.end for p in plan.storyArc)
        return 15.0

    @staticmethod
    def _refine(
        edl: dict[str, Any],
        critique: Critique,
        content: dict[str, Any],
        music: dict[str, Any],
    ) -> dict[str, Any]:
        """Refine EDL based on critique — placeholder for future iteration."""
        return edl


def _get_recipe_effects(recipe_id: str) -> list[dict]:
    """Get effects from a recipe."""
    effects = RECIPE_EFFECTS.get(recipe_id)
    if effects:
        return [e.copy() for e in effects]
    return [e.copy() for e in DEFAULT_EFFECTS]
