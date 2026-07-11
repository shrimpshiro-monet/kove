# monet/vibe/api.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os
import tempfile
import uuid
import shutil

from monet.engines.freecut.executor.types import ProjectSettings
from .session import create_session, get_session
from .pipeline import plan_session, render_unison, finalize

router = APIRouter(prefix="/api/vibe", tags=["vibe"])

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "monet-uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _save_upload(f: UploadFile) -> str:
    ext = os.path.splitext(f.filename or "")[1] or ".bin"
    path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}{ext}")
    with open(path, "wb") as out:
        shutil.copyfileobj(f.file, out)
    return path


@router.post("/session")
async def new_session(user_id: str = "anon"):
    s = create_session(user_id)
    return {"sessionId": s.id, "status": s.status}


@router.post("/{sid}/upload")
async def upload_assets(
    sid: str,
    raw: Optional[UploadFile] = File(None),
    reference: Optional[UploadFile] = File(None),
    music: Optional[UploadFile] = File(None),
):
    s = get_session(sid)
    if not s:
        raise HTTPException(404, "session not found")
    if raw:
        s.raw_footage_path = _save_upload(raw)
    if reference:
        s.reference_path = _save_upload(reference)
    if music:
        s.music_path = _save_upload(music)
    return {"raw": s.raw_footage_path, "reference": s.reference_path,
            "music": s.music_path}


class PromptReq(BaseModel):
    prompt: str
    settings: Optional[ProjectSettings] = None


@router.post("/{sid}/prompt")
async def set_prompt_and_plan(sid: str, req: PromptReq):
    s = get_session(sid)
    if not s:
        raise HTTPException(404, "session not found")
    s.prompt = req.prompt
    if req.settings:
        s.settings = req.settings
    if not s.raw_footage_path:
        raise HTTPException(400, "upload raw footage before prompting")
    hint = await plan_session(s)
    return {
        "status": s.status,
        "actionCount": len(s.actions),
        "hint": hint.model_dump() if hint else None,
    }


@router.post("/{sid}/render")
async def render_all_engines(sid: str):
    s = get_session(sid)
    if not s:
        raise HTTPException(404, "session not found")
    if not s.actions:
        raise HTTPException(400, "no plan generated yet, call /prompt first")
    result = await render_unison(s)
    return {"status": s.status, **result}


class FinalizeReq(BaseModel):
    engine: Optional[str] = None  # if None, use auto-winner


@router.post("/{sid}/finalize")
async def finalize_pick(sid: str, req: FinalizeReq):
    s = get_session(sid)
    if not s:
        raise HTTPException(404, "session not found")
    try:
        path = await finalize(s, req.engine)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"status": s.status, "finalPath": path,
            "engine": req.engine or s.winner}


@router.get("/file")
async def serve_file(path: str = Query(...)):
    # SECURITY: in prod, validate path is under known safe dirs (uploads/tmp output)
    safe_roots = ["/tmp", "/var/folders", tempfile.gettempdir(), os.path.realpath(tempfile.gettempdir())]
    abs_path = os.path.realpath(path)
    if not any(abs_path.startswith(os.path.realpath(r)) for r in safe_roots):
        raise HTTPException(403, "forbidden path")
    if not os.path.exists(path):
        raise HTTPException(404, "not found")
    return FileResponse(path)


@router.get("/{sid}")
async def get_status(sid: str):
    s = get_session(sid)
    if not s:
        raise HTTPException(404, "session not found")
    return {
        "id": s.id, "status": s.status, "prompt": s.prompt,
        "actionCount": len(s.actions),
        "winner": s.winner, "engines": list(s.engine_outputs.keys()),
        "scores": s.scores, "triptychPath": s.triptych_path,
        "finalPath": s.final_output_path,
    }
