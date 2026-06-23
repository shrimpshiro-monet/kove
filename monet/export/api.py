# monet/export/api.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .exporter import export_for_platform
from monet.vibe.session import get_session

router = APIRouter(prefix="/api/export", tags=["export"])

class ExportReq(BaseModel):
    platform: str  # tiktok | reels | shorts | x_post | youtube | square

@router.post("/{sid}")
async def export(sid: str, req: ExportReq):
    s = get_session(sid)
    if not s or not s.final_output_path:
        raise HTTPException(status_code=400, detail="finalize the session first")
    path = await export_for_platform(s.final_output_path, req.platform)
    return {"platform": req.platform, "path": path}
