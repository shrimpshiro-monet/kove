// Browser-side SAM 2 Mask Compositor for Monet AI Specialist engine.
// Uses Canvas2D globalCompositeOperation to isolate and composite subject masks.

export class SAMMaskRenderer {
  private maskCache = new Map<string, HTMLVideoElement>();

  async loadMask(url: string): Promise<HTMLVideoElement> {
    if (this.maskCache.has(url)) return this.maskCache.get(url)!;
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.src = url;
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;
      video.loop = true;
      video.addEventListener("canplaythrough", () => {
        this.maskCache.set(url, video);
        resolve(video);
      }, { once: true });
      video.addEventListener("error", (e) => reject(e), { once: true });
      video.load();
    });
  }

  composite(
    ctx: CanvasRenderingContext2D,
    sourceVideo: HTMLVideoElement | HTMLCanvasElement,
    maskVideo: HTMLVideoElement,
    shotLocalTime: number,
    options: { intensity?: number; backgroundMode?: "blur" | "dim" | "color"; subjectHighlight?: boolean },
    width: number,
    height: number,
  ) {
    // 1. Sync mask video time to shotLocalTime
    if (maskVideo instanceof HTMLVideoElement && Math.abs(maskVideo.currentTime - shotLocalTime) > 0.05) {
      maskVideo.currentTime = shotLocalTime;
    }

    const intensity = options.intensity ?? 0.7;

    // 2. Create offscreen canvases for compositing
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d")!;

    const subjectCanvas = document.createElement("canvas");
    subjectCanvas.width = width;
    subjectCanvas.height = height;
    const subjectCtx = subjectCanvas.getContext("2d")!;

    // 3. Draw mask onto mask canvas
    maskCtx.drawImage(maskVideo, 0, 0, width, height);

    // 4. Draw source onto subject canvas, and mask it
    subjectCtx.drawImage(sourceVideo, 0, 0, width, height);
    subjectCtx.globalCompositeOperation = "destination-in";
    subjectCtx.drawImage(maskCanvas, 0, 0, width, height);

    // 5. Apply background effects to the main context
    ctx.save();
    if (options.backgroundMode === "blur") {
      ctx.filter = `blur(${8 * intensity}px)`;
      ctx.drawImage(sourceVideo, 0, 0, width, height);
    } else if (options.backgroundMode === "dim") {
      ctx.drawImage(sourceVideo, 0, 0, width, height);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * intensity})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.drawImage(sourceVideo, 0, 0, width, height);
    }
    ctx.restore();

    // 6. Draw isolated subject on top
    ctx.save();
    if (options.subjectHighlight) {
      ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
      ctx.shadowBlur = 10 * intensity;
    }
    ctx.drawImage(subjectCanvas, 0, 0, width, height);
    ctx.restore();
  }
}

let _samMaskRenderer: SAMMaskRenderer | null = null;
export function getSAMMaskRenderer(): SAMMaskRenderer {
  if (!_samMaskRenderer) _samMaskRenderer = new SAMMaskRenderer();
  return _samMaskRenderer;
}
