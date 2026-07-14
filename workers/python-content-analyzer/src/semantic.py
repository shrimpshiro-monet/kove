import json
from typing import Optional
import google.generativeai as genai
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
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    def analyze_frame(self, frame: np.ndarray) -> SemanticUnderstanding:
        _, buffer = cv2.imencode('.jpg', frame)
        image_bytes = buffer.tobytes()

        prompt = """Analyze this video frame. Return JSON with:
- description: what's happening in the scene
- mood: emotional tone (confident, calm, energetic, mysterious, etc.)
- setting: where this is (indoor, outdoor, urban, nature, etc.)
- action: what the subject is doing
- confidence: how confident you are (0-1)"""

        response = self.model.generate_content([
            prompt,
            {"mime_type": "image/jpeg", "data": image_bytes}
        ])

        text = response.text.strip()
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
