# monet/templates/api.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from monet.vibe.session import get_session
from .library import list_templates, apply_template

router = APIRouter(prefix="/api/templates", tags=["templates"])

@router.get("/")
async def templates():
    return list_templates()

class ApplyReq(BaseModel):
    sid: str
    template_id: str
    params: dict = {}

@router.post("/apply")
async def apply(req: ApplyReq):
    s = get_session(req.sid)
    if not s:
        raise HTTPException(404)
    try:
        s.actions = apply_template(req.template_id, req.params)
        s.status = "planned"
        return {"actionCount": len(s.actions)}
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
