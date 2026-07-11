# monet/session/sync.py
from __future__ import annotations
import asyncio, json, logging
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("monet.sync")


class SyncHub:
    """Per-session pub/sub for chat + editor + render events."""
    def __init__(self):
        self._subs: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, sid: str, ws: WebSocket):
        async with self._lock:
            self._subs.setdefault(sid, set()).add(ws)

    async def unsubscribe(self, sid: str, ws: WebSocket):
        async with self._lock:
            if sid in self._subs:
                self._subs[sid].discard(ws)
                if not self._subs[sid]:
                    self._subs.pop(sid, None)

    async def broadcast(self, sid: str, event: str, payload: dict):
        msg = json.dumps({"event": event, **payload})
        dead = []
        for ws in list(self._subs.get(sid, [])):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.unsubscribe(sid, ws)


hub = SyncHub()
