"""scripts/analyzers/thresholds.py — Load per-genre threshold profiles."""

import os
import yaml
from typing import Any, Optional

_THRESHOLDS: Optional[dict[str, Any]] = None


def _load() -> dict[str, Any]:
    global _THRESHOLDS
    if _THRESHOLDS is not None:
        return _THRESHOLDS
    path = os.path.join(os.path.dirname(__file__), "thresholds.yaml")
    with open(path) as f:
        _THRESHOLDS = yaml.safe_load(f)
    return _THRESHOLDS


def get_threshold(genre: str, *keys: str, default: Any = None) -> Any:
    """Walk the thresholds tree by keys, falling back to generic profile."""
    profile = _load()
    d = profile.get(genre, {})
    if not d:
        d = profile.get("generic", {})
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k)
        else:
            return default
    return d if d is not None else default


def get_profile(genre: str) -> dict[str, Any]:
    """Return the full threshold profile for a genre (fallback to generic)."""
    return _load().get(genre, _load().get("generic", {}))
