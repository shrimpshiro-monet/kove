# monet/analytics/api.py
from fastapi import APIRouter
from .store import summary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/engines")
async def engine_summary(hours: int = 168):
    return {"window_hours": hours, "engines": summary(hours)}
