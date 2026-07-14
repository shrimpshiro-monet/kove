from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import google.generativeai as genai
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
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.prompt_template = (
            Path(__file__).parent / "prompts" / "extract-style.txt"
        )

    def extract_style(self, reference_path: str) -> StyleDNA:
        try:
            template = self.prompt_template.read_text()
            prompt = template.replace("{{REFERENCE_PATH}}", reference_path)

            response = self.model.generate_content(prompt)
            data = self._parse_json(response.text)

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
