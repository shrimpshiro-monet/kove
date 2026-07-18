# monet/engines/freecut/executor/asset_resolver.py
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple


@dataclass
class AssetEntry:
    mediaId: str
    filePath: str
    kind: Literal["video", "audio", "image"]
    semanticName: Optional[str] = None
    durationSec: Optional[float] = None


class AssetResolver:
    def __init__(self, entries: Optional[List[AssetEntry]] = None):
        self._by_id: Dict[str, AssetEntry] = {}
        for e in entries or []:
            self.register(e)

    def register(self, entry: AssetEntry) -> None:
        self._by_id[entry.mediaId] = entry

    def resolve(self, media_id: str) -> Optional[AssetEntry]:
        return self._by_id.get(media_id)

    def assert_all_exist(self, media_ids: List[str]) -> Tuple[Dict[str, str], List[str]]:
        resolved: Dict[str, str] = {}
        unresolved: List[str] = []
        for mid in media_ids:
            e = self._by_id.get(mid)
            if not e:
                unresolved.append(mid)
                continue
            if not Path(e.filePath).exists():
                unresolved.append(f"{mid} (missing file: {e.filePath})")
                continue
            resolved[mid] = e.filePath
        return resolved, unresolved

    def to_prompt_context(self) -> str:
        lines = ["AVAILABLE ASSETS (use these exact mediaId values):"]
        for e in self._by_id.values():
            parts = [f'mediaId="{e.mediaId}"', f"kind={e.kind}"]
            if e.semanticName:
                parts.append(f'description="{e.semanticName}"')
            if e.durationSec is not None:
                parts.append(f"duration={e.durationSec:.2f}s")
            lines.append(f"- {' '.join(parts)}")
        return "\n".join(lines)
