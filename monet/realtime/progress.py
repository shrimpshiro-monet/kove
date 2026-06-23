# monet/realtime/progress.py
from __future__ import annotations
import asyncio
import json
import logging
from collections import defaultdict
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("monet.realtime")


class ProgressHub:
    """Pub/sub for per-session render progress. Multi-client safe."""
    def __init__(self):
        self._subs: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, sid: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subs[sid].add(ws)

    async def unsubscribe(self, sid: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subs[sid].discard(ws)
            if not self._subs[sid]:
                self._subs.pop(sid, None)

    async def emit(self, sid: str, event: str, payload: dict) -> None:
        msg = json.dumps({"event": event, **payload})
        dead = []
        for ws in list(self._subs.get(sid, [])):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.unsubscribe(sid, ws)


hub = ProgressHub()
