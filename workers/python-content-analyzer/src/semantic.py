from __future__ import annotations

import json
from typing import Optional

import cv2
import numpy as np
from pydantic import BaseModel

from .llm_client import LLMClient


class SemanticUnderstanding(BaseModel):
    description: str
    mood: str
    setting: str
    action: str
    confidence: float


class SemanticAnalyzer:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.llm = LLMClient(api_key)

    def analyze_frame(self, frame: np.ndarray) -> SemanticUnderstanding:
        # Encode frame as base64 for vision models
        _, buffer = cv2.imencode('.jpg', frame)
        import base64
        image_b64 = base64.b64encode(buffer).decode('utf-8')

        prompt = f"""Analyze this video frame. Return JSON with:
- description: what's happening in the scene
- mood: emotional tone (confident, calm, energetic, mysterious, etc.)
- setting: where this is (indoor, outdoor, urban, nature, etc.)
- action: what the subject is doing
- confidence: how confident you are (0-1)

Image (base64): {image_b64[:100]}...[truncated]"""

        try:
            text = self.llm.generate(prompt)

            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]

            data = json.loads(text)
            return SemanticUnderstanding(**data)
        except Exception:
            return SemanticUnderstanding(
                description="Analysis unavailable",
                mood="unknown",
                setting="unknown",
                action="unknown",
                confidence=0.0,
            )

    def analyze_frames(self, frames: list[np.ndarray], sample_rate: int = 1) -> list[SemanticUnderstanding]:
        results = []
        for i, frame in enumerate(frames):
            if i % sample_rate == 0:
                results.append(self.analyze_frame(frame))
        return results
