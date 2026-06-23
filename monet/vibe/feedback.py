# monet/vibe/feedback.py
from __future__ import annotations
from pydantic import BaseModel
from typing import List, Optional

class Feedback(BaseModel):
    """User feedback for re-planning."""
    notes: str                            # "caption too small, dim more"
    keep_actions: List[str] = []          # clipIds the user liked
    drop_actions: List[str] = []          # clipIds they hated
    target_engine: Optional[str] = None   # bias planner toward an engine's strengths
    intensity: float = 0.5                # 0 = subtle tweak, 1 = full re-imagining
