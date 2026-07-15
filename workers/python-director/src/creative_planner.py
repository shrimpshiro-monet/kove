from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel
from .json_utils import extract_json

from .llm_client import LLMClient


class StoryPhase(BaseModel):
    phase: str
    start: float
    end: float
    emotion: str


class Moment(BaseModel):
    id: str
    start: float
    end: float
    purpose: str
    emotion: str
    energy: float
    shots: list[str]
    recipes: list[str]
    aiPrompt: str
    focusEntity: Optional[str] = None
    attention: Optional[dict] = None
    constraints: list[str] = []


class EmotionArc(BaseModel):
    timeline: list[dict]


class CreativePlan(BaseModel):
    storyArc: list[StoryPhase]
    moments: list[Moment]
    emotionArc: EmotionArc


class CreativePlanner:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.llm = LLMClient(api_key)
        self.story_arc_prompt = Path(__file__).parent / "prompts" / "generate-story-arc.txt"
        self.moments_prompt = Path(__file__).parent / "prompts" / "create-moments.txt"

    def plan(self, intent: dict, content: dict, music: dict) -> CreativePlan:
        available_clips = self.build_clip_menu(content)
        available_recipes = self.build_recipe_menu()

        story_arc = self.generate_story_arc(intent, content, music)
        moments = self.create_moments(
            story_arc, intent, content, music, available_clips, available_recipes,
        )
        emotion_arc = self.generate_emotion_arc(story_arc, music)

        return CreativePlan(
            storyArc=story_arc,
            moments=moments,
            emotionArc=emotion_arc,
        )

    def build_clip_menu(self, content: dict) -> list[dict]:
        """Create a menu of available clips from content analysis."""
        clips = []

        scenes = content.get('scenes', [])
        for i, scene in enumerate(scenes):
            clips.append({
                'clipId': f'scene_{i}',
                'duration': scene.get('duration', 3.0),
                'semantic': scene.get('description', scene.get('label', f'Scene {i}')),
                'faces': len(content.get('faces', [])) > 0,
                'motion': 'high' if scene.get('motion_score', 0) > 0.5 else 'low',
            })

        if not clips:
            duration = content.get('duration', 10.0)
            clips = [
                {'clipId': 'clip_0', 'duration': duration / 2, 'semantic': 'first half', 'faces': False, 'motion': 'medium'},
                {'clipId': 'clip_1', 'duration': duration / 2, 'semantic': 'second half', 'faces': False, 'motion': 'medium'},
            ]

        return clips

    def build_recipe_menu(self) -> list[dict]:
        """Return available recipes for the LLM to choose from."""
        return [
            {'id': 'streetwear_reveal_v2', 'description': 'High-energy reveal with flash, shake, glow', 'bestFor': ['awe', 'energy_high']},
            {'id': 'cinematic_slow_burn', 'description': 'Minimal effects, natural motion', 'bestFor': ['calm', 'energy_low']},
            {'id': 'fast_pace_montage', 'description': 'Quick cuts, high energy', 'bestFor': ['excitement', 'energy_very_high']},
            {'id': 'dramatic_buildup', 'description': 'Slow zoom, increasing tension', 'bestFor': ['tension', 'energy_medium']},
        ]

    def summarize_content(self, content: dict) -> str:
        """Summarize content analysis into a readable string for the LLM."""
        parts = []
        semantic = content.get('semantic', {})
        if isinstance(semantic, dict):
            if semantic.get('description') and semantic['description'] != 'no analysis':
                parts.append(f"Description: {semantic['description']}")
                parts.append(f"Mood: {semantic.get('mood', 'unknown')}")
                parts.append(f"Setting: {semantic.get('setting', 'unknown')}")
                parts.append(f"Action: {semantic.get('action', 'unknown')}")
        elif isinstance(semantic, str) and semantic:
            parts.append(f"Description: {semantic}")

        scenes = content.get('scenes', [])
        if scenes:
            parts.append(f"Detected scenes: {len(scenes)}")
            for i, s in enumerate(scenes[:5]):
                parts.append(f"  Scene {i}: {s.get('label', s.get('description', 'unknown'))} ({s.get('start', 0)}s-{s.get('end', 0)}s)")

        faces = content.get('faces', [])
        if faces:
            parts.append(f"Faces detected: {len(faces)}")

        objects = content.get('objects', [])
        if objects:
            labels = [o.get('label', '?') for o in objects[:5]]
            parts.append(f"Objects: {', '.join(labels)}")

        if not parts:
            parts.append("Limited content analysis available")

        return '\n'.join(parts)

    def generate_story_arc(self, intent: Any, content: dict, music: dict) -> list[StoryPhase]:
        template = self.story_arc_prompt.read_text()

        content_summary = self.summarize_content(content)
        music_summary = (
            f"BPM: {music.get('bpm', 120)}, "
            f"Duration: {music.get('duration', 30)}s, "
            f"Energy: {music.get('energy_curve', [])}"
        )

        prompt = template.replace("{{GOAL}}", getattr(intent, "goal", ""))\
                         .replace("{{GENRE}}", getattr(intent, "genre", ""))\
                         .replace("{{PLATFORM}}", getattr(intent, "platform", ""))\
                         .replace("{{BPM}}", str(music.get("bpm", 120)))\
                         .replace("{{CONTENT_SUMMARY}}", content_summary)\
                         .replace("{{MUSIC_SUMMARY}}", music_summary)

        text = self.llm.generate(prompt)
        data = extract_json(text)
        return [StoryPhase(**phase) for phase in data.get("storyArc", [])]

    def create_moments(
        self,
        story_arc: list[StoryPhase],
        intent: Any,
        content: dict,
        music: dict,
        available_clips: list[dict],
        available_recipes: list[dict],
    ) -> list[Moment]:
        template = self.moments_prompt.read_text()

        arc_str = "\n".join([f"- {p.phase}: {p.start}s-{p.end}s ({p.emotion})" for p in story_arc])
        content_summary = self.summarize_content(content)
        clips_str = json.dumps(available_clips, indent=2)
        recipes_str = json.dumps(
            [{'id': r['id'], 'description': r['description']} for r in available_recipes],
            indent=2,
        )

        prompt = template.replace("{{STORY_ARC}}", arc_str)\
                         .replace("{{GOAL}}", getattr(intent, "goal", ""))\
                         .replace("{{GENRE}}", getattr(intent, "genre", ""))\
                         .replace("{{BPM}}", str(music.get("bpm", 120)))\
                         .replace("{{CONTENT_SUMMARY}}", content_summary)\
                         .replace("{{AVAILABLE_CLIPS}}", clips_str)\
                         .replace("{{AVAILABLE_RECIPES}}", recipes_str)

        text = self.llm.generate(prompt)

        data = extract_json(text)
        return [Moment(**m) for m in data.get("moments", [])]

    def generate_emotion_arc(self, story_arc: list[StoryPhase], music: dict) -> EmotionArc:
        timeline = []
        for phase in story_arc:
            timeline.append({
                "time": phase.start,
                "emotion": phase.emotion,
                "intensity": 0.5,
            })
        return EmotionArc(timeline=timeline)
