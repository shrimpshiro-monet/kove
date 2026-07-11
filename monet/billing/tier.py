# monet/billing/tier.py
from __future__ import annotations
from enum import Enum
from fastapi import HTTPException
from typing import Optional

class Tier(str, Enum):
    FREE = "free"
    CREATOR = "creator"
    PRO = "pro"

# wire to your actual user DB
_USER_TIERS = {"demo_pro": Tier.PRO, "demo_creator": Tier.CREATOR}

def get_tier(user_id: str) -> Tier:
    return _USER_TIERS.get(user_id, Tier.FREE)

# capability matrix
ENGINE_TIER = {
    "freecut": Tier.FREE,
    "editly": Tier.CREATOR,
    "opencut": Tier.CREATOR,
    "sam_vfx": Tier.PRO,
}

TRIPTYCH_TIER = Tier.PRO   # all-4 side-by-side is Pro-only

def require_tier(user_tier: Tier, needed: Tier) -> None:
    order = [Tier.FREE, Tier.CREATOR, Tier.PRO]
    if order.index(user_tier) < order.index(needed):
        raise HTTPException(402, f"Requires {needed.value} tier")
