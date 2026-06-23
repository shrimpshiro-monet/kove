# monet/session/patches.py
from __future__ import annotations
from typing import List, Literal, Optional
from pydantic import BaseModel
from monet.engines.freecut.executor.types import Action


class TimelinePatch(BaseModel):
    """
    Direct editor mutation (no LLM in loop).
    Used when user drags a clip, changes a property, etc., in the timeline UI.
    """
    op: Literal["add", "remove", "update", "reorder"]
    actions: List[Action] = []         # for add/update
    target_clip_ids: List[str] = []    # for remove/update
    new_order: Optional[List[str]] = None  # for reorder


def apply_patch_to_actions(
    current_actions: List[Action], patch: TimelinePatch,
) -> List[Action]:
    """
    Apply a direct editor patch to the action list and return the new list.
    """
    if patch.op == "add":
        return current_actions + list(patch.actions)

    if patch.op == "remove":
        return [a for a in current_actions
                if getattr(a, "clipId", None) not in set(patch.target_clip_ids)]

    if patch.op == "update":
        targets = {getattr(a, "clipId"): a for a in patch.actions
                   if getattr(a, "clipId", None) is not None and a.type == "updateClip"}
        out = []
        for a in current_actions:
            cid = getattr(a, "clipId", None)
            if cid in targets:
                # Merge new properties into existing updateClip,
                # or append the updateClip after the addMedia
                if a.type == "updateClip":
                    a = a.model_copy(update={
                        "properties": a.properties.model_copy(
                            update=targets[cid].properties.model_dump(exclude_none=True)
                        )
                    })
            out.append(a)
            if cid in targets and not any(
                x.type == "updateClip" and getattr(x, "clipId", None) == cid for x in out
            ):
                out.append(targets[cid])
        return out

    if patch.op == "reorder":
        if not patch.new_order: return current_actions
        order = {cid: i for i, cid in enumerate(patch.new_order)}
        def key(a):
            cid = getattr(a, "clipId", None)
            return order.get(cid, 999)
        return sorted(current_actions, key=key)

    return current_actions


def patch_to_natural_language(patch: TimelinePatch) -> str:
    """Turn an editor patch into a sentence Gemini can read as chat context."""
    if patch.op == "add":
        names = [getattr(a, "clipId", a.type) for a in patch.actions]
        return f"User manually added: {', '.join(names)}"
    if patch.op == "remove":
        return f"User manually removed clips: {', '.join(patch.target_clip_ids)}"
    if patch.op == "update":
        diffs = []
        for a in patch.actions:
            if a.type == "updateClip":
                props = a.properties.model_dump(exclude_none=True)
                diffs.append(f"{a.clipId} → {props}")
        return f"User manually adjusted: {'; '.join(diffs)}"
    if patch.op == "reorder":
        return f"User reordered clips to: {' → '.join(patch.new_order or [])}"
    return "User made a manual edit."
