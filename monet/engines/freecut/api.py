# monet/engines/freecut/api.py
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal

logger = logging.getLogger(__name__)

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
        logger.exception("Freecut ValueError")
        raise HTTPException(status_code=400, detail="Invalid request body")
    except RuntimeError as e:
        logger.exception("Freecut RuntimeError")
        raise HTTPException(status_code=500, detail="An internal error occurred")
