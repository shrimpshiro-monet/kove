from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

from openai import OpenAI
from pydantic import BaseModel


class CutPattern(BaseModel):
    avgShotDuration: float
    cutRate: str


class ColorSignature(BaseModel):
    warmth: float
    contrast: float
    saturation: float = 0.5


class StyleDNA(BaseModel):
    cutPattern: CutPattern
    effectVocabulary: list[str]
    transitionStyle: str
    colorSignature: ColorSignature
    pacingProfile: Optional[str] = None


_DEFAULT_STYLE = StyleDNA(
    cutPattern=CutPattern(avgShotDuration=1.0, cutRate="moderate"),
    effectVocabulary=[],
    transitionStyle="smooth",
    colorSignature=ColorSignature(warmth=0.5, contrast=0.5, saturation=0.5),
    pacingProfile=None,
)


class StyleTransfer:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.client = OpenAI(
            api_key=api_key or os.environ.get("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
        )
        self.model = "llama-3.3-70b-versatile"
        self.prompt_template = (
            Path(__file__).parent / "prompts" / "extract-style.txt"
        )

    def extract_style(self, reference_path: str) -> StyleDNA:
        try:
            template = self.prompt_template.read_text()
            prompt = template.replace("{{REFERENCE_PATH}}", reference_path)

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=4096,
            )
            data = self._parse_json(response.choices[0].message.content)

            return StyleDNA(
                cutPattern=CutPattern(**data.get("cutPattern", {})),
                effectVocabulary=data.get("effectVocabulary", []),
                transitionStyle=data.get("transitionStyle", "smooth"),
                colorSignature=ColorSignature(**data.get("colorSignature", {})),
                pacingProfile=data.get("pacingProfile"),
            )
        except Exception:
            return _DEFAULT_STYLE.model_copy()

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)
