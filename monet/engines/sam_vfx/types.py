# monet/engines/sam_vfx/types.py
from __future__ import annotations
from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel

class SamVfxOp(BaseModel):
    """A single SAM/depth operation on one video segment."""
    op: Literal["mask_subject", "depth_vfx", "rotoscope", "bg_replace"]
    clipId: str
    # mask_subject: extract subject, dim background
    # depth_vfx: parallax/zoom based on depth map
    # rotoscope: motion-tracked outline
    # bg_replace: replace background with another clip/color
    params: Dict[str, Any] = {}
