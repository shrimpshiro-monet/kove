# monet/auth/jwt_auth.py
from __future__ import annotations
import os
import time
import jwt
from fastapi import HTTPException, Header
from typing import Optional

JWT_SECRET = os.getenv("MONET_JWT_SECRET", "dev-secret-change-me")

def make_token(user_id: str, tier: str = "free", ttl: int = 86400) -> str:
    return jwt.encode(
        {"sub": user_id, "tier": tier, "exp": time.time() + ttl},
        JWT_SECRET, algorithm="HS256",
    )

def require_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
