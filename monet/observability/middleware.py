# monet/observability/middleware.py
import logging
import time
import uuid
import json
from fastapi import Request

logger = logging.getLogger("monet.access")

async def log_requests(request: Request, call_next):
    rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
    t0 = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - t0) * 1000
    logger.info(json.dumps({
        "rid": rid,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": round(duration_ms, 1),
        "user_id": getattr(request.state, "user_id", None),
    }))
    response.headers["X-Request-Id"] = rid
    return response
