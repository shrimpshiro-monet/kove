# monet/vibe/session.py
from __future__ import annotations
import uuid
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from monet.engines.freecut.executor.types import Action, ProjectSettings

@dataclass
class VibeSession:
    id: str
    user_id: str
    created_at: float
    prompt: str = ""
    raw_footage_path: Optional[str] = None
    reference_path: Optional[str] = None
    music_path: Optional[str] = None
    actions: List[Action] = field(default_factory=list)
    settings: ProjectSettings = field(default_factory=ProjectSettings)
    triptych_path: Optional[str] = None
    engine_outputs: Dict[str, str] = field(default_factory=dict)
    scores: Dict[str, dict] = field(default_factory=dict)
    winner: Optional[str] = None
    final_output_path: Optional[str] = None
    status: str = "draft"  # draft | planning | rendering | preview_ready | finalized


# In-memory store; swap for Postgres/Redis in prod
_SESSIONS: Dict[str, VibeSession] = {}

def create_session(user_id: str) -> VibeSession:
    sid = uuid.uuid4().hex
    s = VibeSession(id=sid, user_id=user_id, created_at=time.time())
    _SESSIONS[sid] = s
    return s

def get_session(sid: str) -> Optional[VibeSession]:
    return _SESSIONS.get(sid)
