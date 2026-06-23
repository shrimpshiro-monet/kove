# monet/session/state.py
from __future__ import annotations
import time, uuid
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional
from monet.engines.freecut.executor.types import Timeline, Action, ProjectSettings
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry


@dataclass
class ChatMessage:
    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: float
    actions_applied: List[str] = field(default_factory=list)  # action ids this msg produced
    preview_path: Optional[str] = None
    error: Optional[str] = None


@dataclass
class SegmentRenderCache:
    """Tracks which segments are rendered + their content hashes."""
    hash_to_path: Dict[str, str] = field(default_factory=dict)
    last_full_render: Optional[str] = None


@dataclass
class UnifiedSession:
    id: str
    user_id: str
    created_at: float
    settings: ProjectSettings = field(default_factory=ProjectSettings)

    # Source of truth
    timeline: Optional[Timeline] = None
    actions: List[Action] = field(default_factory=list)

    # Assets
    raw_footage_path: Optional[str] = None
    reference_path: Optional[str] = None
    music_path: Optional[str] = None
    asset_registry: Dict[str, AssetEntry] = field(default_factory=dict)

    # Chat
    chat_history: List[ChatMessage] = field(default_factory=list)

    # Style
    style_profile: Optional[dict] = None

    # Render cache for incremental re-renders
    render_cache: SegmentRenderCache = field(default_factory=SegmentRenderCache)
    current_preview_path: Optional[str] = None

    # WS-broadcast version counter
    version: int = 0

    def build_resolver(self) -> AssetResolver:
        return AssetResolver(list(self.asset_registry.values()))

    def add_message(self, role: Literal["user", "assistant", "system"], content: str, **kw) -> ChatMessage:
        msg = ChatMessage(
            id=uuid.uuid4().hex[:12], role=role, content=content,
            timestamp=time.time(), **kw,
        )
        self.chat_history.append(msg)
        return msg

    def bump_version(self) -> int:
        self.version += 1
        return self.version


_SESSIONS: Dict[str, UnifiedSession] = {}

def create(user_id: str) -> UnifiedSession:
    sid = uuid.uuid4().hex
    s = UnifiedSession(id=sid, user_id=user_id, created_at=time.time())
    _SESSIONS[sid] = s
    return s

def get(sid: str) -> Optional[UnifiedSession]:
    return _SESSIONS.get(sid)
