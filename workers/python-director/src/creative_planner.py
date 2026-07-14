from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel

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
        story_arc = self.generate_story_arc(intent, content, music)
        moments = self.create_moments(story_arc, intent, content, music)
        emotion_arc = self.generate_emotion_arc(story_arc, music)
        return CreativePlan(
            storyArc=story_arc,
            moments=moments,
            emotionArc=emotion_arc,
        )

    def generate_story_arc(self, intent: Any, content: dict, music: dict) -> list[StoryPhase]:
        template = self.story_arc_prompt.read_text()
        prompt = template.replace("{{GOAL}}", getattr(intent, "goal", ""))\
                         .replace("{{GENRE}}", getattr(intent, "genre", ""))\
                         .replace("{{PLATFORM}}", getattr(intent, "platform", ""))\
                         .replace("{{DURATION}}", str(music.get("bpm", 120)))

        text = self.llm.generate(prompt)

        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]

        data = json.loads(text)
        return [StoryPhase(**phase) for phase in data.get("storyArc", [])]

    def create_moments(self, story_arc: list[StoryPhase], intent: Any, content: dict, music: dict) -> list[Moment]:
        template = self.moments_prompt.read_text()
        arc_str = "\n".join([f"- {p.phase}: {p.start}s-{p.end}s ({p.emotion})" for p in story_arc])
        prompt = template.replace("{{STORY_ARC}}", arc_str)\
                         .replace("{{GOAL}}", getattr(intent, "goal", ""))\
                         .replace("{{GENRE}}", getattr(intent, "genre", ""))\
                         .replace("{{BPM}}", str(music.get("bpm", 120)))

        text = self.llm.generate(prompt)

        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]

        data = json.loads(text)
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
