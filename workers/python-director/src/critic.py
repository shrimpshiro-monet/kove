from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import google.generativeai as genai
from pydantic import BaseModel


class Issue(BaseModel):
    type: str
    description: str
    shotId: Optional[str] = None
    severity: str = "warning"


class Critique(BaseModel):
    issues: list[Issue]
    confidence: float
    alternatives: list[dict[str, Any]]


class Critic:
    def __init__(self, api_key: Optional[str] = None) -> None:
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.prompt_template = Path(__file__).parent / "prompts" / "critique-edl.txt"

    def critique(
        self, edl: dict[str, Any], content: Any, music: Any
    ) -> Critique:
        issues: list[Issue] = []

        # Programmatic checks
        issues.extend(self._check_beat_sync(edl))
        issues.extend(self._check_duration(edl))

        # Gemini creative critique
        gemini_issues, gemini_confidence = self._gemini_critique(edl)
        issues.extend(gemini_issues)

        # Use Gemini confidence if provided, otherwise calculate from issues
        if gemini_confidence is not None:
            confidence = gemini_confidence
        else:
            confidence = 1.0 - (len(issues) * 0.1)

        return Critique(
            issues=issues,
            confidence=max(0.0, confidence),
            alternatives=[],
        )

    def _check_beat_sync(self, edl: dict[str, Any]) -> list[Issue]:
        issues: list[Issue] = []
        tracks = edl.get("runtime", {}).get("tracks", [])

        for track in tracks:
            for clip in track.get("clips", []):
                timing = clip.get("timing", {})
                start = timing.get("start", 0)
                # Check alignment to 0.5s grid (rough beat at 120 BPM)
                if start % 0.5 > 0.1:
                    issues.append(
                        Issue(
                            type="beat_sync",
                            description=f"Clip {clip.get('id')} not aligned to beat",
                            shotId=clip.get("id"),
                            severity="warning",
                        )
                    )
        return issues

    def _check_duration(self, edl: dict[str, Any]) -> list[Issue]:
        tracks = edl.get("runtime", {}).get("tracks", [])
        total_duration = sum(
            clip.get("timing", {}).get("duration", 0)
            for track in tracks
            for clip in track.get("clips", [])
        )
        edl_duration = edl.get("duration", 0)

        if edl_duration > 0 and abs(total_duration - edl_duration) > 0.5:
            return [
                Issue(
                    type="duration_mismatch",
                    description=(
                        f"Track duration {total_duration:.1f}s != EDL duration {edl_duration:.1f}s"
                    ),
                    severity="error",
                )
            ]
        return []

    def _gemini_critique(self, edl: dict[str, Any]) -> tuple[list[Issue], Optional[float]]:
        try:
            template = self.prompt_template.read_text()
            edl_str = json.dumps(edl, default=str)[:2000]
            prompt = template.replace("{{EDL}}", edl_str)

            response = self.model.generate_content(prompt)
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]

            data = json.loads(text)
            issues = [Issue(**issue) for issue in data.get("issues", [])]
            confidence = data.get("confidence")
            return issues, confidence
        except Exception:
            return [], None
