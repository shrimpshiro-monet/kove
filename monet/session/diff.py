# monet/session/diff.py
from __future__ import annotations
import hashlib, json
from dataclasses import dataclass
from typing import List, Set, Tuple, Dict, Optional
from monet.engines.freecut.executor.types import Timeline, VideoSegment


def segment_hash(seg: VideoSegment) -> str:
    """Deterministic content hash. Two segments with the same hash render identically."""
    payload = {
        "inputPath": seg.inputPath,
        "sourceIn": round(seg.sourceIn, 4),
        "sourceOut": round(seg.sourceOut, 4),
        "playbackSpeed": round(seg.playbackSpeed, 4),
        "volume": round(seg.volume, 4),
        "mute": seg.mute,
        "effects": [
            {"kind": e.kind, "params": e.params}
            for e in getattr(seg, "effects", [])
        ],
    }
    blob = json.dumps(payload, sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()[:16]


@dataclass
class TimelineDiff:
    # Indices into the NEW timeline.videoSegments
    unchanged_indices: List[int]
    dirty_indices: List[int]
    # Map from new index → cache hit path (if any)
    cache_hits: Dict[int, str]
    captions_changed: bool
    bgm_changed: bool
    total_segments: int

    @property
    def fully_unchanged(self) -> bool:
        return (not self.dirty_indices and not self.captions_changed
                and not self.bgm_changed)

    @property
    def fully_dirty(self) -> bool:
        return len(self.dirty_indices) == self.total_segments


def diff_timelines(
    new_timeline: Timeline, hash_cache: Dict[str, str],
    old_timeline: Optional[Timeline] = None,
) -> TimelineDiff:
    """
    Returns a diff describing which segments can be reused (cache hits)
    and which need re-rendering.
    """
    dirty: List[int] = []
    unchanged: List[int] = []
    hits: Dict[int, str] = {}

    for i, seg in enumerate(new_timeline.videoSegments):
        h = segment_hash(seg)
        if h in hash_cache:
            unchanged.append(i)
            hits[i] = hash_cache[h]
        else:
            dirty.append(i)

    captions_changed = True
    bgm_changed = True
    if old_timeline:
        captions_changed = (
            [c.model_dump() for c in old_timeline.captions]
            != [c.model_dump() for c in new_timeline.captions]
        )
        bgm_changed = (
            [b.model_dump() for b in old_timeline.bgmTracks]
            != [b.model_dump() for b in new_timeline.bgmTracks]
        )

    return TimelineDiff(
        unchanged_indices=unchanged,
        dirty_indices=dirty,
        cache_hits=hits,
        captions_changed=captions_changed,
        bgm_changed=bgm_changed,
        total_segments=len(new_timeline.videoSegments),
    )
