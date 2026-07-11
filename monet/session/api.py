# monet/session/api.py
from __future__ import annotations
import os, shutil, tempfile, uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from monet.engines.freecut.executor.types import ProjectSettings, Timeline
from monet.engines.freecut.executor.asset_resolver import AssetEntry
from monet.engines.freecut.executor.ffprobe import probe_duration
from monet.engines.freecut.executor.plan_validator import validate_plan
from monet.engines.freecut.executor.timeline_builder import build_timeline

from .state import create, get, UnifiedSession
from .chat import handle_chat_message
from .patches import TimelinePatch, apply_patch_to_actions, patch_to_natural_language
from .incremental import incremental_render
from .sync import hub

router = APIRouter(prefix="/api/session", tags=["session"])


# ---------- helpers ----------

def _save_upload(f: UploadFile) -> str:
    ext = os.path.splitext(f.filename or "")[1] or ".bin"
    p = os.path.join(tempfile.gettempdir(),
                     f"sess{uuid.uuid4().hex}{ext}")
    with open(p, "wb") as o:
        shutil.copyfileobj(f.file, o)
    return p


async def _register_asset(session: UnifiedSession, media_id: str,
                          path: str, kind: str, semantic: str):
    dur = await probe_duration(path)
    entry = AssetEntry(mediaId=media_id, filePath=path, kind=kind,
                       semanticName=semantic, durationSec=dur)
    session.asset_registry[media_id] = entry


async def _rebuild_and_render(session: UnifiedSession):
    """Re-validate, rebuild timeline, incrementally render. Broadcast events."""
    resolver = session.build_resolver()
    val = validate_plan(session.actions, resolver)
    if not val.ok:
        await hub.broadcast(session.id, "validation.failed",
                            {"errors": val.errors})
        raise HTTPException(400, "validation failed: " + "; ".join(val.errors))

    old_timeline = session.timeline
    new_timeline = await build_timeline(session.actions, resolver, session.settings)
    session.timeline = new_timeline

    await hub.broadcast(session.id, "timeline.updated", {
        "version": session.bump_version(),
        "duration": new_timeline.duration,
        "segments": len(new_timeline.videoSegments),
        "captions": len(new_timeline.captions),
        "actions": [a.model_dump() for a in session.actions],
    })

    output, stats = await incremental_render(session, new_timeline, old_timeline)
    await hub.broadcast(session.id, "preview.ready", {
        "previewPath": output, "stats": stats,
        "version": session.version,
    })
    return output, stats


# ---------- endpoints ----------

@router.post("")
async def new_session(user_id: str = "anon"):
    s = create(user_id)
    return {"sessionId": s.id, "version": s.version}


@router.post("/{sid}/upload")
async def upload(
    sid: str,
    raw: Optional[UploadFile] = File(None),
    reference: Optional[UploadFile] = File(None),
    music: Optional[UploadFile] = File(None),
):
    s = get(sid)
    if not s: raise HTTPException(404, "session not found")
    if raw:
        s.raw_footage_path = _save_upload(raw)
        await _register_asset(s, "raw_footage", s.raw_footage_path,
                              "video", "user's raw footage")
    if reference:
        s.reference_path = _save_upload(reference)
        await _register_asset(s, "reference_video", s.reference_path,
                              "video", "reference style video")
    if music:
        s.music_path = _save_upload(music)
        await _register_asset(s, "bgm_main", s.music_path,
                              "audio", "background music")
    await hub.broadcast(sid, "assets.updated",
                        {"assets": list(s.asset_registry.keys())})
    return {"assets": list(s.asset_registry.keys())}


class MessageReq(BaseModel):
    text: str


@router.post("/{sid}/message")
async def post_message(sid: str, req: MessageReq):
    """User sent a chat message. Plan + apply + render."""
    s = get(sid)
    if not s: raise HTTPException(404, "session not found")

    await hub.broadcast(sid, "chat.user", {"text": req.text})

    asst_msg, new_actions, style = await handle_chat_message(s, req.text)

    await hub.broadcast(sid, "chat.assistant", {
        "id": asst_msg.id, "text": asst_msg.content,
        "actionsAttached": len(new_actions),
    })
    if style:
        await hub.broadcast(sid, "style.detected", {"summary": style.summary})

    # If the assistant produced actions, apply them
    if new_actions:
        s.actions = s.actions + list(new_actions)
        try:
            output, stats = await _rebuild_and_render(s)
            asst_msg.preview_path = output
            return {
                "assistant": {"id": asst_msg.id, "text": asst_msg.content},
                "previewPath": output, "stats": stats,
                "actionCount": len(s.actions),
            }
        except HTTPException as e:
            asst_msg.error = str(e.detail)
            await hub.broadcast(sid, "chat.error", {"id": asst_msg.id, "error": str(e.detail)})
            raise

    # Conversational reply only
    return {
        "assistant": {"id": asst_msg.id, "text": asst_msg.content},
        "actionCount": len(s.actions),
    }


@router.post("/{sid}/patch")
async def post_patch(sid: str, patch: TimelinePatch):
    """User dragged/edited something in the visual editor directly."""
    s = get(sid)
    if not s: raise HTTPException(404, "session not found")

    s.actions = apply_patch_to_actions(s.actions, patch)

    # Inject as system chat msg so Gemini sees future context with this edit
    nl = patch_to_natural_language(patch)
    s.add_message("system", nl)
    await hub.broadcast(sid, "chat.system", {"text": nl})

    output, stats = await _rebuild_and_render(s)
    return {"previewPath": output, "stats": stats,
            "actionCount": len(s.actions), "version": s.version}


@router.get("/{sid}")
async def get_state(sid: str):
    s = get(sid)
    if not s: raise HTTPException(404)
    return {
        "id": s.id,
        "version": s.version,
        "actions": [a.model_dump() for a in s.actions],
        "duration": s.timeline.duration if s.timeline else 0,
        "captions": ([c.model_dump() for c in s.timeline.captions]
                     if s.timeline else []),
        "segments": ([{
            "inputPath": v.inputPath, "sourceIn": v.sourceIn,
            "sourceOut": v.sourceOut, "playbackSpeed": v.playbackSpeed,
            "timelineStart": v.timelineStart,
            "effects": [{"kind": e.kind, "params": e.params}
                        for e in getattr(v, "effects", [])],
        } for v in s.timeline.videoSegments] if s.timeline else []),
        "chat": [
            {"id": m.id, "role": m.role, "content": m.content,
             "timestamp": m.timestamp, "previewPath": m.preview_path,
             "error": m.error}
            for m in s.chat_history
        ],
        "styleProfile": s.style_profile,
        "currentPreview": s.current_preview_path,
        "assets": list(s.asset_registry.keys()),
    }


@router.get("/{sid}/file")
async def serve_file(sid: str, path: str):
    s = get(sid)
    if not s: raise HTTPException(404)
    safe_roots = ["/tmp", "/var/folders", tempfile.gettempdir()]
    if not any(os.path.abspath(path).startswith(os.path.abspath(r)) for r in safe_roots):
        raise HTTPException(403)
    if not os.path.exists(path): raise HTTPException(404)
    return FileResponse(path)


@router.websocket("/{sid}/ws")
async def ws_session(ws: WebSocket, sid: str):
    s = get(sid)
    if not s:
        await ws.close(code=4004); return
    await ws.accept()
    await hub.subscribe(sid, ws)
    # send snapshot on connect
    state = await get_state(sid)
    await ws.send_json({"event": "snapshot", **state})
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unsubscribe(sid, ws)
