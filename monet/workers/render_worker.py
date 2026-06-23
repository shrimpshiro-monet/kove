# monet/workers/render_worker.py
"""Background worker for heavy renders (SAM, long videos)."""
from __future__ import annotations
import asyncio
import json
import redis.asyncio as redis
import os
import logging
from monet.engines.freecut.executor.types import ProjectSettings
from monet.engines.freecut.executor.asset_resolver import AssetResolver
from monet.vibe.session import get_session
from monet.vibe.pipeline import render_unison

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
logger = logging.getLogger("monet.worker")

async def main():
    r = redis.from_url(REDIS_URL)
    while True:
        _, raw = await r.blpop("render_queue")
        job = json.loads(raw)
        sid = job["sid"]
        s = get_session(sid)
        if not s:
            continue
        try:
            await render_unison(s)
            await r.publish(f"job:{sid}", json.dumps({"status": "done"}))
        except Exception as e:
            await r.publish(f"job:{sid}", json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    asyncio.run(main())
