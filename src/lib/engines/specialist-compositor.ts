// Browser-side compositor that consumes specialist engine outputs.
// SAM mask → dim/blur background. Depth map → parallax / focus.

import { browserSubjectPop } from "../integrations/mediapipe-segmentation";

export interface SAMCompositeParams {
  intensity: number;
  backgroundMode: "dim" | "blur" | "color";
  backgroundColor?: string;
}

export interface DepthCompositeParams {
  focalDepth: number;
  blurStrength: number;
}

const _videoCache = new Map<string, HTMLVideoElement>();

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  if (_videoCache.has(url)) return _videoCache.get(url)!;

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load ${url}`));
    setTimeout(() => reject(new Error("video load timeout")), 30000);
  });

  _videoCache.set(url, video);
  return video;
}

export async function compositeSAMMask(
  ctx: CanvasRenderingContext2D,
  sourceVideo: HTMLVideoElement,
  maskUrl: string,
  sourceTime: number,
  params: SAMCompositeParams,
  width: number,
  height: number,
): Promise<void> {
  try {
    const maskVideo = await loadVideo(maskUrl);
    if (Math.abs(maskVideo.currentTime - sourceTime) > 0.05) {
      maskVideo.currentTime = sourceTime;
    }

    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const offCtx = off.getContext("2d")!;
    offCtx.drawImage(sourceVideo, 0, 0, width, height);

    if (params.backgroundMode === "blur") {
      offCtx.filter = `blur(${10 * params.intensity}px) brightness(${1 - 0.4 * params.intensity})`;
      offCtx.drawImage(off, 0, 0);
      offCtx.filter = "none";
    } else if (params.backgroundMode === "color") {
      offCtx.fillStyle = `${params.backgroundColor ?? "#000"}${Math.floor(params.intensity * 200).toString(16).padStart(2, "0")}`;
      offCtx.fillRect(0, 0, width, height);
    } else {
      offCtx.fillStyle = `rgba(0,0,0,${0.55 * params.intensity})`;
      offCtx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(off, 0, 0, width, height);

    const sub = document.createElement("canvas");
    sub.width = width;
    sub.height = height;
    const sCtx = sub.getContext("2d")!;
    sCtx.drawImage(sourceVideo, 0, 0, width, height);
    sCtx.globalCompositeOperation = "destination-in";
    sCtx.drawImage(maskVideo, 0, 0, width, height);

    ctx.drawImage(sub, 0, 0, width, height);
  } catch (e) {
    console.warn("[specialist-compositor] SAM composite failed:", e);
  }
}

export async function compositeDepthFocus(
  ctx: CanvasRenderingContext2D,
  sourceVideo: HTMLVideoElement,
  depthUrl: string,
  sourceTime: number,
  params: DepthCompositeParams,
  width: number,
  height: number,
): Promise<void> {
  try {
    const depthVideo = await loadVideo(depthUrl);
    if (Math.abs(depthVideo.currentTime - sourceTime) > 0.05) {
      depthVideo.currentTime = sourceTime;
    }

    const blurred = document.createElement("canvas");
    blurred.width = width;
    blurred.height = height;
    const bCtx = blurred.getContext("2d")!;
    bCtx.filter = `blur(${12 * params.blurStrength}px)`;
    bCtx.drawImage(sourceVideo, 0, 0, width, height);
    bCtx.filter = "none";

    ctx.drawImage(blurred, 0, 0, width, height);

    const depthCanvas = document.createElement("canvas");
    depthCanvas.width = width;
    depthCanvas.height = height;
    const dCtx = depthCanvas.getContext("2d")!;
    dCtx.drawImage(depthVideo, 0, 0, width, height);
    const depthData = dCtx.getImageData(0, 0, width, height);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const mCtx = maskCanvas.getContext("2d")!;
    const mask = mCtx.createImageData(width, height);
    for (let i = 0; i < depthData.data.length; i += 4) {
      const depth = depthData.data[i] / 255;
      const distance = Math.abs(depth - params.focalDepth);
      const alpha = Math.max(0, 1 - distance * 4) * 255;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 255;
      mask.data[i + 3] = alpha;
    }
    mCtx.putImageData(mask, 0, 0);

    const sharp = document.createElement("canvas");
    sharp.width = width;
    sharp.height = height;
    const sCtx = sharp.getContext("2d")!;
    sCtx.drawImage(sourceVideo, 0, 0, width, height);
    sCtx.globalCompositeOperation = "destination-in";
    sCtx.drawImage(maskCanvas, 0, 0, width, height);

    ctx.drawImage(sharp, 0, 0, width, height);
  } catch (e) {
    console.warn("[specialist-compositor] depth composite failed:", e);
  }
}

/**
 * Browser-fallback subject isolation using MediaPipe.
 * Called when SAM/HF is rate-limited.
 */
export async function compositeSubjectFallback(
  ctx: CanvasRenderingContext2D,
  sourceVideo: HTMLVideoElement,
  sourceTime: number,
  params: SAMCompositeParams,
  width: number,
  height: number,
): Promise<void> {
  try {
    if (Math.abs(sourceVideo.currentTime - sourceTime) > 0.05) {
      sourceVideo.currentTime = sourceTime;
    }
    await browserSubjectPop(
      ctx,
      sourceVideo,
      params.intensity,
      params.backgroundMode === "blur" ? "blur" : "dim",
      width,
      height,
    );
  } catch (e) {
    console.warn("[specialist-compositor] browser fallback failed:", e);
    ctx.drawImage(sourceVideo, 0, 0, width, height);
  }
}
