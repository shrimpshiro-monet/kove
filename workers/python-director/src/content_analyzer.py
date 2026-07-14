from __future__ import annotations

from typing import Any


class ContentAnalyzer:
    """Thin wrapper around the content-analyzer service."""

    def analyze(self, footage_path: str) -> dict[str, Any]:
        # In production this calls the python-content-analyzer service.
        # Stub returns a minimal content dict for orchestration testing.
        return {
            "faces": [],
            "objects": [],
            "depth": [],
            "motion": [],
            "scenes": [],
            "brightness": [],
            "composition": {},
            "color_palette": [],
            "semantic": {
                "description": "no analysis",
                "mood": "unknown",
                "setting": "unknown",
                "action": "unknown",
                "confidence": 0.0,
            },
        }
