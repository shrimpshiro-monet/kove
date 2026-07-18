# monet/engines/freecut/api.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal

from .executor.types import Action, ProjectSettings
from .executor.asset_resolver import AssetResolver, AssetEntry
from .executor.render import render

router = APIRouter(prefix="/api/freecut", tags=["freecut"])


class AssetIn(BaseModel):
    mediaId: str
    filePath: str
    kind: Literal["video", "audio", "image"]
    semanticName: Optional[str] = None
    durationSec: Optional[float] = None


class RenderRequest(BaseModel):
    actions: List[Action]
    assets: List[AssetIn]
    settings: ProjectSettings = ProjectSettings()
    outputPath: Optional[str] = None


@router.post("/render")
async def render_endpoint(req: RenderRequest):
    resolver = AssetResolver([
        AssetEntry(**a.model_dump()) for a in req.assets
    ])
    try:
        result = await render(
            actions=req.actions,
            resolver=resolver,
            settings=req.settings,
            output_path=req.outputPath,
        )
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
