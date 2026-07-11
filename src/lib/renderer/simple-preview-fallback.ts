import type { MonetEDL, Shot } from "../../server/types/edl";

export interface SimplePreviewFallbackOptions {
  reason: string;
  currentTime: number;
  width: number;
  height: number;
}

function getShotEnd(shot: Shot): number {
  return shot.timing.startTime + shot.timing.duration;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0.00s";
  return `${seconds.toFixed(2)}s`;
}

export function drawSimplePreviewFallback(
  ctx: CanvasRenderingContext2D,
  edl: MonetEDL,
  options: SimplePreviewFallbackOptions
): void {
  const { width, height, reason, currentTime } = options;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#05060a");
  bg.addColorStop(0.55, "#10131c");
  bg.addColorStop(1, "#030305");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const timelineDuration = Math.max(
    edl.timeline.duration || 0,
    ...(edl.shots ?? []).map(getShotEnd),
    1
  );

  const activeShot = (edl.shots ?? []).find(
    (shot) => currentTime >= shot.timing.startTime && currentTime <= getShotEnd(shot)
  );

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("Preview Structure", width / 2, height * 0.28);

  ctx.font = "500 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.fillText(reason, width / 2, height * 0.36);

  ctx.font = "500 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(
    activeShot
      ? `Current: ${activeShot.id} · ${activeShot.source.clipId}`
      : `No active shot at ${formatTime(currentTime)}`,
    width / 2,
    height * 0.43
  );

  const timelineX = width * 0.08;
  const timelineY = height * 0.68;
  const timelineW = width * 0.84;
  const timelineH = 48;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(timelineX, timelineY, timelineW, timelineH);

  for (let i = 0; i < (edl.shots ?? []).length; i++) {
    const shot = (edl.shots ?? [])[i];
    const startRatio = clamp(shot.timing.startTime / timelineDuration, 0, 1);
    const endRatio = clamp(getShotEnd(shot) / timelineDuration, 0, 1);
    const x = timelineX + startRatio * timelineW;
    const w = Math.max(2, (endRatio - startRatio) * timelineW);

    const isActive = activeShot?.id === shot.id;

    ctx.fillStyle = isActive
      ? "rgba(96,165,250,0.95)"
      : shot.beatLock
        ? "rgba(34,197,94,0.8)"
        : "rgba(255,255,255,0.28)";

    ctx.fillRect(x, timelineY, w, timelineH);

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, timelineY, w, timelineH);

    if (w > 34) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, timelineY, w, timelineH);
      ctx.clip();

      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x + 6, timelineY + timelineH / 2);

      ctx.restore();
    }
  }

  const playheadX =
    timelineX + clamp(currentTime / timelineDuration, 0, 1) * timelineW;

  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(playheadX, timelineY - 12);
  ctx.lineTo(playheadX, timelineY + timelineH + 12);
  ctx.stroke();

  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.moveTo(playheadX, timelineY - 16);
  ctx.lineTo(playheadX - 7, timelineY - 4);
  ctx.lineTo(playheadX + 7, timelineY - 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `${(edl.shots ?? []).length} shot${(edl.shots ?? []).length === 1 ? "" : "s"} · ${formatTime(timelineDuration)}`,
    width / 2,
    timelineY + timelineH + 40
  );

  ctx.restore();
}
