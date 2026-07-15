"""Shared utilities for LLM response parsing."""
from __future__ import annotations

import json


def extract_json(text: str) -> dict:
    """Extract JSON from LLM response that may have text before/after."""
    text = text.strip()

    # Try to find JSON in markdown fences
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()

    # Try to find JSON object directly
    if "{" in text:
        start = text.index("{")
        end = text.rindex("}") + 1
        text = text[start:end]

    return json.loads(text)
