import type { LoadedDepthTrack, LoadedMaskTrack } from "./spatial-runtime";
import { resolveSpatialFrame } from "./spatial-runtime";

export interface SpatialCompositeContext {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  localTime: number;
  maskTrack?: LoadedMaskTrack;
  depthTrack?: LoadedDepthTrack;
}

export function drawTextBehindSubject(
  context: SpatialCompositeContext,
  text: string,
  xRatio = 0.5,
  yRatio = 0.42
): void {
  if (!text.trim()) {
    return;
  }

  const ctx = context.ctx;
  const maskFrame = context.maskTrack
    ? resolveSpatialFrame(context.maskTrack.frames, context.localTime)
    : null;

  ctx.save();

  ctx.font = `900 ${Math.round(context.canvasHeight * 0.07)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.fillStyle = "white";
  ctx.lineWidth = Math.max(6, context.canvasHeight * 0.008);

  const x = context.canvasWidth * xRatio;
  const y = context.canvasHeight * yRatio;

  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);

  if (maskFrame) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(maskFrame.image, 0, 0, context.canvasWidth, context.canvasHeight);
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}

export function drawSubjectAura(context: SpatialCompositeContext, color = "rgba(0,220,255,0.55)"): void {
  const maskFrame = context.maskTrack
    ? resolveSpatialFrame(context.maskTrack.frames, context.localTime)
    : null;

  if (!maskFrame) {
    return;
  }

  const ctx = context.ctx;
  const blurAmount = Math.max(8, context.canvasWidth * 0.018);

  ctx.save();
  ctx.filter = `blur(${blurAmount}px)`;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(maskFrame.image, 0, 0, context.canvasWidth, context.canvasHeight);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, context.canvasWidth, context.canvasHeight);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

export function applyDepthBackgroundTint(context: SpatialCompositeContext): void {
  const depthFrame = context.depthTrack
    ? resolveSpatialFrame(context.depthTrack.frames, context.localTime)
    : null;

  if (!depthFrame) {
    return;
  }

  const ctx = context.ctx;

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(depthFrame.image, 0, 0, context.canvasWidth, context.canvasHeight);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}
