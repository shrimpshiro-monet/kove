# monet/router/api.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal
from monet.engines.freecut.executor.types import Action, ProjectSettings
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry
from .dispatch import run_via_router
from .router import pick_engine, infer_capabilities, score_engines

router = APIRouter(prefix="/api/router", tags=["router"])


class AssetIn(BaseModel):
    mediaId: str
    filePath: str
    kind: Literal["video", "audio", "image"]
    semanticName: Optional[str] = None
    durationSec: Optional[float] = None


class RouteRequest(BaseModel):
    actions: List[Action]
    assets: List[AssetIn]
    settings: ProjectSettings = ProjectSettings()
    outputPath: Optional[str] = None
    multiPass: bool = False
    forceEngine: Optional[Literal["freecut", "editly", "opencut"]] = None


@router.post("/render")
async def route_and_render(req: RouteRequest):
    resolver = AssetResolver([AssetEntry(**a.model_dump()) for a in req.assets])
    if req.forceEngine:
        # bypass router
        from .dispatch import _run_engine
        from monet.engines.freecut.executor.timeline_builder import build_timeline
        timeline = await build_timeline(req.actions, resolver, req.settings)
        try:
            result = await _run_engine(req.forceEngine, req.actions, resolver,
                                       req.settings, timeline, req.outputPath)
            return result.model_dump()
        except Exception as e:
            raise HTTPException(500, str(e))
    try:
        result = await run_via_router(req.actions, resolver, req.settings,
                                      req.outputPath, multi_pass=req.multiPass)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(500, detail=str(e))


@router.post("/plan/inspect")
async def inspect_plan(req: RouteRequest):
    """Dry-run: show which engine would be picked + scores. No render."""
    caps = infer_capabilities(req.actions)
    scores = score_engines(caps)
    return {
        "inferredCapabilities": sorted(c.value for c in caps),
        "scores": [
            {"engine": s.engine.name, "score": round(s.score, 3),
             "quality": round(s.quality, 3), "cost": s.cost,
             "missing": [m.value for m in s.missing],
             "notes": s.engine.notes}
            for s in scores
        ],
        "pick": scores[0].engine.name,
    }
