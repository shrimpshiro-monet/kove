# monet/billing/middleware.py
from fastapi import Request
from .tier import get_tier

async def inject_tier(request: Request, call_next):
    uid = request.headers.get("X-User-Id", "anon")
    request.state.user_id = uid
    request.state.tier = get_tier(uid)
    return await call_next(request)
