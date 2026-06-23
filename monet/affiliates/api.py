# monet/affiliates/api.py
from fastapi import APIRouter, HTTPException, Request
from .demo_gen import build_affiliate_demo
from monet.vibe.session import get_session

router = APIRouter(prefix="/api/affiliate", tags=["affiliate"])

@router.post("/{sid}/demo")
async def make_demo(sid: str, request: Request):
    s = get_session(sid)
    if not s or not s.final_output_path or not s.raw_footage_path:
        raise HTTPException(status_code=400, detail="session not finalized")
    code = request.headers.get("X-Affiliate-Code", s.user_id)
    path = await build_affiliate_demo(s.raw_footage_path, s.final_output_path, code)
    return {"demoPath": path}
