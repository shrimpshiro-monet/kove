# monet/engines/sam_vfx/compiler.py
from __future__ import annotations
from dataclasses import dataclass
from typing import List
from monet.engines.freecut.executor.types import Timeline, VideoSegment
from .types import SamVfxOp


@dataclass
class SamRenderPlan:
    timeline: Timeline
    ops: List[SamVfxOp]
    # Map clipId → which video segments correspond to it after timeline build
    # (one clipId can yield multiple segments after split)


def compile_to_sam_plan(timeline: Timeline, ops: List[SamVfxOp]) -> SamRenderPlan:
    return SamRenderPlan(timeline=timeline, ops=ops)
