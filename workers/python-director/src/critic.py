from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel

from .llm_client import LLMClient


class Issue(BaseModel):
    type: str
    description: str
    shotId: Optional[str] = None
    severity: str = "warning"


class Critique(BaseModel):
    issues: list[Issue]
    confidence: float
    alternatives: list[dict]


class Critic:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.llm = LLMClient(api_key)
        self.prompt_template = Path(__file__).parent / "prompts" / "critique-edl.txt"

    def critique(self, edl: dict, content: Any, music: Any) -> Critique:
        issues: list[Issue] = []

        # Programmatic checks
        for track in edl.get("runtime", {}).get("tracks", []):
            for clip in track.get("clips", []):
                timing = clip.get("timing", {})
                if timing.get("start", 0) % 0.5 > 0.1:
                    issues.append(Issue(
                        type="beat_sync",
                        description=f"Clip {clip.get('id')} not aligned to beat",
                        shotId=clip.get("id"),
                        severity="warning"
                    ))

        # Duration mismatch check
        track_duration = sum(
            clip.get("timing", {}).get("duration", 0)
            for track in edl.get("runtime", {}).get("tracks", [])
            for clip in track.get("clips", [])
        )
        edl_duration = edl.get("duration", 0)
        if abs(track_duration - edl_duration) > 0.5:
            issues.append(Issue(
                type="duration_mismatch",
                description=f"Track duration {track_duration} != EDL duration {edl_duration}",
                severity="error"
            ))

        # LLM critique for creative quality
        gemini_issues, gemini_confidence = self._llm_critique(edl)
        issues.extend(gemini_issues)

        confidence = 1.0 - (len(issues) * 0.1)
        if gemini_confidence is not None:
            confidence = gemini_confidence

        return Critique(
            issues=issues,
            confidence=max(0.0, confidence),
            alternatives=[]
        )

    def _llm_critique(self, edl: dict) -> tuple[list[Issue], Optional[float]]:
        template = self.prompt_template.read_text()
        prompt = template.replace("{{EDL}}", str(edl)[:2000])

        try:
            text = self.llm.generate(prompt)

            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]

            data = json.loads(text)
            issues = [Issue(**issue) for issue in data.get("issues", [])]
            confidence = data.get("confidence")
            return issues, confidence
        except Exception:
            return [], None
