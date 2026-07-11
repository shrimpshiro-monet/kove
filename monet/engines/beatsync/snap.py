# monet/engines/beatsync/snap.py
from __future__ import annotations
from typing import List
from monet.engines.freecut.executor.types import Action, AddMediaAction


def snap_to_beats(actions: List[Action], beats: List[float],
                  tolerance: float = 0.25) -> List[Action]:
    """Shift addMedia startTimes to nearest beat within tolerance."""
    if not beats:
        return actions
    out: List[Action] = []
    for a in actions:
        if isinstance(a, AddMediaAction):
            nearest = min(beats, key=lambda b: abs(b - a.startTime))
            if abs(nearest - a.startTime) <= tolerance:
                a = a.model_copy(update={"startTime": nearest})
        out.append(a)
    return out
