# monet/engines/freecut/executor/drawtext.py
from __future__ import annotations
import os
import re
from typing import Optional
from .types import CaptionSegment, ProjectSettings

_FONT_CANDIDATES = {
    "Impact": [
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
        "C:\\Windows\\Fonts\\impact.ttf",
    ],
    "Arial": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ],
}


def resolve_font_file(family: str) -> str:
    for p in _FONT_CANDIDATES.get(family, _FONT_CANDIDATES["Arial"]):
        if os.path.exists(p):
            return p
    for p in _FONT_CANDIDATES["Arial"]:
        if os.path.exists(p):
            return p
    return ""


def escape_drawtext(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\\\'")
        .replace("%", "\\%")
    )


def to_ffmpeg_color(c: Optional[str], fallback="white") -> str:
    if not c:
        return fallback
    m = re.match(r"rgba?\(([^)]+)\)", c, re.I)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
        a = float(parts[3]) if len(parts) > 3 else 1.0
        hex_color = "0x" + "".join(f"{v:02x}" for v in (r, g, b))
        return f"{hex_color}@{a:.2f}"
    return c


def build_drawtext_filter(
    cap: CaptionSegment, settings: ProjectSettings,
    in_label: str, out_label: str,
) -> str:
    font = resolve_font_file(cap.style.fontFamily)
    text = escape_drawtext(cap.text)
    color = to_ffmpeg_color(cap.style.color, "white")
    bg = to_ffmpeg_color(cap.style.backgroundColor, "")

    x = ("40" if cap.style.textAlign == "left"
         else "w-text_w-40" if cap.style.textAlign == "right"
         else "(w-text_w)/2")
    y = ("60" if cap.style.verticalAlign == "top"
         else "h-text_h-120" if cap.style.verticalAlign == "bottom"
         else "(h-text_h)/2")

    parts = [
        f"text='{text}'",
        f"fontfile='{font}'" if font else "",
        f"fontcolor={color}",
        f"fontsize={cap.style.fontSize}",
        f"x={x}", f"y={y}",
        f"enable='between(t,{cap.startTime:.3f},{(cap.startTime+cap.duration):.3f})'",
    ]
    if bg:
        parts += ["box=1", f"boxcolor={bg}", "boxborderw=20"]
    if cap.style.strokeColor and cap.style.strokeWidth:
        parts += [
            f"bordercolor={to_ffmpeg_color(cap.style.strokeColor)}",
            f"borderw={int(cap.style.strokeWidth)}",
        ]
    return f"{in_label}drawtext={':'.join(p for p in parts if p)}{out_label}"
