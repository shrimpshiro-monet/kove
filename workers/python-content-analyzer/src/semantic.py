import json
import os
from typing import Optional

from openai import OpenAI
from pydantic import BaseModel
import numpy as np
import cv2


class SemanticUnderstanding(BaseModel):
    description: str
    mood: str
    setting: str
    action: str
    confidence: float


class SemanticAnalyzer:
    def __init__(self, api_key: Optional[str] = None):
        self.client = OpenAI(
            api_key=api_key or os.environ.get("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
        )
        self.model = "llama-3.3-70b-versatile"

    def analyze_frame(self, frame: np.ndarray) -> SemanticUnderstanding:
        _, buffer = cv2.imencode('.jpg', frame)
        import base64
        image_b64 = base64.b64encode(buffer).decode('utf-8')

        prompt = """Analyze this video frame. Return JSON with:
- description: what's happening in the scene
- mood: emotional tone (confident, calm, energetic, mysterious, etc.)
- setting: where this is (indoor, outdoor, urban, nature, etc.)
- action: what the subject is doing
- confidence: how confident you are (0-1)"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                ],
            }],
            temperature=0.7,
            max_tokens=4096,
        )

        text = response.choices[0].message.content.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]

        data = json.loads(text)
        return SemanticUnderstanding(**data)

    def analyze_frames(self, frames: list, sample_rate: int = 1) -> list:
        """Analyze multiple frames, sampling every Nth frame."""
        results = []
        for i, frame in enumerate(frames):
            if i % sample_rate == 0:
                results.append(self.analyze_frame(frame))
        return results
