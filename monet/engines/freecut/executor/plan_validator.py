# monet/engines/freecut/executor/plan_validator.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict

from .types import Action
from .asset_resolver import AssetResolver


@dataclass
class ValidationResult:
    ok: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    mediaIds: List[str] = field(default_factory=list)


def validate_plan(actions: List[Action], resolver: AssetResolver) -> ValidationResult:
    errors: List[str] = []
    warnings: List[str] = []
    media_ids: List[str] = []
    declared_clips: Dict[str, str] = {}

    for i, a in enumerate(actions):
        where = f"actions[{i}] ({a.type})"

        if a.type == "addMedia":
            if not a.mediaId:
                errors.append(f"{where}: missing mediaId")
            if a.clipId in declared_clips:
                warnings.append(f'{where}: duplicate clipId "{a.clipId}"')
            declared_clips[a.clipId] = a.trackId
            media_ids.append(a.mediaId)

        elif a.type == "split":
            if a.clipId not in declared_clips:
                errors.append(f'{where}: unknown clipId "{a.clipId}"')
            if a.time <= 0:
                errors.append(f"{where}: split time must be > 0")
            declared_clips[f"{a.clipId}_segment_1"] = a.trackId
            declared_clips[f"{a.clipId}_segment_2"] = a.trackId

        elif a.type == "updateClip":
            if a.clipId not in declared_clips:
                errors.append(f'{where}: unknown clipId "{a.clipId}"')
            sp = a.properties.playbackSpeed
            if sp is not None and not (0.1 <= sp <= 4.0):
                errors.append(f"{where}: playbackSpeed {sp} out of range [0.1,4.0]")

        elif a.type == "addCaption":
            if not a.text:
                errors.append(f"{where}: text required")
            if a.duration <= 0:
                errors.append(f"{where}: duration must be > 0")

        elif a.type == "removeClip":
            if a.clipId not in declared_clips:
                warnings.append(f'{where}: removeClip unknown clipId "{a.clipId}"')

    resolved, unresolved = resolver.assert_all_exist(list(set(media_ids)))
    for u in unresolved:
        errors.append(f"unresolved media: {u}")

    return ValidationResult(ok=len(errors) == 0, errors=errors, warnings=warnings, mediaIds=media_ids)
