# monet/unison/api.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal

from monet.engines.freecut.executor.types import Action, ProjectSettings
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry
from monet.engines.sam_vfx.types import SamVfxOp
from .harness import run_unison
from .scorer import score_runs, pick_winner
from .triptych import build_triptych

router = APIRouter(prefix="/api/unison", tags=["unison"])


class AssetIn(BaseModel):
    mediaId: str
    filePath: str
    kind: Literal["video", "audio", "image"]
    semanticName: Optional[str] = None
    durationSec: Optional[float] = None


class UnisonRequest(BaseModel):
    actions: List[Action]
    assets: List[AssetIn]
    settings: ProjectSettings = ProjectSettings()
    engines: Optional[List[Literal["freecut", "editly", "opencut", "sam_vfx"]]] = None
    samOps: List[SamVfxOp] = []
    buildTriptych: bool = True


@router.post("/render")
async def unison_render(req: UnisonRequest):
    resolver = AssetResolver([AssetEntry(**a.model_dump()) for a in req.assets])
    try:
        report = await run_unison(
            actions=req.actions, resolver=resolver, settings=req.settings,
            sam_ops=req.samOps or None, engines=req.engines,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    scores = await score_runs(report,
                              target_width=req.settings.width,
                              target_height=req.settings.height)
    winner = pick_winner(scores)
    report.winner = winner

    triptych = None
    if req.buildTriptych:
        try:
            triptych = await build_triptych(report)
            report.triptychPath = triptych
        except Exception as e:
            # triptych failure shouldn't kill the report
            pass

    return {
        "runs": [
            {"engine": r.engine, "success": r.success,
             "outputPath": r.outputPath, "renderTimeSec": r.renderTimeSec,
             "durationSec": r.durationSec, "error": r.error}
            for r in report.runs
        ],
        "scores": scores,
        "winner": winner,
        "triptychPath": triptych,
    }
