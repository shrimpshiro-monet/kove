# monet/main.py
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

# routers
from monet.engines.freecut.api import router as freecut_router
from monet.router.api import router as router_router
from monet.unison.api import router as unison_router
from monet.vibe.api import router as vibe_router
from monet.realtime.api import router as realtime_router
from monet.affiliates.api import router as affiliate_router
from monet.export.api import router as export_router
from monet.templates.api import router as templates_router
from monet.analytics.api import router as analytics_router
from monet.session.api import router as session_router

from monet.billing.middleware import inject_tier
from monet.observability.middleware import log_requests

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Monet — Vibe Editor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)
app.middleware("http")(inject_tier)
app.middleware("http")(log_requests)

for r in [freecut_router, router_router, unison_router, vibe_router,
          realtime_router, affiliate_router, export_router,
          templates_router, analytics_router, session_router]:
    app.include_router(r)

@app.get("/healthz")
async def health():
    return {"ok": True}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
