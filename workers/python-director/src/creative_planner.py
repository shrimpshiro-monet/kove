from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

from openai import OpenAI
from pydantic import BaseModel

from .intent_decoder import Intent


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
    attention: Optional[dict[str, Any]] = None
    constraints: list[str] = []


class EmotionArc(BaseModel):
    timeline: list[dict[str, Any]]


class CreativePlan(BaseModel):
    story_arc: list[StoryPhase]
    moments: list[Moment]
    emotion_arc: EmotionArc


class CreativePlanner:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.client = OpenAI(
            api_key=api_key or os.environ.get("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
        )
        self.model = "llama-3.3-70b-versatile"
        self.story_arc_prompt = Path(__file__).parent / "prompts" / "generate-story-arc.txt"
        self.moments_prompt = Path(__file__).parent / "prompts" / "create-moments.txt"

    def plan(self, intent: Intent, content: dict[str, Any], music: dict[str, Any]) -> CreativePlan:
        story_arc = self.generate_story_arc(intent, content, music)
        moments = self.create_moments(story_arc, intent, content, music)
        emotion_arc = self.build_emotion_arc(story_arc)
        return CreativePlan(story_arc=story_arc, moments=moments, emotion_arc=emotion_arc)

    def generate_story_arc(
        self, intent: Intent, content: dict[str, Any], music: dict[str, Any]
    ) -> list[StoryPhase]:
        template = self.story_arc_prompt.read_text()
        prompt = (
            template.replace("{{GOAL}}", intent.goal)
            .replace("{{GENRE}}", intent.genre)
            .replace("{{PLATFORM}}", intent.platform)
            .replace("{{BPM}}", str(music.get("bpm", 120)))
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=4096,
        )
        data = self._parse_json(response.choices[0].message.content)
        return [StoryPhase(**phase) for phase in data.get("story_arc", [])]

    def create_moments(
        self,
        story_arc: list[StoryPhase],
        intent: Intent,
        content: dict[str, Any],
        music: dict[str, Any],
    ) -> list[Moment]:
        template = self.moments_prompt.read_text()
        arc_str = "\n".join(
            f"- {p.phase}: {p.start}s-{p.end}s ({p.emotion})" for p in story_arc
        )
        prompt = (
            template.replace("{{STORY_ARC}}", arc_str)
            .replace("{{GOAL}}", intent.goal)
            .replace("{{GENRE}}", intent.genre)
            .replace("{{BPM}}", str(music.get("bpm", 120)))
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=4096,
        )
        data = self._parse_json(response.choices[0].message.content)
        return [Moment(**m) for m in data.get("moments", [])]

    def build_emotion_arc(self, story_arc: list[StoryPhase]) -> EmotionArc:
        timeline = []
        for phase in story_arc:
            timeline.append({
                "time": phase.start,
                "emotion": phase.emotion,
                "intensity": 0.5,
            })
        return EmotionArc(timeline=timeline)

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)
