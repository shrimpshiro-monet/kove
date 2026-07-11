# monet/realtime/api.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .progress import hub
import json
from monet.collab.presence import join, leave, update_cursor, list_users

router = APIRouter(prefix="/api/ws", tags=["realtime"])


@router.websocket("/session/{sid}")
async def ws_session(ws: WebSocket, sid: str):
    await ws.accept()
    await hub.subscribe(sid, ws)
    try:
        while True:
            await ws.receive_text()  # keepalive pings
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unsubscribe(sid, ws)


@router.websocket("/collab/{sid}")
async def ws_collab(ws: WebSocket, sid: str):
    await ws.accept()
    uid = ws.query_params.get("user_id", "anon")
    join(sid, uid)
    await hub.subscribe(sid, ws)
    await hub.emit(sid, "presence.update", {"users": list_users(sid)})
    try:
        while True:
            msg_text = await ws.receive_text()
            try:
                msg = json.loads(msg_text)
            except Exception:
                continue
            if msg.get("type") == "cursor":
                update_cursor(sid, uid, msg.get("cursor"))
                await hub.emit(sid, "presence.update", {"users": list_users(sid)})
            elif msg.get("type") == "edit":
                # broadcast collaborative edit
                await hub.emit(sid, "edit.applied", {"by": uid, "patch": msg.get("patch")})
    except WebSocketDisconnect:
        pass
    finally:
        leave(sid, uid)
        await hub.unsubscribe(sid, ws)
        await hub.emit(sid, "presence.update", {"users": list_users(sid)})
