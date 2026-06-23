# monet/engines/motion/follow_caption.py
from __future__ import annotations
from monet.engines.freecut.executor.types import CaptionSegment

def build_motion_drawtext(cap: CaptionSegment, track) -> str:
    """Build a drawtext x/y expression that follows the tracked bbox."""
    if not track:
        return ""
    # Build piecewise expr: between t=tN and tN+1, use linear interp
    # FFmpeg expr engine is limited — use sendcmd or fallback to evenly spaced steps
    points = [(t, x + w//2, y - 40) for (t, x, y, w, h) in track]
    # simplest: nearest-neighbor sample table via if-chain
    x_expr = "0"
    y_expr = "0"
    for t, cx, cy in reversed(points):
        x_expr = f"if(gte(t,{t:.3f}),{cx},{x_expr})"
        y_expr = f"if(gte(t,{t:.3f}),{cy},{y_expr})"
    return f"x='{x_expr}':y='{y_expr}'"
