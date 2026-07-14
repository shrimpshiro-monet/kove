from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from openai import OpenAI
from pydantic import BaseModel


class IntentStyle(BaseModel):
    aggression: float = 0.5
    cinematic: float = 0.5
    chaos: float = 0.3
    luxury: float = 0.5
    energy: float = 0.5


class Intent(BaseModel):
    goal: str
    genre: str
    platform: str
    style: IntentStyle
    constraints: list[str]
    mood: Optional[str] = None


class IntentDecoder:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.client = OpenAI(
            api_key=api_key or os.environ.get("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
        )
        self.model = "llama-3.3-70b-versatile"
        self.prompt_template = Path(__file__).parent / "prompts" / "decode-intent.txt"

    def decode(self, prompt: str) -> Intent:
        template = self.prompt_template.read_text()
        full_prompt = template.replace("{{PROMPT}}", prompt)

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": full_prompt}],
            temperature=0.7,
            max_tokens=4096,
        )

        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]

        data = json.loads(text)

        style_data = data.get("style", {})
        style = IntentStyle(
            aggression=style_data.get("aggression", 0.5),
            cinematic=style_data.get("cinematic", 0.5),
            chaos=style_data.get("chaos", 0.3),
            luxury=style_data.get("luxury", 0.5),
            energy=style_data.get("energy", 0.5),
        )

        return Intent(
            goal=data.get("goal", ""),
            genre=data.get("genre", "tiktok_edit"),
            platform=data.get("platform", "tiktok"),
            style=style,
            constraints=data.get("constraints", []),
            mood=data.get("mood"),
        )
