// Monet Canvas Renderer
// Renders MonetEDL to Canvas2D for preview

import type { MonetEDL, Shot, TextOverlay, MotionTrack, PlanarTrack } from "../../server/types/edl";

function hashEdlForRender(edl: any): string {
  if (!edl) return "empty";
  const minimal = {
    d: Math.round((edl.duration ?? edl.timeline?.duration ?? 0) * 100),
    shots: (edl.shots || []).map((s: any) => ({
      c: s.source?.clipId ?? s.clipId,
      i: Math.round((s.source?.inPoint ?? s.sourceIn ?? 0) * 100),
      o: Math.round((s.source?.outPoint ?? s.sourceOut ?? 0) * 100),
      t: Math.round((s.timing?.startTime ?? s.timelineStart ?? 0) * 100),
      f: (s.effects || s.features || []).map((f: any) => f.kind || f.type || f.id).sort().join(","),
    })),
    cap: (edl.captions || []).map((c: any) => `${c.text}@${c.startTime}`).join("|"),
  };
  let h = 0x811c9dc5;
  const s = JSON.stringify(minimal);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
import {
  findActiveShot,
  getSourceTimeForShot,
  normalizeEDLForPreview,
  resolvePreviewTime,
  computeSpeedRampSourceTime,
} from "./monet-edl-preview-normalizer";
import { cubicBezier } from "../../server/lib/bezier-velocity";
import type { RenderContext, RenderFrame } from "./types";
import { MediaLoader } from "./media-loader";
import { EffectsEngine } from "./effects";
import { TransitionEngine } from "./transitions";
import { drawSimplePreviewFallback } from "./simple-preview-fallback";
import { WebGLGradeRenderer, GRADE_PRESETS } from "./webgl-grade-renderer";
import { routeEDL, type RoutingResult } from "../engines/router";
import { dispatchToEngine, disposeDispatcher, type DispatchContext } from "../engines/engine-dispatch";

// Shared across all MonetRenderer instances — survives React remounts
const SHARED_MEDIA_LOADER = new MediaLoader();

function summarizeEDLFeatures(edl: any, label = "edl") {
  const counts: Record<string, number> = {};

  for (const shot of edl.shots ?? []) {
    for (const fx of shot.effects ?? []) {
      const id = typeof fx === "string" ? fx : fx.type ?? fx.id ?? "unknown";
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }

  console.log(`[MonetRenderer] EDL feature summary (${label})`, counts);
}

export class MonetRenderer {
  private mediaLoader: MediaLoader;
  private effects: EffectsEngine;
  private transitions: TransitionEngine;
  private edl: MonetEDL | null = null;
  private renderContext: RenderContext | null = null;
  private previousFrameData: ImageData | null = null;
  private hasLoadedAnyAsset = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private latestRequestedRenderSerial = 0;
  private isRendering = false;
  private pendingRender:
    | {
        time: number;
        serial: number;
      }
    | null = null;
  private rafId: number | null = null;
  private lastFrameTime: number = 0;
  private targetFps: number = 30;

  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private lastRenderedFrameKey: string | null = null;
  private webglGrade: WebGLGradeRenderer | null = null;
  private routing: RoutingResult | null = null;

  private prevFrameCanvas: HTMLCanvasElement | null = null;
  private heldFrameCanvas: HTMLCanvasElement | null = null;
  private framesSinceHeldUpdate = 0;
  private heldUpdateInterval = 2;  // hold every 2 frames (animTiming=2 default)

  constructor() {
    this.mediaLoader = SHARED_MEDIA_LOADER;
    this.effects = new EffectsEngine();
    this.transitions = new TransitionEngine();
  }

  private getOffscreenCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement("canvas");
    }
    if (this.offscreenCanvas.width !== width) {
      this.offscreenCanvas.width = width;
    }
    if (this.offscreenCanvas.height !== height) {
      this.offscreenCanvas.height = height;
    }
    if (!this.offscreenCtx) {
      this.offscreenCtx = this.offscreenCanvas.getContext("2d", { alpha: false });
    }
    return { canvas: this.offscreenCanvas, ctx: this.offscreenCtx! };
  }

  /**
   * Initialize renderer with EDL and canvas
   */
  async initialize(
    edl: MonetEDL,
    canvas: HTMLCanvasElement,
    mediaUrls?: Map<string, string>
  ): Promise<void> {
    const newHash = hashEdlForRender(edl);
    if (this.canvas === canvas && this.edl && hashEdlForRender(this.edl) === newHash) {
      console.log("[MonetRenderer] Same EDL + canvas already initialized; skipping");
      return;
    }

    summarizeEDLFeatures(edl, "raw");

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    if (!this.ctx) {
      throw new Error("Failed to create 2D canvas context for MonetRenderer.");
    }

    this.edl = normalizeEDLForPreview(edl);
    
    summarizeEDLFeatures(this.edl, "normalized");

    console.log("[MonetRenderer] strict style shots", {
      raw: edl.shots?.filter((s: any) => s.meta?.styleMode === "strict_replication").length ?? 0,
      normalized: this.edl.shots.filter((s: any) => s.meta?.styleMode === "strict_replication").length,
    });

    const width = this.edl.timeline.resolution.width;
    const height = this.edl.timeline.resolution.height;

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    this.renderContext = {
      ctx: this.ctx,
      canvas: this.canvas,
      fps: this.edl.timeline.fps ?? 30,
      width,
      height,
    };

    canvas.style.filter = colorGradeToFilter(this.edl.globalEffects?.colorGrade);

    try {
      this.routing = routeEDL(this.edl, { tier: "free", forBrowser: true });
      console.log("[MonetRenderer] engine routing initialized", {
        enginesUsed: this.routing.enginesUsed,
        totalShots: this.routing.perShot.length,
        unrouted: this.routing.unrouted.length,
      });
    } catch (e) {
      console.warn("[MonetRenderer] routing failed:", e);
      this.routing = null;
    }

    await this.preloadAssets(this.edl, mediaUrls);
    await this.renderFrame(0);
  }

  renderStructureFallback(reason: string, currentTime = 0): void {
    if (!this.edl || !this.renderContext) {
      return;
    }

    const { ctx, width, height } = this.renderContext;

    drawSimplePreviewFallback(ctx, this.edl, {
      reason,
      currentTime,
      width,
      height,
    });
  }

  private async preloadAssets(
    edl: MonetEDL,
    mediaUrls?: Map<string, string>
  ): Promise<boolean> {
    const clipIds = new Set<string>();
    for (const shot of edl.shots) {
      const cid = shot.source?.clipId;
      if (!cid) continue;

      // Skip clipIds that look like reference videos (their IDs come from
      // a different upload path and would never be in mediaUrls map)
      if (mediaUrls && !mediaUrls.has(cid)) {
        console.warn(
          "[MonetRenderer] Skipping clipId not in media map (likely reference/music leak):",
          cid,
        );
        continue;
      }

      clipIds.add(cid);
    }

    if (clipIds.size === 0) {
      console.error(
        "[MonetRenderer] No valid footage clipIds found in EDL — all shots may reference non-footage assets",
      );
    }

    const clipIdList = Array.from(clipIds);

    const loadPromises = clipIdList.map(async (clipId) => {
      // Already loaded? Skip — MediaLoader's getAsset should return non-null
      const existing = this.mediaLoader.getAsset(clipId);
      if (existing && !existing.failed && existing.element instanceof HTMLVideoElement) {
        console.log("[MonetRenderer] Cache hit for media asset", clipId);
        return existing;
      }

      let url = mediaUrls?.get(clipId) || `/api/media/${clipId}`;

      // Prefer HTTP URL fallbacks over dead blob URLs (blob URLs might hang 45s before failing)
      if (url.startsWith("blob:") && mediaUrls?.get(`${clipId}_http`)) {
        url = mediaUrls.get(`${clipId}_http`)!;
      }

      console.log("[MonetRenderer] Loading preview media", {
        clipId,
        urlKind: url.startsWith("blob:")
          ? "blob"
          : url.startsWith("/api/")
            ? "api"
            : url.startsWith("data:")
              ? "data"
              : "url",
        urlPreview: url.startsWith("blob:") ? url : url.slice(0, 120),
      });

      return this.mediaLoader.loadAsset(clipId, url, "video");
    });

    const results = await Promise.allSettled(loadPromises);
    const failed: string[] = [];
    let loaded = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      if (result.status === "fulfilled") {
        loaded += 1;
        continue;
      }

      const clipId = clipIdList[i];
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);

      failed.push(`${clipId}: ${reason}`);
    }

    if (failed.length > 0) {
      console.warn(
        `Loaded ${loaded}/${clipIdList.length} media assets. Some clips were skipped:\n${failed.join("\n")}`
      );
    } else {
      console.log(`Loaded ${loaded} media assets`);
    }

    this.hasLoadedAnyAsset = loaded > 0;
    return loaded > 0;
  }

  async renderFrame(requestedTime: number): Promise<void> {
    const serial = ++this.latestRequestedRenderSerial;

    this.pendingRender = { time: requestedTime, serial };

    // Coalesce requests via requestAnimationFrame for smoother pacing
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(async (now) => {
      this.rafId = null;

      // Frame budget — skip render if too soon since last
      const minFrameInterval = 1000 / this.targetFps;
      if (now - this.lastFrameTime < minFrameInterval - 2) {
        if (this.pendingRender !== null) {
          this.renderFrame(this.pendingRender.time);
        }
        return;
      }
      this.lastFrameTime = now;

      if (this.isRendering) return;
      this.isRendering = true;

      try {
        while (this.pendingRender !== null) {
          const next = this.pendingRender;
          this.pendingRender = null;
          await this.renderFrameInternal(next.time, next.serial);
        }
      } finally {
        this.isRendering = false;
      }
    });
  }

  private async renderFrameInternal(requestedTime: number, serial: number): Promise<void> {
    if (!this.edl || !this.renderContext) {
      console.warn("[MonetRenderer] BAIL: no edl or renderContext", {
        hasEdl: !!this.edl, hasCtx: !!this.renderContext
      });
      return;
    }

    // Per-instance frame dedup
    const frameKey = `${requestedTime.toFixed(3)}`;
    if (frameKey === this.lastRenderedFrameKey) return;
    this.lastRenderedFrameKey = frameKey;

    const { ctx, width, height } = this.renderContext;
    const { timelineTime } = resolvePreviewTime(this.edl, requestedTime);
    let activeShot = findActiveShot(this.edl, timelineTime);

    // ===== RESILIENCE: snap to closest shot if exact lookup fails =====
    if (!activeShot && this.edl.shots.length > 0) {
      const shots = this.edl.shots;
      const firstStart = shots[0].timing.startTime;
      const lastEnd = shots[shots.length - 1].timing.startTime + shots[shots.length - 1].timing.duration;

      if (timelineTime < firstStart) {
        activeShot = shots[0];
      } else if (timelineTime >= lastEnd) {
        activeShot = shots[shots.length - 1];
      } else {
        activeShot = shots.reduce((best, cur) => {
          const bd = Math.abs(best.timing.startTime - timelineTime);
          const cd = Math.abs(cur.timing.startTime - timelineTime);
          return cd < bd ? cur : best;
        });
      }
      console.log("[MonetRenderer] SNAPPED to closest shot", {
        requestedTime, timelineTime,
        firstShotStart: firstStart, snappedShotId: activeShot?.id,
        snappedStart: activeShot?.timing.startTime,
      });
    }

    if (!activeShot) {
      console.warn("[MonetRenderer] FALLBACK BRANCH A: no shots at all", {
        timelineTime, shotCount: this.edl.shots.length,
      });
      drawSimplePreviewFallback(ctx, this.edl, {
        reason: `No active shot at ${timelineTime.toFixed(2)}s`,
        currentTime: timelineTime, width, height,
      });
      return;
    }

    const frameRateFeel = (this.edl as any)?.globalEffects?.frameRateFeel;
    if (frameRateFeel?.type === "limited" && frameRateFeel.holdFrames > 1) {
      const fps = 30;
      const holdInterval = 1 / (fps / frameRateFeel.holdFrames);
      requestedTime = Math.floor(requestedTime / holdInterval) * holdInterval;
    }

    const shotSpeed = activeShot.timing?.speed ?? 1.0;

    const asset = this.mediaLoader.getAsset(activeShot.source.clipId);

    // ===== LOUD DIAGNOSTIC: which fallback are we hitting? =====
    if (!asset) {
      console.warn("[MonetRenderer] FALLBACK BRANCH B: getAsset returned null", {
        requestedClipId: activeShot.source.clipId,
        mediaLoaderType: this.mediaLoader.constructor.name,
        knownKeys: (() => {
          const ml = this.mediaLoader as any;
          for (const k of ["assets", "cache", "loaded", "_assets", "_cache"]) {
            if (ml[k] instanceof Map) return Array.from(ml[k].keys());
            if (ml[k] && typeof ml[k] === "object") return Object.keys(ml[k]);
          }
          return "couldn't introspect";
        })(),
      });
      drawSimplePreviewFallback(ctx, this.edl, {
        reason: `Media unavailable for shot ${activeShot.id}`,
        currentTime: timelineTime, width, height,
      });
      return;
    }

    if (asset.failed) {
      console.warn("[MonetRenderer] FALLBACK BRANCH C: asset.failed = true", {
        clipId: activeShot.source.clipId, asset,
      });
      drawSimplePreviewFallback(ctx, this.edl, {
        reason: `Asset failed to load: ${activeShot.id}`,
        currentTime: timelineTime, width, height,
      });
      return;
    }

    if (!(asset.element instanceof HTMLVideoElement)) {
      console.warn("[MonetRenderer] FALLBACK BRANCH D: asset.element is NOT a video", {
        clipId: activeShot.source.clipId,
        elementType: asset.element?.constructor?.name,
        elementTag: (asset.element as any)?.tagName,
        asset,
      });
      drawSimplePreviewFallback(ctx, this.edl, {
        reason: `Asset is not a video element: ${activeShot.id}`,
        currentTime: timelineTime, width, height,
      });
      return;
    }

    // ===== SUCCESS PATH — we have a video! =====
    console.log("[MonetRenderer] ✅ rendering video frame", {
      shotId: activeShot.id,
      clipId: activeShot.source.clipId,
      timelineTime,
      videoCurrentTime: (asset.element as HTMLVideoElement).currentTime,
      videoDuration: (asset.element as HTMLVideoElement).duration,
    });

    const video = asset.element;
    let sourceTime = getSourceTimeForShot(activeShot, timelineTime);

    // Apply posterize-time quantization in player preview
    const posterizeTimeEffect = activeShot.effects?.find(
      (fx: any) => fx.type === "posterize-time" || fx.type === "posterize_time" || fx.type === "posterizeTime"
    );
    if (posterizeTimeEffect) {
      const fps = posterizeTimeEffect.params?.frameRate ?? 24;
      const timeInShot = timelineTime - activeShot.timing.startTime;
      const quantizedTimeInShot = Math.floor(timeInShot * fps) / fps;
      
      if (activeShot.timing.speedRamp) {
        const { startSpeed, endSpeed, easing } = activeShot.timing.speedRamp;
        sourceTime = computeSpeedRampSourceTime(
          activeShot.source.inPoint,
          quantizedTimeInShot,
          activeShot.timing.duration,
          startSpeed ?? 1,
          endSpeed ?? startSpeed ?? 1,
          easing ?? "linear"
        );
      } else {
        const speed = activeShot.timing.speed || 1.0;
        sourceTime = activeShot.source.inPoint + quantizedTimeInShot * speed;
      }
    }

    try {
      await this.mediaLoader.seekVideo(video, sourceTime);
      
      // Guard against stale renders overriding newer frames
      if (serial !== this.latestRequestedRenderSerial) {
        return;
      }
    } catch (error) {
      if (serial !== this.latestRequestedRenderSerial) {
        return;
      }

      console.error("[MonetRenderer] Failed to seek active shot video", {
        shotId: activeShot.id,
        clipId: activeShot.source.clipId,
        timelineTime,
        sourceTime,
        error,
      });

      drawSimplePreviewFallback(ctx, this.edl, {
        reason: `Could not seek video for ${activeShot.id}.`,
        currentTime: timelineTime,
        width,
        height,
      });
      return;
    }

    if (serial !== this.latestRequestedRenderSerial) {
      return;
    }

    // Get offscreen canvas and context
    const { canvas: offscreenCanvas, ctx: offscreenCtx } = this.getOffscreenCanvas(width, height);

    // Render the transformed video onto the offscreen canvas
    offscreenCtx.save();
    offscreenCtx.fillStyle = "#000";
    offscreenCtx.fillRect(0, 0, width, height);

    applyShotTransformAndDraw({
      ctx: offscreenCtx,
      video,
      shot: activeShot,
      timelineTime,
      sourceTime,
      width,
      height,
      edl: this.edl,
    });

    // === Speed ramp motion blur ===
    // Apply directional blur proportional to instantaneous playback speed.
    // This is the visual signature of speed ramps — fast sections streak,
    // slow sections are crisp. Applied on the offscreen canvas after the
    // video frame is drawn but before compositing to the main canvas.
    const speedRampEffect = getShotEffect(activeShot, ["speed_ramp"]);
    if (speedRampEffect && activeShot.timing?.speedRamp) {
      const { startSpeed = 1, endSpeed = 1, easing = "linear" } = activeShot.timing.speedRamp;
      const localT = Math.max(0, timelineTime - activeShot.timing.startTime);
      const shotDur = Math.max(0.001, activeShot.timing.duration);
      const progress = Math.max(0, Math.min(1, localT / shotDur));
      const easedProgress = easing === "linear" ? progress : cubicBezier(progress, 0.42, 0, 0.58, 1);
      const currentSpeed = startSpeed + (endSpeed - startSpeed) * easedProgress;

      // Only blur when speed exceeds 1.3x — below that it looks muddy
      if (currentSpeed > 1.3) {
        const blurAmount = Math.min((currentSpeed - 1) * 2.5, 8); // max 8px blur
        const samples = Math.min(Math.ceil(blurAmount * 0.8), 5); // directional samples
        const intensity = getEffectParam(speedRampEffect, "intensity", 0.6);

        offscreenCtx.save();
        offscreenCtx.globalAlpha = intensity / samples;
        for (let i = 1; i <= samples; i++) {
          const offset = (i / samples) * blurAmount;
          // Vertical motion blur (most natural for speed ramps)
          offscreenCtx.drawImage(offscreenCanvas!, 0, -offset, width, height);
        }
        offscreenCtx.restore();
      }
    }

    offscreenCtx.restore();

    // Prepare main canvas context
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Reset standard effects on main context
    this.effects.resetEffects(ctx);

    const effectsParams = (activeShot.effects || []).map(fx => ({
      type: fx.type,
      intensity: fx.intensity,
      params: fx.params,
      startTime: fx.startTime,
      duration: fx.duration
    })).filter(fx => {
      const effectStartTime = fx.startTime ?? 0;
      const effectDuration = fx.duration ?? activeShot.timing.duration;
      const localTime = timelineTime - activeShot.timing.startTime;
      return localTime >= effectStartTime && localTime <= (effectStartTime + effectDuration);
    });

    // Separate pre-draw effects (transforms, shakes) from post-draw effects (grain, scanlines, etc.)
    // NOTE: context_shake is excluded here because it's already applied in applyShotTransformAndDraw.
    // Including it here would cause double-application (the EffectsEngine.applyShake overwrites the
    // shot-level shake, making it appear for only a split second).
    const preDrawEffects = effectsParams.filter(e => 
      !this.effects.hasCustomDraw([e]) && 
      ["shake", "zoom_pulse", "whip_pan", "color_grade"].includes(e.type)
    );
    const postDrawEffects = effectsParams.filter(e => 
      !this.effects.hasCustomDraw([e]) && 
      !["shake", "zoom_pulse", "context_shake", "whip_pan"].includes(e.type)
    );

    // Apply pre-draw effects (transforms) BEFORE drawing the image
    this.effects.applyEffects(ctx, preDrawEffects, width, height, timelineTime);

    // Draw offscreen canvas (with transforms) onto main context
    if (this.effects.hasCustomDraw(effectsParams)) {
      this.effects.customDraw(ctx, offscreenCanvas, effectsParams, width, height, timelineTime);
    } else {
      ctx.drawImage(offscreenCanvas, 0, 0, width, height);
    }

    // Apply post-draw effects (grain, scanlines, etc.) AFTER the image is drawn
    this.effects.applyEffects(ctx, postDrawEffects, width, height, timelineTime);

    ctx.restore();

    // Apply legacy internal effects on top
    applyShotEffects({
      ctx,
      shot: activeShot,
      timelineTime,
      width,
      height,
    });

    this.renderTextOverlays(
      timelineTime,
      activeShot,
      sourceTime,
      width,
      height,
      video
    );

    // === NEW: Dispatch specialized effects to their assigned engines ===
    const shotRouting = this.routing?.perShot.find(s => s.shotId === activeShot.id);
    if (shotRouting) {
      // Build a lookup of effects by their kind for this shot
      const effectsByKind = new Map<string, any>();
      for (const fx of activeShot.effects ?? []) {
        const kind = (fx as any).type ?? (fx as any).kind;
        if (kind) effectsByKind.set(kind, fx);
      }

      const shotLocalTime = timelineTime - activeShot.timing.startTime;
      const dispatchCtx: DispatchContext = {
        ctx,
        baseCanvas: this.canvas!,
        prevFrameCanvas: this.prevFrameCanvas ?? undefined,
        heldFrameCanvas: this.heldFrameCanvas ?? undefined,
        width,
        height,
        timelineTime,
        shotLocalTime,
        video,
      };

      // Iterate engines in order: shader-fx first (modifies base), then particles, then text on top
      const dispatchOrder: Array<keyof typeof shotRouting.engineLoad> = [
        "shader-fx", "webgl-blur", "webgl-grade", "canvas2d", "particle-fx", "text-engine",
      ];

      for (const engineId of dispatchOrder) {
        const effects = shotRouting.engineLoad[engineId];
        if (!effects || !effects.length) continue;
        await dispatchToEngine(engineId, effects, effectsByKind, dispatchCtx);
      }

      // Also dispatch to any other engines that were assigned (multi-engine stacking)
      for (const [engineId, effects] of Object.entries(shotRouting.engineLoad)) {
        if (dispatchOrder.includes(engineId as any)) continue;
        if (!effects || !effects.length) continue;
        await dispatchToEngine(engineId as any, effects, effectsByKind, dispatchCtx);
      }
    }

    // After all 2D drawing is complete, apply WebGL grade pass
    if (!this.webglGrade) {
      this.webglGrade = new WebGLGradeRenderer(width, height);
    } else {
      this.webglGrade.resize(width, height);
    }
    const gradeName = (this.edl as any)?.globalEffects?.colorGrade ?? "raw";
    const params = GRADE_PRESETS[gradeName] ?? GRADE_PRESETS.raw;
    if (this.canvas) {
      this.webglGrade.apply(this.canvas, params);
      ctx.drawImage(this.webglGrade.getCanvas(), 0, 0, width, height);
    }

    // Determine if frame_stutter is active on this shot
    const animTiming = activeShot.effects?.find(
      (e: any) => (e.type ?? e.kind) === "frame_stutter"
    )?.params?.animTiming ?? 1;

    this.updateFrameBuffers(width, height, animTiming);
  }

  private updateFrameBuffers(width: number, height: number, animTiming: number) {
    // Lazy-init
    if (!this.prevFrameCanvas) {
      this.prevFrameCanvas = document.createElement("canvas");
      this.prevFrameCanvas.width = width;
      this.prevFrameCanvas.height = height;
    } else if (this.prevFrameCanvas.width !== width || this.prevFrameCanvas.height !== height) {
      this.prevFrameCanvas.width = width;
      this.prevFrameCanvas.height = height;
    }

    if (!this.heldFrameCanvas) {
      this.heldFrameCanvas = document.createElement("canvas");
      this.heldFrameCanvas.width = width;
      this.heldFrameCanvas.height = height;
    } else if (this.heldFrameCanvas.width !== width || this.heldFrameCanvas.height !== height) {
      this.heldFrameCanvas.width = width;
      this.heldFrameCanvas.height = height;
    }

    // Copy current canvas → prev
    const prevCtx = this.prevFrameCanvas.getContext("2d")!;
    prevCtx.drawImage(this.canvas!, 0, 0, width, height);

    // Update held frame every N frames
    this.heldUpdateInterval = Math.max(1, animTiming);
    this.framesSinceHeldUpdate++;
    if (this.framesSinceHeldUpdate >= this.heldUpdateInterval) {
      const heldCtx = this.heldFrameCanvas.getContext("2d")!;
      heldCtx.drawImage(this.canvas!, 0, 0, width, height);
      this.framesSinceHeldUpdate = 0;
    }
  }

  private renderPlaceholderFrame(
    ctx: CanvasRenderingContext2D,
    shot: Shot,
    sourceTime: number,
    width: number,
    height: number
  ) {
    const progress =
      shot.timing.duration > 0
        ? Math.max(0, Math.min(1, (sourceTime - shot.timing.startTime) / shot.timing.duration))
        : 0;

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#050505");
    bg.addColorStop(0.5, "#10131a");
    bg.addColorStop(1, "#000000");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = shot.beatLock ? "#ffcc66" : "#ffffff";
    ctx.fillRect(0, 0, width * progress, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 54px system-ui";
    ctx.fillText(`Shot ${shot.id}`, width / 2, height * 0.44);
    ctx.font = "500 24px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(shot.source.clipId, width / 2, height * 0.52);
    ctx.font = "400 18px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(
      this.hasLoadedAnyAsset
        ? "Some media failed to load — showing a placeholder frame"
        : "No previewable media loaded — showing the edit structure",
      width / 2,
      height * 0.6
    );
    ctx.restore();

    if (shot.effects && shot.effects.length > 0) {
      ctx.save();
      ctx.strokeStyle = shot.effects.some((effect) => effect.type === "shake")
        ? "rgba(255,255,255,0.4)"
        : "rgba(255,204,102,0.45)";
      ctx.lineWidth = 8;
      ctx.strokeRect(24, 24, width - 48, height - 48);
      ctx.restore();
    }
  }

  private renderTextOverlays(
    timelineTime: number,
    shot: Shot,
    sourceTime: number,
    width: number,
    height: number,
    video: HTMLVideoElement
  ) {
    if (!this.edl || !this.renderContext) return;

    const overlays = (this.edl.textOverlays ?? []).filter(
      (overlay: TextOverlay) => timelineTime >= overlay.startTime && timelineTime <= overlay.endTime
    );

    if (overlays.length === 0) return;

    const { ctx } = this.renderContext;

    for (const overlay of overlays) {
      let x = overlay.offset?.x ?? 0;
      let y = overlay.offset?.y ?? 0;
      let planar: { centerX: number; centerY: number; angle: number; scale: number } | null = null;

      if (overlay.tracking) {
        if (overlay.tracking.mode === "planar") {
          const planarTrack = (this.edl.planarTracks ?? []).find(
            (t: PlanarTrack) => t.id === overlay.tracking?.trackId && t.clipId === shot.source.clipId
          );
          if (planarTrack) {
            planar = interpolatePlanarPoint(planarTrack, sourceTime);
          }
        } else {
          const track = (this.edl.motionTracks ?? []).find(
            (t: MotionTrack) => t.id === overlay.tracking?.trackId && t.clipId === shot.source.clipId
          );

          const tracked = track ? interpolateTrackPoint(track, sourceTime) : undefined;
          if (tracked) {
            x += tracked.x;
            y += tracked.y;
          }
        }
      }

      const pixelX = width * (0.5 + x * 0.5);
      const pixelY = height * (0.5 + y * 0.5);

      ctx.save();
      ctx.font = `${overlay.style?.weight ?? "700"} ${overlay.style?.fontSize ?? 42}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = overlay.style?.color ?? "#ffffff";

      if (overlay.style?.shadow ?? true) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 12;
      }

      if (planar) {
        const planarX = width * (0.5 + planar.centerX * 0.5);
        const planarY = height * (0.5 + planar.centerY * 0.5);
        ctx.translate(planarX, planarY);
        ctx.rotate(planar.angle);
        ctx.scale(planar.scale, planar.scale);
        ctx.fillText(overlay.text, 0, 0);
      } else {
        ctx.fillText(overlay.text, pixelX, pixelY);
      }
      ctx.restore();

      if (overlay.tracking?.mode === "behind_subject") {
        const occlusionRadius = Math.max(40, (overlay.style?.fontSize ?? 42) * 1.1);
        ctx.save();
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, occlusionRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();
      }
    }
  }

  private calculateRenderFrame(time: number): RenderFrame | null {
    if (!this.edl) return null;

    let currentShotIndex = -1;
    let currentShot: Shot | null = null;

    for (let i = 0; i < this.edl.shots.length; i++) {
      const shot = this.edl.shots[i];
      const shotEnd = shot.timing.startTime + shot.timing.duration;

      if (time >= shot.timing.startTime && time < shotEnd) {
        currentShotIndex = i;
        currentShot = shot;
        break;
      }
    }

    if (!currentShot) return null;

    const timeInShot = time - currentShot.timing.startTime;
    let sourceTime = 0;
    if (currentShot.timing.speedRamp) {
      const { startSpeed, endSpeed, easing } = currentShot.timing.speedRamp;
      sourceTime = computeSpeedRampSourceTime(
        currentShot.source.inPoint,
        timeInShot,
        currentShot.timing.duration,
        startSpeed ?? 1,
        endSpeed ?? startSpeed ?? 1,
        easing ?? "linear"
      );
    } else {
      const speed = currentShot.timing.speed || 1.0;
      sourceTime = currentShot.source.inPoint + timeInShot * speed;
    }

    let transition = undefined;
    if (currentShot.transition && currentShot.transition.type !== "cut") {
      const transitionDuration = currentShot.transition.duration;
      if (timeInShot < transitionDuration) {
        const easing = currentShot.transition.easing || "linear";
        const rawProgress = timeInShot / transitionDuration;
        const progress = this.transitions.applyEasing(rawProgress, easing);

        transition = {
          type: currentShot.transition.type,
          progress,
          prevShotIndex: currentShotIndex > 0 ? currentShotIndex - 1 : undefined,
        };
      }
    }

    const transform = {
      scale: resolveNumberAtTime(currentShot.transform?.scale, timeInShot, 1.0),
      rotation: resolveNumberAtTime(currentShot.transform?.rotation, timeInShot, 0),
      position: resolvePointAtTime(currentShot.transform?.position, timeInShot, { x: 0, y: 0 }),
    };

    const effects = (currentShot.effects || []).map((effect) => ({
      type: effect.type,
      intensity: effect.intensity,
      startTime: effect.startTime,
      duration: effect.duration,
      params: effect.params,
    }));

    return {
      time,
      shotIndex: currentShotIndex,
      sourceTime,
      effects,
      transform,
      transition,
    };
  }

  private applyTransform(
    ctx: CanvasRenderingContext2D,
    transform: { scale: number; rotation: number; position: { x: number; y: number } },
    width: number,
    height: number
  ) {
    const { scale, rotation, position } = transform;

    ctx.translate(width / 2, height / 2);

    if (scale !== 1.0) {
      ctx.scale(scale, scale);
    }

    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    const offsetX = position.x * width;
    const offsetY = position.y * height;
    ctx.translate(offsetX, offsetY);

    ctx.translate(-width / 2, -height / 2);
  }

  getDuration(): number {
    return this.edl?.timeline.duration || 0;
  }

  cleanup(options: { keepMedia?: boolean } = { keepMedia: true }) {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (!options.keepMedia) {
      this.mediaLoader.cleanup();
    }
    disposeDispatcher();
    this.routing = null;
    this.edl = null;
    this.renderContext = null;
    this.previousFrameData = null;
    this.hasLoadedAnyAsset = false;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.lastRenderedFrameKey = null;
    if (this.canvas) {
      this.canvas.style.filter = "none";
    }
  }
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getLocalShotTime(shot: Shot, timelineTime: number): number {
  return Math.max(0, timelineTime - shot.timing.startTime);
}

function evaluateKeyframeableNumber(value: unknown, fallback: number, localTime: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }

  const keyframes = value
    .filter((kf) => {
      return (
        kf &&
        typeof kf === "object" &&
        typeof kf.time === "number" &&
        typeof kf.value === "number"
      );
    })
    .sort((a, b) => a.time - b.time);

  if (keyframes.length === 0) return fallback;
  if (localTime <= keyframes[0].time) return keyframes[0].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];

    if (localTime >= a.time && localTime <= b.time) {
      const span = Math.max(0.001, b.time - a.time);
      const t = Math.max(0, Math.min(1, (localTime - a.time) / span));
      return a.value + (b.value - a.value) * t;
    }
  }

  return keyframes[keyframes.length - 1].value;
}

function getEffectId(effect: any): string {
  if (typeof effect === "string") return effect;
  return effect?.type ?? effect?.id ?? "unknown";
}

function getEffectParam(effect: any, key: string, fallback: number): number {
  const direct = effect?.[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const nested = effect?.params?.[key];
  if (typeof nested === "number" && Number.isFinite(nested)) return nested;

  return fallback;
}

function getShotEffect(shot: Shot, ids: string[]): any | null {
  for (const effect of shot.effects ?? []) {
    if (ids.includes(getEffectId(effect))) return effect;
  }
  return null;
}

function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function getLocalShotProgress(shot: Shot, timelineTime: number): number {
  const local = Math.max(0, timelineTime - shot.timing.startTime);
  const duration = Math.max(0.001, shot.timing.duration);
  return Math.max(0, Math.min(1, local / duration));
}

function getVideoRotation(video: HTMLVideoElement): number {
  // Check for cached rotation
  const cached = (video as any).__monetRotationCached;
  if (typeof cached === "number" && cached !== 0) return cached;

  // Check for explicit rotation hint stored on the element
  const explicit = (video as any).__monetRotation;
  if (typeof explicit === "number") {
    (video as any).__monetRotationCached = explicit;
    return explicit;
  }

  // Check if the browser applies rotation via CSS transform
  // (Safari, Chrome apply this for MP4/MOV rotation metadata)
  try {
    const computedStyle = window.getComputedStyle(video);
    const transform = computedStyle.transform || video.style.transform || "";
    const rotateMatch = transform.match(/rotate\((\d+)deg\)/);
    if (rotateMatch) {
      const deg = parseInt(rotateMatch[1], 10);
      if (deg === 90 || deg === 180 || deg === 270) {
        (video as any).__monetRotationCached = deg;
        return deg;
      }
    }
  } catch {}

  // Frame is upside down → 180
  if ((video as any).__monetUpsideDown) {
    (video as any).__monetRotationCached = 180;
    return 180;
  }

  // Cache 0 as default — don't re-detect every frame
  (video as any).__monetRotationCached = 0;
  return 0;
}

function applyShotTransformAndDraw(params: {
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
  shot: Shot;
  timelineTime: number;
  sourceTime: number;
  width: number;
  height: number;
  edl?: any;
}): void {
  const { ctx, video, shot, timelineTime, width, height, edl } = params;
  const localTime = getLocalShotTime(shot, timelineTime);

  let scale = evaluateKeyframeableNumber(shot.transform?.scale, 1, localTime);
  const rotationDegrees = evaluateKeyframeableNumber(shot.transform?.rotation, 0, localTime);
  const opacity = evaluateKeyframeableNumber(shot.transform?.opacity, 1, localTime);

  const isStrict = shot.meta?.styleMode === "strict_replication";

  const pushIn = getShotEffect(shot, ["push_in", "auto_push_in"]);
  if (pushIn) {
    const progress = getLocalShotProgress(shot, timelineTime);
    const scaleFrom = getEffectParam(pushIn, "scaleFrom", 1);
    const scaleTo = getEffectParam(pushIn, "scaleTo", isStrict ? 1.18 : 1.08);
    scale *= scaleFrom + (scaleTo - scaleFrom) * easeOutCubic(progress);
  }

  const speedRamp = getShotEffect(shot, ["speed_ramp"]);
  if (speedRamp) {
    const progress = getLocalShotProgress(shot, timelineTime);
    const easedProgress = cubicBezier(progress, 0.42, 0, 0.58, 1);
    const punch = Math.sin(easedProgress * Math.PI) * (isStrict ? 0.065 : 0.045);
    scale *= 1 + punch;
  }

  const videoAspect = video.videoWidth > 0 && video.videoHeight > 0
    ? video.videoWidth / video.videoHeight
    : width / height;

  const canvasAspect = width / height;

  let drawWidth = width;
  let drawHeight = height;

  if (videoAspect > canvasAspect) {
    drawHeight = height;
    drawWidth = height * videoAspect;
  } else {
    drawWidth = width;
    drawHeight = width / videoAspect;
  }

  drawWidth *= scale;
  drawHeight *= scale;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  let shakeX = 0;
  let shakeY = 0;

  const shake = getShotEffect(shot, ["context_shake", "shake"]);
  if (shake) {
    const progress = getLocalShotProgress(shot, timelineTime);
    const intensity = getEffectParam(shake, "intensity", 0.35);
    const decay = getEffectParam(shake, "decay", 0.65);
    const amplitude = intensity * (isStrict ? 42 : 28) * Math.pow(1 - progress, decay);

    shakeX = Math.sin(progress * Math.PI * 18) * amplitude;
    shakeY = Math.cos(progress * Math.PI * 22) * amplitude * 0.65;
  }

  ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
  ctx.rotate((rotationDegrees * Math.PI) / 180);

  // === apply source rotation correction ===
  // Always render right-side-up by default. Phone uploads and metadata-tagged
  // videos sometimes carry rotation hints — respect those, otherwise no rotation.
  const explicitRotation =
    (shot.source as any)?.rotation ??
    edl?.timeline?.sourceRotation;

  const videoRotation = getVideoRotation(video);

  // Final rotation: explicit override wins, otherwise use detected
  // (NO +180 hack — the previous default was wrong)
  const sourceRotation = explicitRotation ?? videoRotation;

  if (sourceRotation !== 0) {
    ctx.rotate((sourceRotation * Math.PI) / 180);
  }

  ctx.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function applyShotEffects(params: {
  ctx: CanvasRenderingContext2D;
  shot: Shot;
  timelineTime: number;
  width: number;
  height: number;
}): void {
  const { ctx, shot, timelineTime, width, height } = params;
  const localTime = getLocalShotTime(shot, timelineTime);

  const seen = new Set<string>();
  const dedupedEffects = (shot.effects ?? []).filter((e: any) => {
    const id = e.type ?? e.kind ?? "unknown";
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  for (const effect of dedupedEffects) {
    if ((effect as any).enabled === false) continue;

    const effectId = getEffectId(effect);
    const intensity = readNumber((effect as any).intensity, getEffectParam(effect, "intensity", 1));

    if (effectId === "impact_flash" || effectId === "flash_white" || effectId === "flash_black") {
      const flashStart = getEffectParam(effect, "startTime", 0);
      const flashDuration = getEffectParam(effect, "duration", getEffectParam(effect, "durationSec", 0.08));

      if (localTime >= flashStart && localTime <= flashStart + flashDuration) {
        const isFlashFrame = flashDuration <= 0.05;
        const t = (localTime - flashStart) / Math.max(0.001, flashDuration);

        if (isFlashFrame) {
          const flashColor = (effect as any).params?.flashColor === 0
            || (effect as any).params?.flashColor === "black"
            || effectId === "flash_black"
            ? "#000000" : "#ffffff";
          ctx.save();
          ctx.fillStyle = flashColor;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        } else {
          const flashProgress = 1 - t;
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = Math.min(0.4, intensity * flashProgress);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      }
    }

    if (effectId === "speed_ramp") {
      const rampStart = getEffectParam(effect, "startTime", 0);
      const rampDuration = getEffectParam(effect, "duration", shot.timing.duration);
      const windowEnd = rampStart + rampDuration;

      if (localTime >= rampStart && localTime <= windowEnd) {
        const t = (localTime - rampStart) / Math.max(0.001, rampDuration);
        const punch = Math.sin(t * Math.PI);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.10, punch * intensity);
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }

    if (effectId === "color_pulse") {
      const pulseStart = getEffectParam(effect, "startTime", 0);
      const pulseDuration = getEffectParam(effect, "duration", 0.4);

      if (localTime >= pulseStart && localTime <= pulseStart + pulseDuration) {
        const t = (localTime - pulseStart) / Math.max(0.001, pulseDuration);
        const pulse = Math.sin(t * Math.PI);
        const tint = (effect as any).params?.color ?? "rgba(255, 80, 40, 1)";
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.25, intensity * pulse);
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }

    if (effectId === "glow" || effectId === "neon_glow") {
      ctx.save();
      ctx.globalAlpha = Math.min(0.15, intensity * 0.16);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (effectId === "whip_transition") {
      const whipStart = getEffectParam(effect, "startTime", 0);
      const whipDuration = getEffectParam(effect, "duration", getEffectParam(effect, "durationSec", 0.12));

      if (localTime >= whipStart && localTime <= whipStart + whipDuration) {
        const t = (localTime - whipStart) / Math.max(0.001, whipDuration);
        const p = 1 - t;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.18, p * intensity);
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.fillRect(0, 0, width, height);

        ctx.globalAlpha = Math.min(0.12, p * intensity);
        ctx.fillStyle = "rgba(120,180,255,1)";
        ctx.fillRect(0, 0, width * p, height);
        ctx.restore();
      }
    }

    if (effectId === "vignette") {
      const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.25,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72
      );

      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.8, intensity * 0.4)})`);

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (effectId === "vignette_punch") {
      const punchStart = getEffectParam(effect, "startTime", 0);
      const punchDuration = getEffectParam(effect, "duration", 0.3);

      if (localTime >= punchStart && localTime <= punchStart + punchDuration) {
        const t = (localTime - punchStart) / Math.max(0.001, punchDuration);
        const pulse = Math.sin(t * Math.PI);
        const strength = intensity * pulse;

        const gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.15,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.65
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, strength * 0.7)})`);

        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }

    if (effectId === "chromatic_burst") {
      const burstStart = getEffectParam(effect, "startTime", 0);
      const burstDuration = getEffectParam(effect, "duration", 0.15);

      if (localTime >= burstStart && localTime <= burstStart + burstDuration) {
        const t = (localTime - burstStart) / Math.max(0.001, burstDuration);
        const burst = Math.sin(t * Math.PI);
        const offset = Math.round(burst * intensity * 12);

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = burst * 0.4;

        // Red channel shifted left
        ctx.fillStyle = "rgba(255,0,0,0.3)";
        ctx.fillRect(-offset, 0, width, height);

        // Blue channel shifted right
        ctx.fillStyle = "rgba(0,0,255,0.3)";
        ctx.fillRect(offset, 0, width, height);

        ctx.restore();
      }
    }
  }
}

function resolveNumberAtTime(value: unknown, time: number, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return defaultValue;
  }

  const keyframes = value
    .map((entry) => entry as { time?: unknown; value?: unknown })
    .filter(
      (entry): entry is { time: number; value: number } =>
        typeof entry.time === "number" &&
        Number.isFinite(entry.time) &&
        typeof entry.value === "number" &&
        Number.isFinite(entry.value)
    )
    .sort((a, b) => a.time - b.time);

  if (keyframes.length === 0) return defaultValue;
  if (time <= keyframes[0].time) return keyframes[0].value;

  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) return last.value;

  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1];
    const next = keyframes[i];
    if (time >= prev.time && time <= next.time) {
      const t = (time - prev.time) / Math.max(0.0001, next.time - prev.time);
      return prev.value + (next.value - prev.value) * t;
    }
  }

  return defaultValue;
}

function resolvePointAtTime(
  value: unknown,
  time: number,
  defaultValue: { x: number; y: number }
): { x: number; y: number } {
  if (Array.isArray(value) && value.length > 0) {
    const keyframes = value
      .map((entry) => entry as { time?: unknown; value?: unknown })
      .filter(
        (
          entry
        ): entry is {
          time: number;
          value: { x: number; y: number };
        } =>
          typeof entry.time === "number" &&
          Number.isFinite(entry.time) &&
          typeof entry.value === "object" &&
          entry.value !== null &&
          typeof (entry.value as { x?: unknown }).x === "number" &&
          typeof (entry.value as { y?: unknown }).y === "number"
      )
      .sort((a, b) => a.time - b.time);

    if (keyframes.length === 0) return defaultValue;
    if (time <= keyframes[0].time) return keyframes[0].value;

    const last = keyframes[keyframes.length - 1];
    if (time >= last.time) return last.value;

    for (let i = 1; i < keyframes.length; i++) {
      const prev = keyframes[i - 1];
      const next = keyframes[i];
      if (time >= prev.time && time <= next.time) {
        const t = (time - prev.time) / Math.max(0.0001, next.time - prev.time);
        return {
          x: prev.value.x + (next.value.x - prev.value.x) * t,
          y: prev.value.y + (next.value.y - prev.value.y) * t,
        };
      }
    }

    return defaultValue;
  }

  if (typeof value === "object" && value !== null) {
    const point = value as { x?: unknown; y?: unknown };
    return {
      x: typeof point.x === "number" && Number.isFinite(point.x) ? point.x : defaultValue.x,
      y: typeof point.y === "number" && Number.isFinite(point.y) ? point.y : defaultValue.y,
    };
  }

  return defaultValue;
}

// ─── Color grade CSS filter map ────────────────────────────────────────────
// Applied once on the canvas element at initialize() time.
// Values derived from common color science principles for each genre.

function colorGradeToFilter(grade: string | undefined): string {
  switch (grade) {
    case "cinematic":
      // Teal-orange: desaturate slightly, boost contrast, cool shadows
      return "contrast(1.15) saturate(0.82) brightness(0.95) hue-rotate(5deg)";
    case "vibrant":
      // Punchy: high saturation, warm, high contrast
      return "saturate(1.5) contrast(1.12) brightness(1.04)";
    case "vintage":
      // Faded warm: slight sepia, reduced contrast, lifted shadows
      return "sepia(0.28) contrast(0.92) brightness(1.08) saturate(0.88)";
    case "monochrome":
      return "grayscale(1) contrast(1.12)";
    case "anime":
      // High contrast, saturated primaries, slight warm push
      return "contrast(1.35) saturate(1.6) brightness(1.05)";
    case "wong-kar-wai":
      // Signature: heavy green/teal cast, high contrast, slight motion blur feel (simulated via brightness/contrast)
      return "contrast(1.25) saturate(1.1) hue-rotate(140deg) brightness(0.9) sepia(0.2)";
    case "raw":
    default:
      return "none";
  }
}

// ─── Vignette overlay ────────────────────────────────────────────────────────
// Composited per-frame as a radial gradient on the canvas.

function applyVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number
): void {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.35,
    width / 2, height / 2, Math.max(width, height) * 0.75
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${(strength * 0.85).toFixed(2)})`);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function interpolateTrackPoint(
  track: { keyframes: Array<{ time: number; x: number; y: number }> },
  time: number
) {
  if (track.keyframes.length === 0) return null;
  const first = track.keyframes[0];
  const last = track.keyframes[track.keyframes.length - 1];
  if (time <= first.time) return { x: first.x, y: first.y };
  if (time >= last.time) return { x: last.x, y: last.y };

  for (let i = 1; i < track.keyframes.length; i++) {
    const prev = track.keyframes[i - 1];
    const next = track.keyframes[i];
    if (time >= prev.time && time <= next.time) {
      const t = (time - prev.time) / Math.max(0.0001, next.time - prev.time);
      return {
        x: prev.x + (next.x - prev.x) * t,
        y: prev.y + (next.y - prev.y) * t,
      };
    }
  }
  return null;
}

function interpolatePlanarPoint(
  track: { keyframes: Array<{ time: number; corners: Array<{ x: number; y: number }> }> },
  time: number
) {
  if (track.keyframes.length === 0) return null;
  const first = track.keyframes[0];
  const last = track.keyframes[track.keyframes.length - 1];
  if (time <= first.time) return planarFromCorners(first.corners);
  if (time >= last.time) return planarFromCorners(last.corners);

  for (let i = 1; i < track.keyframes.length; i++) {
    const prev = track.keyframes[i - 1];
    const next = track.keyframes[i];
    if (time >= prev.time && time <= next.time) {
      const t = (time - prev.time) / Math.max(0.0001, next.time - prev.time);
      const prevPlanar = planarFromCorners(prev.corners);
      const nextPlanar = planarFromCorners(next.corners);
      return {
        centerX: prevPlanar.centerX + (nextPlanar.centerX - prevPlanar.centerX) * t,
        centerY: prevPlanar.centerY + (nextPlanar.centerY - prevPlanar.centerY) * t,
        angle: prevPlanar.angle + (nextPlanar.angle - prevPlanar.angle) * t,
        scale: prevPlanar.scale + (nextPlanar.scale - prevPlanar.scale) * t,
      };
    }
  }
  return null;
}

function planarFromCorners(corners: Array<{ x: number; y: number }>) {
  const centerX = corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length;
  const centerY = corners.reduce((sum, corner) => sum + corner.y, 0) / corners.length;
  const topWidth = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const bottomWidth = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
  const scale = Math.max(0.5, (topWidth + bottomWidth) / 2);
  const angle = Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x);
  return { centerX, centerY, angle, scale };
}
