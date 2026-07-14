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


class Director:
    """Main orchestrator — prompt → EDL v5.1 pipeline."""

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
                "tracks": [],
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
