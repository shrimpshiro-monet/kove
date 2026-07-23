/**
 * Jalebi Renderer — mediabunny + WebGPU video compositing.
 *
 * Decodes video frames via mediabunny (WebCodecs),
 * applies effects via Canvas 2D (with WebGPU for advanced effects),
 * and encodes back to video via mediabunny.
 */
import type { ShotEDL, Shot, ShotEffect, Overlay } from "@monet/edl-v3";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
  outputFormat: "mp4" | "webm";
}

export interface RenderProgress {
  phase: "decode" | "composite" | "encode" | "done";
  frame: number;
  totalFrames: number;
  percent: number;
  shotIndex: number;
  shotTotal: number;
}

export interface RenderResult {
  success: boolean;
  blob?: Blob;
  error?: string;
  duration: number;
  frameCount: number;
}

// ── Renderer ────────────────────────────────────────────────────────────────

export class JalebiRenderer {
  private config: RenderConfig;
  private mediabunny: any = null;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private gpuDevice: GPUDevice | null = null;
  private gpuPipeline: GPUComputePipeline | null = null;

  constructor(config: RenderConfig) {
    this.config = config;
    this.canvas = new OffscreenCanvas(config.width, config.height);
    this.ctx = this.canvas.getContext("2d")!;
  }

  async initialize(): Promise<void> {
    // Load mediabunny
    try {
      this.mediabunny = await import("mediabunny");
    } catch {
      throw new Error("mediabunny not available");
    }

    // Initialize WebGPU for effects
    try {
      if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          this.gpuDevice = await adapter.requestDevice();
          console.log("[renderer] WebGPU initialized");
        }
      }
    } catch {
      console.log("[renderer] WebGPU not available, using Canvas 2D fallback");
    }

    console.log("[renderer] Initialized");
  }

  /**
   * Render a ShotEDL to video.
   */
  async render(
    edl: ShotEDL,
    sourceFiles: Map<string, File>,
    onProgress?: (p: RenderProgress) => void,
  ): Promise<RenderResult> {
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

      // 2. Process each shot
      let currentFrame = 0;

      for (let shotIdx = 0; shotIdx < edl.shots.length; shotIdx++) {
        const shot = edl.shots[shotIdx];
        const sourceFile = sourceFiles.get(shot.source.clipId);
        if (!sourceFile) continue;

        const shotFrames = Math.ceil(shot.timing.duration * this.config.fps);

        onProgress?.({
          phase: "decode",
          frame: currentFrame,
          totalFrames,
          percent: Math.round((currentFrame / totalFrames) * 100),
          shotIndex: shotIdx,
          shotTotal: edl.shots.length,
        });

        // Decode source clip
        const { Input, ALL_FORMATS, BlobSource, CanvasSink } = this.mediabunny;
        const input = new Input({
          source: new BlobSource(sourceFile),
          formats: ALL_FORMATS,
        });

        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack) {
          input[Symbol.dispose]?.();
          continue;
        }

        const sink = new CanvasSink(videoTrack, {
          width: this.config.width,
          height: this.config.height,
          fit: "cover",
          poolSize: 4,
        });

        // Render each frame of this shot
        for (let frame = 0; frame < shotFrames; frame++) {
          const sourceTime = shot.source.inPoint + (frame / this.config.fps) / (shot.timing.speed || 1);
          const canvasResult = await sink.getCanvas(sourceTime);

          if (canvasResult) {
            // Draw source frame
            this.ctx.clearRect(0, 0, this.config.width, this.config.height);
            this.ctx.drawImage(canvasResult.canvas, 0, 0);

            // Apply shot effects
            this.applyShotEffects(shot, frame / this.config.fps);

            // Apply overlays
            this.applyOverlays(shot.overlays, frame / this.config.fps, shot.timing.duration);

            // Apply vignette
            this.applyVignette();

            // Encode frame to output
            await output.addVideoFrame(this.canvas, {
              timestamp: currentFrame / this.config.fps,
              duration: 1 / this.config.fps,
            });
          }

          currentFrame++;

          if (currentFrame % 30 === 0) {
            onProgress?.({
              phase: "composite",
              frame: currentFrame,
              totalFrames,
              percent: Math.round((currentFrame / totalFrames) * 100),
              shotIndex: shotIdx,
              shotTotal: edl.shots.length,
            });
          }
        }

        input[Symbol.dispose]?.();
      }

      // 3. Finalize
      onProgress?.({ phase: "encode", frame: totalFrames, totalFrames, percent: 99, shotIndex: edl.shots.length, shotTotal: edl.shots.length });
      const blob = await output.close();

      onProgress?.({ phase: "done", frame: totalFrames, totalFrames, percent: 100, shotIndex: edl.shots.length, shotTotal: edl.shots.length });

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

  private applyShotEffects(shot: Shot, localTime: number): void {
    for (const fx of shot.effects) {
      const fxStart = fx.startTime ?? 0;
      const fxDuration = fx.duration ?? shot.timing.duration;
      if (localTime < fxStart || localTime > fxStart + fxDuration) continue;

      switch (fx.type) {
        case "vignette":
          this.applyVignette(fx.params.amount ?? 50);
          break;
        case "brightness":
          this.ctx.filter = `brightness(${1 + (fx.params.value ?? 0) / 100})`;
          this.ctx.drawImage(this.canvas, 0, 0);
          this.ctx.filter = "none";
          break;
        case "contrast":
          this.ctx.filter = `contrast(${1 + (fx.params.value ?? 0) / 100})`;
          this.ctx.drawImage(this.canvas, 0, 0);
          this.ctx.filter = "none";
          break;
        case "saturation":
          this.ctx.filter = `saturate(${1 + (fx.params.value ?? 0) / 100})`;
          this.ctx.drawImage(this.canvas, 0, 0);
          this.ctx.filter = "none";
          break;
        case "impact_flash":
          this.ctx.fillStyle = `rgba(255,255,255,${fx.intensity * 0.7})`;
          this.ctx.fillRect(0, 0, this.config.width, this.config.height);
          break;
        case "speed_ramp":
          // Speed is handled in the timing calculation
          break;
      }
    }

    // Apply transform (zoom, position, rotation)
    const transform = shot.transform;
    const scale = this.interpolateScalar(transform.scale, localTime);
    const rotation = this.interpolateScalar(transform.rotation, localTime);
    const pos = this.interpolateVec2(transform.position, localTime);

    if (scale !== 1 || rotation !== 0 || pos.x !== 0 || pos.y !== 0) {
      this.ctx.save();
      this.ctx.translate(this.config.width / 2 + pos.x * this.config.width, this.config.height / 2 + pos.y * this.config.height);
      this.ctx.rotate((rotation * Math.PI) / 180);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-this.config.width / 2, -this.config.height / 2);
      this.ctx.drawImage(this.canvas, 0, 0);
      this.ctx.restore();
    }
  }

  private applyOverlays(overlays: Overlay[], localTime: number, shotDuration: number): void {
    for (const overlay of overlays) {
      if (overlay.type === "text") {
        this.drawTextOverlay(overlay, localTime, shotDuration);
      }
    }
  }

  private drawTextOverlay(overlay: any, localTime: number, shotDuration: number): void {
    let alpha = 1;
    if (overlay.animation) {
      const { inDuration = 0.3, outDuration = 0.3 } = overlay.animation;
      if (localTime < inDuration) alpha = localTime / inDuration;
      else if (localTime > shotDuration - outDuration) alpha = (shotDuration - localTime) / outDuration;
    }

    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const style = overlay.style ?? {};
    const fontSize = style.fontSize ?? 48;
    this.ctx.font = `bold ${fontSize}px 'SF Pro', system-ui, sans-serif`;
    this.ctx.fillStyle = style.color ?? "#ffffff";
    this.ctx.textAlign = style.textAlign ?? "center";
    this.ctx.textBaseline = "middle";

    const x = (overlay.position?.x ?? 0.5) * this.config.width;
    const y = (overlay.position?.y ?? 0.5) * this.config.height;

    // Text shadow
    this.ctx.shadowColor = "rgba(0,0,0,0.8)";
    this.ctx.shadowBlur = 8;
    this.ctx.shadowOffsetX = 2;
    this.ctx.shadowOffsetY = 2;

    this.ctx.fillText(overlay.text, x, y);

    this.ctx.restore();
  }

  private applyVignette(amount = 40): void {
    const w = this.config.width;
    const h = this.config.height;
    const gradient = this.ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${amount / 100})`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, w, h);
  }

  private applyColorGrade(contrast: number, saturation: number, brightness: number): void {
    this.ctx.filter = `contrast(${contrast}) saturate(${saturation}) brightness(${1 + brightness})`;
    this.ctx.drawImage(this.canvas, 0, 0);
    this.ctx.filter = "none";
  }

  // ── Interpolation ───────────────────────────────────────────────────────

  private interpolateScalar(keyframes: Array<{ time: number; value: number }>, time: number): number {
    if (!keyframes || keyframes.length === 0) return 1;
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

  private interpolateVec2(keyframes: Array<{ time: number; x: number; y: number }>, time: number): { x: number; y: number } {
    if (!keyframes || keyframes.length === 0) return { x: 0, y: 0 };
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
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    const last = keyframes[keyframes.length - 1];
    return { x: last.x, y: last.y };
  }

  dispose(): void {
    this.gpuDevice?.destroy();
  }
}
