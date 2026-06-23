# monet/collab/presence.py
from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Set, List
import time

@dataclass
class Presence:
    user_id: str
    cursor: dict = None   # last action they hovered/edited
    last_seen: float = 0

_room: Dict[str, Dict[str, Presence]] = defaultdict(dict)

def join(sid: str, user_id: str):
    _room[sid][user_id] = Presence(user_id=user_id, last_seen=time.time())

def leave(sid: str, user_id: str):
    _room[sid].pop(user_id, None)

def update_cursor(sid: str, user_id: str, cursor: dict):
    if user_id in _room[sid]:
        _room[sid][user_id].cursor = cursor
        _room[sid][user_id].last_seen = time.time()

def list_users(sid: str) -> List[dict]:
    return [{"user_id": p.user_id, "cursor": p.cursor} for p in _room[sid].values()]
