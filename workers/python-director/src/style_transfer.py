from __future__ import annotations

import json
from typing import Optional

from pydantic import BaseModel
from .json_utils import extract_json

from .llm_client import LLMClient


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
    cutPattern=CutPattern(avgShotDuration=2.0, cutRate="moderate"),
    effectVocabulary=["vignette", "color_grade"],
    transitionStyle="crossfade",
    colorSignature=ColorSignature(warmth=0.5, contrast=0.5, saturation=0.5),
    pacingProfile="steady",
)


class StyleTransfer:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.llm = LLMClient(api_key)

    def extract_style(self, reference_path: str) -> StyleDNA:
        prompt = f"""Analyze this reference video's editing style. Return JSON with:
- cutPattern: {{"avgShotDuration": float, "cutRate": "rapid"|"moderate"|"slow"}}
- effectVocabulary: array of effect types used (glow, shake, rgb_split, blur, etc.)
- transitionStyle: "hard_cuts"|"smooth"|"stylized"|"mixed"
- colorSignature: {{"warmth": 0-1, "contrast": 0-1, "saturation": 0-1}}
- pacingProfile: "building"|"steady"|"variable"

Reference video: {reference_path}"""

        try:
            text = self.llm.generate(prompt)

            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]

            data = json.loads(text)
            return StyleDNA(
                cutPattern=CutPattern(**data.get("cutPattern", {})),
                effectVocabulary=data.get("effectVocabulary", []),
                transitionStyle=data.get("transitionStyle", "smooth"),
                colorSignature=ColorSignature(**data.get("colorSignature", {})),
                pacingProfile=data.get("pacingProfile"),
            )
        except Exception:
            return _DEFAULT_STYLE.model_copy()
