from __future__ import annotations

from typing import Any


class MusicAnalyzer:
    """Thin wrapper around the music-analyzer service."""

    def analyze(self, music_path: str) -> dict[str, Any]:
        # In production this calls the python-music-analyzer service.
        # Stub returns a minimal music dict for orchestration testing.
        return {
            "bpm": 120,
            "beat_result": {"beats": [], "downbeats": [], "bpm": 120},
            "onsets": [],
            "sections": [],
            "energy_curve": [],
            "vocal_regions": [],
            "frequency_profile": {},
        }
