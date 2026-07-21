/**
 * Mediabunny Renderer — renders ShotEDL to video using WebCodecs + Canvas.
 *
 * Browser-side renderer for the simple editor preview.
 * Uses mediabunny for decode/encode, Canvas for compositing effects/overlays.
 *
 * For server-side rendering, the advanced editor (kove-advanced) handles it
 * through its existing VideoEngine + ExportEngine pipeline.
 */
import type { ShotEDL, Shot, ShotEffect, ShotTransition, Overlay } from "../../packages/edl-v3/src/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
  outputFormat?: "mp4" | "webm";
}

export interface RenderProgress {
  phase: "decoding" | "compositing" | "encoding" | "done";
  frame: number;
  totalFrames: number;
  percent: number;
}

export interface RenderResult {
  success: boolean;
  blob?: Blob;
  error?: string;
  duration: number;
  frameCount: number;
}

// ── Renderer ────────────────────────────────────────────────────────────────

/**
 * Render a ShotEDL to a video blob using mediabunny + Canvas.
 *
 * This is the browser-side renderer for preview playback.
 * It decodes source clips, applies effects/overlays on Canvas,
 * and encodes the result to MP4/WebM.
 *
 * Usage:
 * ```ts
 * const renderer = new MediabunnyRenderer({ width: 1080, height: 1920, fps: 30 });
 * const result = await renderer.render(edl, clips, onProgress);
 * ```
 */
export class MediabunnyRenderer {
  private config: RenderConfig;
  private mediabunny: any = null;

  constructor(config: RenderConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      this.mediabunny = await import("mediabunny");
    } catch {
      throw new Error("mediabunny not available — install it or use server-side rendering");
    }
  }

  /**
   * Render a ShotEDL to video.
   *
   * @param edl - The ShotEDL to render
   * @param clips - Map of clipId → Blob (source video files)
   * @param onProgress - Progress callback
   */
  async render(
    edl: ShotEDL,
    clips: Map<string, Blob>,
    onProgress?: (progress: RenderProgress) => void,
  ): Promise<RenderResult> {
    if (!this.mediabunny) {
      await this.initialize();
    }

    const startTime = Date.now();
    const totalFrames = Math.ceil(edl.meta.duration * this.config.fps);

    try {
      // 1. Create output
      const { Output, MP4 } = this.mediabunny;
      const output = new Output({
        format: new MP4(),
        video: {
          codec: "h264",
          width: this.config.width,
          height: this.config.height,
          fps: this.config.fps,
        },
      });

      // 2. Create canvas for compositing
      const canvas = new OffscreenCanvas(this.config.width, this.config.height);
      const ctx = canvas.getContext("2d")!;

      // 3. Process each shot
      let currentFrame = 0;

      for (const shot of edl.shots) {
        const clipBlob = clips.get(shot.source.clipId);
        if (!clipBlob) continue;

        const shotFrames = Math.ceil(shot.timing.duration * this.config.fps * (1 / shot.timing.speed));

        // Decode source clip
        const { Input, ALL_FORMATS, BlobSource, CanvasSink } = this.mediabunny;
        const input = new Input({
          source: new BlobSource(clipBlob),
          formats: ALL_FORMATS,
        });

        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack) continue;

        const sink = new CanvasSink(videoTrack, {
          width: this.config.width,
          height: this.config.height,
          fit: "cover",
        });

        // Render frames for this shot
        for (let frame = 0; frame < shotFrames; frame++) {
          const timestamp = shot.source.inPoint + (frame / this.config.fps) / shot.timing.speed;
          const canvasResult = await sink.getCanvas(timestamp);

          if (canvasResult) {
            // Clear canvas
            ctx.clearRect(0, 0, this.config.width, this.config.height);

            // Draw source frame with transform
            ctx.save();
            this.applyTransform(ctx, shot, frame / this.config.fps);
            ctx.drawImage(canvasResult.canvas, 0, 0);
            ctx.restore();

            // Apply effects
            this.applyEffects(ctx, shot.effects, frame / this.config.fps, shot.timing.duration);

            // Apply overlays
            this.applyOverlays(ctx, shot.overlays, frame / this.config.fps);

            // Apply transition (fade in/out)
            this.applyTransition(ctx, shot.transition, frame / shotFrames);

            // Encode frame
            await output.addVideoFrame(canvas, {
              timestamp: (currentFrame / this.config.fps),
              duration: 1 / this.config.fps,
            });
          }

          currentFrame++;
          onProgress?.({
            phase: "compositing",
            frame: currentFrame,
            totalFrames,
            percent: Math.round((currentFrame / totalFrames) * 100),
          });
        }

        // Cleanup
        input[Symbol.dispose]?.();
      }

      // 4. Finalize
      onProgress?.({ phase: "encoding", frame: totalFrames, totalFrames, percent: 99 });
      const blob = await output.close();

      onProgress?.({ phase: "done", frame: totalFrames, totalFrames, percent: 100 });

      return {
        success: true,
        blob,
        duration: Date.now() - startTime,
        frameCount: currentFrame,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        frameCount: 0,
      };
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  private applyTransform(
    ctx: OffscreenCanvasRenderingContext2D,
    shot: Shot,
    localTime: number,
  ): void {
    const { transform } = shot;
    const w = this.config.width;
    const h = this.config.height;

    // Interpolate position
    const pos = this.interpolateVec2(transform.position, localTime);
    const scale = this.interpolateScalar(transform.scale, localTime);
    const rotation = this.interpolateScalar(transform.rotation, localTime);

    ctx.translate(w / 2 + pos.x * w, h / 2 + pos.y * h);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
  }

  private applyEffects(
    ctx: OffscreenCanvasRenderingContext2D,
    effects: ShotEffect[],
    localTime: number,
    shotDuration: number,
  ): void {
    for (const fx of effects) {
      const fxStart = fx.startTime ?? 0;
      const fxDuration = fx.duration ?? shotDuration;

      if (localTime < fxStart || localTime > fxStart + fxDuration) continue;

      switch (fx.type) {
        case "vignette":
          this.applyVignette(ctx, fx.params.amount ?? 50);
          break;
        case "blur":
          // Canvas filter-based blur
          (ctx.canvas as any).style?.filter
            ? ((ctx.canvas as any).style.filter = `blur(${fx.params.radius ?? 5}px)`)
            : null;
          break;
        case "brightness":
          ctx.filter = `brightness(${1 + (fx.params.value ?? 0) / 100})`;
          break;
        case "contrast":
          ctx.filter = `contrast(${1 + (fx.params.value ?? 0) / 100})`;
          break;
        case "saturation":
          ctx.filter = `saturate(${1 + (fx.params.value ?? 0) / 100})`;
          break;
        case "impact_flash":
          this.applyFlash(ctx, fx.intensity);
          break;
        case "film-grain":
          this.applyGrain(ctx, fx.params.amount ?? 20);
          break;
      }
    }
  }

  private applyVignette(ctx: OffscreenCanvasRenderingContext2D, amount: number): void {
    const w = this.config.width;
    const h = this.config.height;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${amount / 100})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  private applyFlash(ctx: OffscreenCanvasRenderingContext2D, intensity: number): void {
    ctx.fillStyle = `rgba(255,255,255,${intensity * 0.7})`;
    ctx.fillRect(0, 0, this.config.width, this.config.height);
  }

  private applyGrain(ctx: OffscreenCanvasRenderingContext2D, amount: number): void {
    const w = this.config.width;
    const h = this.config.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const grainAmount = amount * 2.55;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * grainAmount;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── Overlays ────────────────────────────────────────────────────────────

  private applyOverlays(
    ctx: OffscreenCanvasRenderingContext2D,
    overlays: Overlay[],
    localTime: number,
  ): void {
    for (const overlay of overlays) {
      if (overlay.type === "text") {
        this.drawTextOverlay(ctx, overlay, localTime);
      }
    }
  }

  private drawTextOverlay(
    ctx: OffscreenCanvasRenderingContext2D,
    overlay: any,
    localTime: number,
  ): void {
    const w = this.config.width;
    const h = this.config.height;

    // Compute animation alpha
    let alpha = 1;
    if (overlay.animation) {
      const { inDuration = 0.3, outDuration = 0.3 } = overlay.animation;
      if (localTime < inDuration) {
        alpha = localTime / inDuration;
      } else if (localTime > (overlay.duration ?? 2) - outDuration) {
        alpha = ((overlay.duration ?? 2) - localTime) / outDuration;
      }
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const style = overlay.style ?? {};
    ctx.font = `${style.fontWeight ?? "bold"} ${style.fontSize ?? 48}px ${style.fontFamily ?? "Inter"}`;
    ctx.fillStyle = style.color ?? "#ffffff";
    ctx.textAlign = style.textAlign ?? "center";
    ctx.textBaseline = "middle";

    const x = (overlay.position?.x ?? 0.5) * w;
    const y = (overlay.position?.y ?? 0.5) * h;

    // Background
    if (style.backgroundColor) {
      const metrics = ctx.measureText(overlay.text);
      const padding = 12;
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(
        x - metrics.width / 2 - padding,
        y - (style.fontSize ?? 48) / 2 - padding,
        metrics.width + padding * 2,
        (style.fontSize ?? 48) + padding * 2,
      );
    }

    // Text
    ctx.fillStyle = style.color ?? "#ffffff";
    ctx.fillText(overlay.text, x, y);

    ctx.restore();
  }

  // ── Transitions ─────────────────────────────────────────────────────────

  private applyTransition(
    ctx: OffscreenCanvasRenderingContext2D,
    transition: ShotTransition,
    progress: number,
  ): void {
    if (transition.type === "fade") {
      const alpha = transition.type === "fade"
        ? progress < 0.5
          ? progress * 2
          : 2 - progress * 2
        : 1;
      ctx.fillStyle = `rgba(0,0,0,${1 - alpha})`;
      ctx.fillRect(0, 0, this.config.width, this.config.height);
    }
  }

  // ── Interpolation ───────────────────────────────────────────────────────

  private interpolateScalar(
    keyframes: Array<{ time: number; value: number }>,
    time: number,
  ): number {
    if (keyframes.length === 0) return 1;
    if (keyframes.length === 1) return keyframes[0].value;

    if (time <= keyframes[0].time) return keyframes[0].value;
    if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i];
      const b = keyframes[i + 1];
      if (time >= a.time && time <= b.time) {
        const t = (time - a.time) / (b.time - a.time);
        return a.value + (b.value - a.value) * t;
      }
    }

    return keyframes[keyframes.length - 1].value;
  }

  private interpolateVec2(
    keyframes: Array<{ time: number; x: number; y: number }>,
    time: number,
  ): { x: number; y: number } {
    if (keyframes.length === 0) return { x: 0, y: 0 };
    if (keyframes.length === 1) return { x: keyframes[0].x, y: keyframes[0].y };

    if (time <= keyframes[0].time) return { x: keyframes[0].x, y: keyframes[0].y };
    if (time >= keyframes[keyframes.length - 1].time) {
      const last = keyframes[keyframes.length - 1];
      return { x: last.x, y: last.y };
    }

    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i];
      const b = keyframes[i + 1];
      if (time >= a.time && time <= b.time) {
        const t = (time - a.time) / (b.time - a.time);
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
      }
    }

    const last = keyframes[keyframes.length - 1];
    return { x: last.x, y: last.y };
  }
}
