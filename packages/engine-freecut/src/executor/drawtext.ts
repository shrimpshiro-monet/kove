// packages/engine-freecut/src/executor/drawtext.ts
import { CaptionSegment, ProjectSettings } from "./types";
import fs from "fs";

const FONT_PATHS: Record<string, string[]> = {
  Impact: [
    "/System/Library/Fonts/Supplemental/Impact.ttf",          // macOS
    "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",     // Linux (msttcorefonts)
    "C:\\Windows\\Fonts\\impact.ttf",                          // Windows
  ],
  Arial: [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
  ],
};

export function resolveFontFile(family: string): string {
  const candidates = FONT_PATHS[family] ?? FONT_PATHS.Arial;
  for (const p of candidates) if (fs.existsSync(p)) return p;
  // last-resort fallback so render doesn't crash
  return FONT_PATHS.Arial.find((p) => fs.existsSync(p)) ?? "";
}

/** drawtext requires escaping certain chars */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\\\'")
    .replace(/%/g, "\\%");
}

/** Parse rgba(r,g,b,a) or hex/named color to FFmpeg color@opacity form */
export function toFFmpegColor(c: string | undefined, fallback = "white"): string {
  if (!c) return fallback;
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((x) => x.trim());
    const r = +parts[0], g = +parts[1], b = +parts[2];
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    const hex = `0x${[r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
    return `${hex}@${a.toFixed(2)}`;
  }
  return c;
}

export function buildDrawtextFilter(
  cap: CaptionSegment,
  settings: ProjectSettings,
  inputLabel: string,
  outputLabel: string
): string {
  const font = resolveFontFile(cap.style.fontFamily);
  const text = escapeDrawtext(cap.text);
  const color = toFFmpegColor(cap.style.color, "white");
  const bg = toFFmpegColor(cap.style.backgroundColor, "");
  const size = cap.style.fontSize;

  const x =
    cap.style.textAlign === "left"
      ? "40"
      : cap.style.textAlign === "right"
      ? "w-text_w-40"
      : "(w-text_w)/2";
  const y =
    cap.style.verticalAlign === "top"
      ? "60"
      : cap.style.verticalAlign === "bottom"
      ? "h-text_h-120"
      : "(h-text_h)/2";

  const parts = [
    `text='${text}'`,
    font ? `fontfile='${font}'` : "",
    `fontcolor=${color}`,
    `fontsize=${size}`,
    `x=${x}`,
    `y=${y}`,
    `enable='between(t,${cap.startTime.toFixed(3)},${(cap.startTime + cap.duration).toFixed(3)})'`,
  ];
  if (bg) {
    parts.push(`box=1`, `boxcolor=${bg}`, `boxborderw=20`);
  }
  if (cap.style.strokeColor && cap.style.strokeWidth) {
    parts.push(
      `bordercolor=${toFFmpegColor(cap.style.strokeColor)}`,
      `borderw=${cap.style.strokeWidth}`
    );
  }

  return `${inputLabel}drawtext=${parts.filter(Boolean).join(":")}${outputLabel}`;
}
