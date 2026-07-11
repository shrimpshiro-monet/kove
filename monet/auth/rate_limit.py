# monet/auth/rate_limit.py
from __future__ import annotations
import time
import asyncio
from collections import defaultdict, deque
from fastapi import HTTPException, Request

# Token bucket per user_id
_buckets: dict[str, deque[float]] = defaultdict(deque)
_lock = asyncio.Lock()

LIMITS = {
    "free":    {"requests_per_min": 10, "renders_per_hour": 5},
    "creator": {"requests_per_min": 60, "renders_per_hour": 50},
    "pro":     {"requests_per_min": 300, "renders_per_hour": 500},
}

async def check_rate(request: Request, kind: str = "requests_per_min"):
    tier = getattr(request.state, "tier", "free")
    tier_str = tier.value if hasattr(tier, "value") else str(tier)
    if tier_str not in LIMITS:
        tier_str = "free"
    
    uid = getattr(request.state, "user_id", "anon")
    limit = LIMITS[tier_str][kind]
    window = 60 if kind.endswith("_min") else 3600
    now = time.time()
    async with _lock:
        bucket = _buckets[f"{uid}:{kind}"]
        while bucket and bucket[0] < now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(429, f"Rate limit: {limit}/{kind}")
        bucket.append(now)
