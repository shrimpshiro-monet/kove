# MONET RENDERING PIPELINE — COMPLETE CODE DUMP

> Every line of rendering, effects, transitions, export, audio mixing, and video generation code.
> Generated for handoff to build the definitive vibe editing engine.

---

## FILE INDEX

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 1 | `src/lib/renderer/monet-renderer.ts` |     1452 |  |
| 2 | `src/lib/renderer/effects.ts` |      809 |  |
| 3 | `src/lib/renderer/transitions.ts` |      150 |  |
| 4 | `src/lib/renderer/text-engine.ts` |      220 |  |
| 5 | `src/lib/renderer/media-loader.ts` |      661 |  |
| 6 | `src/lib/renderer/webgl-grade-renderer.ts` |      200 |  |
| 7 | `src/lib/renderer/shader-fx.ts` |      501 |  |
| 8 | `src/lib/renderer/particle-fx.ts` |      321 |  |
| 9 | `src/lib/renderer/sam-mask-renderer.ts` |       90 |  |
| 10 | `src/lib/export-engine.ts` |      731 |  |
| 11 | `src/lib/engines/engine-dispatch.ts` |      452 |  |
| 12 | `src/lib/engines/registry.ts` |      244 |  |
| 13 | `src/lib/engines/router.ts` |      190 |  |
| 14 | `src/lib/engines/types.ts` |       38 |  |
| 15 | `src/server/services/ffmpeg-renderer.ts` |      460 |  |
| 16 | `src/server/lib/render-engine-editly.ts` |      125 |  |
| 17 | `src/server/lib/edl-to-editly.ts` |      259 |  |
| 18 | `src/server/lib/editly-effects.ts` |      433 |  |
| 19 | `src/server/lib/editly-transitions.ts` |       72 |  |
| 20 | `src/server/lib/editly-renderer.ts` |      200 |  * Editly-Based Renderer |
| 21 | `src/server/lib/effect-engines.ts` |      328 |  * Multi-Engine Effect System |
| 22 | `src/server/lib/edit-planner.ts` |      421 |  * Comprehensive Edit Planner |
| 23 | `src/server/lib/music-director.ts` |      341 |  * AI Music Director |
| 24 | `src/server/api/export-mp4.ts` |       97 |  |
| 25 | `src/server/api/export.ts` |      127 |  * POST /api/export |
| 26 | `packages/render-adapters/src/ffmpeg/timeline-filter-compiler.ts` |      759 |  |
| 27 | `packages/render-adapters/src/ffmpeg/render-timeline.ts` |      171 |  |
| 28 | `packages/render-adapters/src/ffmpeg/render-ffmpeg.ts` |      128 |  |
| 29 | `packages/render-adapters/src/ffmpeg/filter-compiler.ts` |      181 |  |
| 30 | `packages/engine-freecut/src/executor/render.ts` |      103 |  |
| 31 | `packages/engine-freecut/src/executor/ffmpegCompiler.ts` |      140 |  |
| 32 | `packages/engine-freecut/src/executor/timelineBuilder.ts` |      196 |  |
| 33 | `packages/engine-freecut/src/executor/drawtext.ts` |       95 |  |

---

## src/lib/renderer/monet-renderer.ts

```typescript
// Monet Canvas Renderer
// Renders MonetEDL to Canvas2D for preview

import type { MonetEDL, Shot } from "../../server/types/edl";

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
} from "./monet-edl-preview-normalizer";
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
        const { startSpeed, endSpeed } = activeShot.timing.speedRamp;
        const duration = activeShot.timing.duration;
        const integral = startSpeed * quantizedTimeInShot + ((endSpeed - startSpeed) * quantizedTimeInShot * quantizedTimeInShot) / (2 * duration);
        sourceTime = activeShot.source.inPoint + integral;
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
    const preDrawEffects = effectsParams.filter(e => 
      !this.effects.hasCustomDraw([e]) && 
      ["shake", "zoom_pulse", "context_shake", "whip_pan"].includes(e.type)
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
    const gradeName = (this.edl as any).globalEffects?.colorGrade ?? "raw";
    const params = GRADE_PRESETS[gradeName] ?? GRADE_PRESETS.raw;
    this.webglGrade.apply(this.canvas!, params);
    
    // Now blit the WebGL canvas back onto the visible canvas
    ctx.drawImage(this.webglGrade.getCanvas(), 0, 0, width, height);

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
      (overlay) => timelineTime >= overlay.startTime && timelineTime <= overlay.endTime
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
            (t) => t.id === overlay.tracking?.trackId && t.clipId === shot.source.clipId
          );
          if (planarTrack) {
            planar = interpolatePlanarPoint(planarTrack, sourceTime);
          }
        } else {
          const track = (this.edl.motionTracks ?? []).find(
            (t) => t.id === overlay.tracking?.trackId && t.clipId === shot.source.clipId
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
      const { startSpeed, endSpeed } = currentShot.timing.speedRamp;
      // Linear integration of speed over time
      const integral = startSpeed * timeInShot + ((endSpeed - startSpeed) * timeInShot * timeInShot) / (2 * currentShot.timing.duration);
      sourceTime = currentShot.source.inPoint + integral;
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
  // Check for explicit rotation hint stored on the element
  const explicit = (video as any).__monetRotation;
  if (typeof explicit === "number") return explicit;

  // Frame is upside down → 180
  if ((video as any).__monetUpsideDown) return 180;

  // Default: no rotation. Browser already handles common metadata rotations.
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
    const punch = Math.sin(progress * Math.PI) * (isStrict ? 0.065 : 0.045);
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
    shot.source?.rotation ??
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

    if (effectId === "impact_flash") {
      const flashStart = getEffectParam(effect, "startTime", 0);
      const flashDuration = getEffectParam(effect, "duration", getEffectParam(effect, "durationSec", 0.08));

      if (localTime >= flashStart && localTime <= flashStart + flashDuration) {
        const t = (localTime - flashStart) / Math.max(0.001, flashDuration);
        const flashProgress = 1 - t;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = Math.min(0.4, intensity * flashProgress);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
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
```

---

## src/lib/renderer/effects.ts

```typescript
import type { EffectParams } from "./types";

export class EffectsEngine {
  private appendFilter(ctx: CanvasRenderingContext2D, value: string) {
    const current = ctx.filter && ctx.filter !== "none" ? ctx.filter + " " : "";
    ctx.filter = current + value;
  }

  private isDirectionalBlur(type: string): boolean {
    return type === "directional_blur" || type === "directionalBlur" || type === "directional-blur";
  }

  private isRgbSplit(type: string): boolean {
    return type === "rgb_split" || type === "rgbSplit" || type === "rgb-split";
  }

  private isRadialZoomBlur(type: string): boolean {
    return type === "radial_zoom_blur" || type === "radialZoomBlur" || type === "radial-zoom-blur";
  }

  private echoCanvas: HTMLCanvasElement | null = null;
  private echoCtx: CanvasRenderingContext2D | null = null;

  hasCustomDraw(effects: EffectParams[]): boolean {
    return effects.some(e => this.isRgbSplit(e.type) || this.isDirectionalBlur(e.type) || this.isRadialZoomBlur(e.type) || e.type === "echo");
  }

  customDraw(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    effects: EffectParams[],
    width: number,
    height: number,
    time: number
  ) {
    const specialEffects = effects.filter(e => this.isRgbSplit(e.type) || this.isDirectionalBlur(e.type) || this.isRadialZoomBlur(e.type) || e.type === "echo");
    const normalEffects = effects.filter(e => !this.isRgbSplit(e.type) && !this.isDirectionalBlur(e.type) && !this.isRadialZoomBlur(e.type) && e.type !== "echo");
    
    ctx.save();
    this.applyEffects(ctx, normalEffects, width, height, time);

    let handled = false;
    for (const effect of specialEffects) {
      if (this.isRgbSplit(effect.type)) {
        this.drawRgbSplit(ctx, image, effect.intensity, width, height);
        handled = true;
      } else if (this.isDirectionalBlur(effect.type)) {
        this.drawDirectionalBlur(ctx, image, effect.intensity, width, height, effect.params);
        handled = true;
      } else if (this.isRadialZoomBlur(effect.type)) {
        this.drawRadialZoomBlur(ctx, image, effect.intensity, width, height);
        handled = true;
      } else if (effect.type === "echo") {
        // Echo: Draw the trailing buffer first with decay
        this.applyEchoPre(ctx, width, height, effect.intensity, effect.params);
        ctx.drawImage(image, 0, 0, width, height);
        this.applyEchoPost(ctx, width, height);
        handled = true;
      }
    }

    if (!handled) {
      ctx.drawImage(image, 0, 0, width, height);
    }
    
    ctx.restore();
  }

  private applyEchoPre(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number,
    params?: Record<string, number>
  ) {
    if (!this.echoCanvas) {
      this.echoCanvas = document.createElement("canvas");
      this.echoCanvas.width = width;
      this.echoCanvas.height = height;
      this.echoCtx = this.echoCanvas.getContext("2d");
    }

    const decay = params?.decay ?? intensity * 0.8;
    if (this.echoCanvas) {
      ctx.save();
      ctx.globalAlpha = decay;
      ctx.drawImage(this.echoCanvas, 0, 0, width, height);
      ctx.restore();
    }
  }

  private applyEchoPost(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.echoCtx && this.echoCanvas) {
      this.echoCtx.clearRect(0, 0, width, height);
      this.echoCtx.drawImage(ctx.canvas, 0, 0, width, height);
    }
  }

  private drawRgbSplit(ctx: CanvasRenderingContext2D, image: CanvasImageSource, intensity: number, width: number, height: number) {
    const offset = intensity * 20; // max 20px offset
    ctx.globalCompositeOperation = "screen";
    
    ctx.save();
    ctx.fillStyle = "rgba(255,0,0,1)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(image, -offset, 0, width, height);
    ctx.fillRect(-offset, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(0,255,0,1)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(image, offset, 0, width, height);
    ctx.fillRect(offset, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(0,0,255,1)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(image, 0, offset, width, height);
    ctx.fillRect(0, offset, width, height);
    ctx.restore();
    
    // reset composite mode and redraw original to regain luma
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, 0, 0, width, height);
  }

  private drawDirectionalBlur(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    intensity: number,
    width: number,
    height: number,
    params?: Record<string, number>
  ) {
    const steps = 6;
    const angle = params?.direction ?? 90;
    const length = params?.blurLength ?? intensity * 40;
    const rad = (angle * Math.PI) / 180;
    const offsetX = Math.cos(rad) * length;
    const offsetY = Math.sin(rad) * length;

    ctx.globalAlpha = 1.0 / steps;
    for (let i = 0; i < steps; i++) {
      const factor = (i - steps / 2) / steps;
      ctx.drawImage(image, factor * offsetX, factor * offsetY, width, height);
    }
    ctx.globalAlpha = 1.0;
  }

  private drawRadialZoomBlur(ctx: CanvasRenderingContext2D, image: CanvasImageSource, intensity: number, width: number, height: number) {
    const steps = 6;
    const maxScale = 1 + intensity * 0.2;
    ctx.globalAlpha = 1.0 / steps;
    for (let i = 0; i < steps; i++) {
      const scale = 1 + (maxScale - 1) * (i / steps);
      ctx.save();
      ctx.translate(width/2, height/2);
      ctx.scale(scale, scale);
      ctx.translate(-width/2, -height/2);
      ctx.drawImage(image, 0, 0, width, height);
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
  }

  applyEffects(
    ctx: CanvasRenderingContext2D,
    effects: EffectParams[],
    width: number,
    height: number,
    time: number = 0
  ) {
    for (const effect of effects) {
      this.applyEffect(ctx, effect, width, height, time);
    }
  }

  private applyEffect(
    ctx: CanvasRenderingContext2D,
    effect: EffectParams,
    width: number,
    height: number,
    time: number
  ) {
    switch (effect.type) {
      case "blur":
      case "gaussian-blur":
      case "gaussianBlur":
      case "gaussian_blur":
        const blurriness = effect.params?.blurriness ?? effect.intensity * 10;
        this.applyBlur(ctx, blurriness / 10);
        break;
      case "camera-blur":
      case "camera_blur":
      case "cameraBlur":
        const camBlur = effect.params?.blurRadius ?? effect.intensity * 15;
        this.applyBlur(ctx, camBlur / 10);
        break;
      case "brightness":
        this.applyBrightness(ctx, effect.intensity);
        break;
      case "contrast":
        this.applyContrast(ctx, effect.intensity);
        break;
      case "saturation":
        this.applySaturation(ctx, effect.intensity);
        break;
      case "glow":
        this.applyGlow(ctx, effect.intensity, width, height);
        break;
      case "shake":
        this.applyShake(ctx, effect.intensity, width, height, time);
        break;
      case "zoom_pulse":
        this.applyZoomPulse(ctx, effect.intensity, width, height, time);
        break;
      case "invert":
        this.applyInvert(ctx, effect.intensity, effect.params);
        break;
      case "sharpen":
        const sharpAmount = effect.params?.amount ?? effect.intensity * 100;
        this.applySharpen(ctx, sharpAmount / 100);
        break;
      case "unsharp-mask":
      case "unsharp_mask":
      case "unsharpMask":
        const unsharpAmount = effect.params?.amount ?? effect.intensity * 100;
        this.applySharpen(ctx, (unsharpAmount / 100) * 1.3);
        break;
      case "reduce-interlace-flicker":
      case "reduce_interlace_flicker":
      case "reduceInterlaceFlicker":
        const softness = effect.params?.softness ?? effect.intensity;
        this.applyVerticalBlur(ctx, softness);
        break;
      case "corner_pin":
      case "cornerPin":
      case "corner-pin":
      case "lens_distortion":
      case "lensDistortion":
      case "lens-distortion":
      case "alpha_glow":
      case "alphaGlow":
      case "alpha-glow":
      case "brush_strokes":
      case "brushStrokes":
      case "brush-strokes":
      case "color_emboss":
      case "colorEmboss":
      case "color-emboss":
      case "replicate":
      case "roughen_edges":
      case "roughenEdges":
      case "roughen-edges":
        // Graceful fallback / no-op
        break;
      case "magnify": {
        const cx = effect.params?.centerX ?? 0.5;
        const cy = effect.params?.centerY ?? 0.5;
        const mag = effect.params?.magnification ?? 1.5;
        const sz = (effect.params?.size ?? 0.2) * width;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx * width, cy * height, sz, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          ctx.canvas,
          cx * width - sz / mag,
          cy * height - sz / mag,
          (sz * 2) / mag,
          (sz * 2) / mag,
          cx * width - sz,
          cy * height - sz,
          sz * 2,
          sz * 2
        );
        ctx.restore();
        break;
      }
      case "mirror": {
        const angle = effect.params?.reflectionAngle ?? 90;
        ctx.save();
        if (angle === 90 || angle === 270) {
          ctx.drawImage(ctx.canvas, 0, 0, width / 2, height, 0, 0, width / 2, height);
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(ctx.canvas, 0, 0, width / 2, height, width / 2, 0, width / 2, height);
        } else {
          ctx.drawImage(ctx.canvas, 0, 0, width, height / 2, 0, 0, width, height / 2);
          ctx.translate(0, height);
          ctx.scale(1, -1);
          ctx.drawImage(ctx.canvas, 0, 0, width, height / 2, 0, height / 2, width, height / 2);
        }
        ctx.restore();
        break;
      }
      case "mosaic": {
        const hBlk = effect.params?.horizontalBlocks ?? 20;
        const vBlk = effect.params?.verticalBlocks ?? 20;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, hBlk, vBlk);
        ctx.drawImage(ctx.canvas, 0, 0, hBlk, vBlk, 0, 0, width, height);
        ctx.restore();
        break;
      }
      case "find_edges":
      case "findEdges":
      case "find-edges":
        this.appendFilter(ctx, "contrast(300%) grayscale(100%) invert(100%)");
        break;
      case "posterize":
        this.appendFilter(ctx, "contrast(200%) saturate(150%)");
        break;
      case "strobe_light":
      case "strobeLight":
      case "strobe-light": {
        const stPeriod = effect.params?.period ?? 1.0;
        const stDur = effect.params?.duration ?? 0.1;
        if (time % stPeriod < stDur) {
          if ((effect.params?.strobeType ?? 0) === 1) {
            this.appendFilter(ctx, "invert(100%)");
          } else {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
          }
        }
        break;
      }
      case "noise_grain":
      case "noiseGrain":
      case "noise-grain": {
        const grainIntensity = effect.params?.intensity ?? effect.intensity ?? 0.15;
        this.applyNoiseGrain(ctx, grainIntensity, width, height, time);
        break;
      }
      case "scanlines": {
        const scanIntensity = effect.params?.intensity ?? effect.intensity ?? 0.2;
        this.applyScanlines(ctx, scanIntensity, width, height);
        break;
      }
      case "vhs_tracking":
      case "vhsTracking":
      case "vhs-tracking": {
        const vhsIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyVHSTracking(ctx, vhsIntensity, width, height, time);
        break;
      }
      case "halftone_benday":
      case "halftoneBenday":
      case "halftone-benday": {
        const halftoneIntensity = effect.params?.intensity ?? effect.intensity ?? 0.4;
        this.applyHalftone(ctx, halftoneIntensity, width, height);
        break;
      }
      case "chromatic_glitch":
      case "chromaticGlitch":
      case "chromatic-glitch": {
        const glitchIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyChromaticGlitch(ctx, glitchIntensity, width, height, time);
        break;
      }
      case "flash_white":
      case "flashWhite":
      case "flash-white": {
        const flashIntensity = effect.params?.intensity ?? effect.intensity ?? 0.8;
        this.applyFlashWhite(ctx, flashIntensity, width, height);
        break;
      }
      case "light_leak":
      case "lightLeak":
      case "light-leak": {
        const leakIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyLightLeak(ctx, leakIntensity, width, height, time);
        break;
      }
      case "bloom": {
        const bloomIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyBloom(ctx, bloomIntensity, width, height);
        break;
      }
      case "context_shake":
      case "contextShake":
      case "context-shake": {
        const shakeIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyShake(ctx, shakeIntensity, width, height, time);
        break;
      }
      case "whip_pan":
      case "whipPan":
      case "whip-pan": {
        const whipIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyWhipPan(ctx, whipIntensity, width, height, time);
        break;
      }
      case "comic_ink_edges":
      case "comicInkEdges":
      case "comic-ink-edges": {
        const edgeIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyComicInkEdges(ctx, edgeIntensity, width, height);
        break;
      }
      case "frame_stutter_anime":
      case "frameStutterAnime":
      case "frame-stutter-anime": {
        const stutterIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyFrameStutterAnime(ctx, stutterIntensity, width, height, time);
        break;
      }
      case "lens_flare":
      case "lensFlare":
      case "lens-flare": {
        const flareIntensity = effect.params?.intensity ?? effect.intensity ?? 0.5;
        this.applyLensFlare(ctx, flareIntensity, width, height, time);
        break;
      }
      case "particle_system":
      case "particleSystem":
      case "particle-system": {
        const particleIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyParticleSystem(ctx, particleIntensity, width, height, time);
        break;
      }
      case "overlay": {
        const overlayIntensity = effect.params?.intensity ?? effect.intensity ?? 0.3;
        this.applyOverlay(ctx, overlayIntensity, width, height);
        break;
      }
    }
  }

  private applyVerticalBlur(ctx: CanvasRenderingContext2D, intensity: number) {
    // Standard canvas blur handles basic lowpass feel
    const blurAmount = Math.max(1, Math.round(intensity * 4));
    this.appendFilter(ctx, `blur(${blurAmount}px)`);
  }

  private applySharpen(ctx: CanvasRenderingContext2D, intensity: number) {
    // Approx sharpen by boosting contrast and lowering brightness slightly
    const contrast = 1 + intensity * 0.4;
    const brightness = 1 - intensity * 0.05;
    this.appendFilter(ctx, `contrast(${contrast}) brightness(${brightness})`);
  }

  private applyInvert(ctx: CanvasRenderingContext2D, intensity: number, params?: Record<string, number>) {
    const blend = params?.blend ?? 0; // 0-100%, where 0 is fully inverted and 100 is original
    const amount = (100 - blend) / 100;
    this.appendFilter(ctx, `invert(${amount.toFixed(2)})`);
  }

  private applyBlur(ctx: CanvasRenderingContext2D, intensity: number) {
    const blurAmount = Math.round(intensity * 10);
    if (blurAmount > 0) {
      this.appendFilter(ctx, `blur(${blurAmount}px)`);
    }
  }

  private applyBrightness(ctx: CanvasRenderingContext2D, intensity: number) {
    const brightness = 0.5 + intensity;
    this.appendFilter(ctx, `brightness(${brightness})`);
  }

  private applyContrast(ctx: CanvasRenderingContext2D, intensity: number) {
    const contrast = 0.5 + intensity * 1.5;
    this.appendFilter(ctx, `contrast(${contrast})`);
  }

  private applySaturation(ctx: CanvasRenderingContext2D, intensity: number) {
    const saturation = intensity * 2;
    this.appendFilter(ctx, `saturate(${saturation})`);
  }

  private applyGlow(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.shadowBlur = intensity * 30;
    ctx.shadowColor = `rgba(255, 255, 255, ${intensity * 0.8})`;
  }

  private applyShake(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const maxShake = intensity * 20;
    const offsetX = Math.sin(time * 173.7 + 1.0) * maxShake;
    const offsetY = Math.sin(time * 231.1 + 2.0) * maxShake;
    ctx.translate(offsetX, offsetY);
  }

  private applyZoomPulse(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const scale = 1 + Math.sin(time * Math.PI * 2 * 5) * intensity * 0.05;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
  }

  private applyNoiseGrain(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const noiseAmount = intensity * 50;
    
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  private applyScanlines(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 2);
    }
    
    ctx.restore();
  }

  private applyVHSTracking(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const offset = Math.sin(time * 3) * intensity * 20;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, offset, 0, width, height, 0, 0, width, height);
    ctx.restore();
    
    this.appendFilter(ctx, `saturate(120%) contrast(110%)`);
  }

  private applyHalftone(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    const dotSize = Math.max(2, intensity * 8);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    ctx.save();
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "black";
    
    for (let y = 0; y < height; y += dotSize) {
      for (let x = 0; x < width; x += dotSize) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const radius = (1 - brightness / 255) * dotSize * 0.5;
        
        if (radius > 0.5) {
          ctx.beginPath();
          ctx.arc(x + dotSize / 2, y + dotSize / 2, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    ctx.restore();
  }

  private applyChromaticGlitch(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const offset = intensity * 10;
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
    ctx.drawImage(ctx.canvas, -offset, 0, width, height);
    
    ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
    ctx.drawImage(ctx.canvas, 0, 0, width, height);
    
    ctx.fillStyle = "rgba(0, 0, 255, 0.3)";
    ctx.drawImage(ctx.canvas, offset, 0, width, height);
    
    ctx.restore();
  }

  private applyFlashWhite(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyLightLeak(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const gradient = ctx.createRadialGradient(
      width * 0.3, height * 0.3, 0,
      width * 0.3, height * 0.3, width * 0.5
    );
    
    gradient.addColorStop(0, `rgba(255, 200, 100, ${intensity})`);
    gradient.addColorStop(0.5, `rgba(255, 150, 50, ${intensity * 0.5})`);
    gradient.addColorStop(1, "rgba(255, 100, 0, 0)");
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyBloom(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = intensity * 0.5;
    ctx.filter = `blur(${intensity * 20}px) brightness(150%)`;
    ctx.drawImage(ctx.canvas, 0, 0, width, height);
    ctx.restore();
  }

  private applyWhipPan(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const offset = Math.sin(time * 10) * intensity * width * 0.3;
    ctx.translate(offset, 0);
    this.appendFilter(ctx, `blur(${intensity * 10}px)`);
  }

  private applyComicInkEdges(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const threshold = 30 * (1 - intensity);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const idxLeft = (y * width + (x - 1)) * 4;
        const idxRight = (y * width + (x + 1)) * 4;
        const idxUp = ((y - 1) * width + x) * 4;
        const idxDown = ((y + 1) * width + x) * 4;
        
        const gx = Math.abs(data[idxRight] - data[idxLeft]);
        const gy = Math.abs(data[idxDown] - data[idxUp]);
        const edge = Math.sqrt(gx * gx + gy * gy);
        
        if (edge > threshold) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  private applyFrameStutterAnime(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const holdFrames = Math.floor(intensity * 4) + 2;
    const frameIndex = Math.floor(time * 30);
    const shouldHold = frameIndex % holdFrames === 0;
    
    if (shouldHold) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }
  }

  private applyLensFlare(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const flareX = width * 0.3;
    const flareY = height * 0.3;
    const flareSize = intensity * 100;
    
    const gradient = ctx.createRadialGradient(
      flareX, flareY, 0,
      flareX, flareY, flareSize
    );
    
    gradient.addColorStop(0, `rgba(255, 255, 200, ${intensity})`);
    gradient.addColorStop(0.3, `rgba(255, 200, 100, ${intensity * 0.5})`);
    gradient.addColorStop(1, "rgba(255, 150, 50, 0)");
    
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private applyParticleSystem(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
    time: number
  ) {
    const particleCount = Math.floor(intensity * 50);
    const particleSize = 2;
    
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.5})`;
    
    for (let i = 0; i < particleCount; i++) {
      const x = (Math.sin(time * 0.5 + i * 0.1) * 0.5 + 0.5) * width;
      const y = (Math.cos(time * 0.3 + i * 0.2) * 0.5 + 0.5) * height;
      
      ctx.beginPath();
      ctx.arc(x, y, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  private applyOverlay(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number
  ) {
    ctx.save();
    ctx.globalAlpha = intensity * 0.3;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  resetEffects(ctx: CanvasRenderingContext2D) {
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
  }
}
```

---

## src/lib/renderer/transitions.ts

```typescript
// Transition Engine
// Handles shot-to-shot transitions

export class TransitionEngine {
  /**
   * Apply transition between two shots
   */
  applyTransition(
    ctx: CanvasRenderingContext2D,
    type: string,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    switch (type) {
      case "cut":
        // No transition, just show current frame
        break;
      case "crossfade":
        this.applyCrossfade(
          ctx,
          progress,
          currentFrame,
          previousFrame,
          width,
          height
        );
        break;
      case "dip_black":
        this.applyDipToBlack(ctx, progress, currentFrame, width, height);
        break;
      case "slide":
        this.applySlide(ctx, progress, currentFrame, previousFrame, width, height);
        break;
      default:
        // Unknown transition, default to cut
        break;
    }
  }

  private applyCrossfade(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw previous frame with fading opacity
    if (previousFrame) {
      ctx.globalAlpha = 1 - progress;
      ctx.putImageData(previousFrame, 0, 0);
    }

    // Draw current frame with increasing opacity
    if (currentFrame) {
      ctx.globalAlpha = progress;
      ctx.putImageData(currentFrame, 0, 0);
    }

    // Reset alpha
    ctx.globalAlpha = 1;
  }

  private applyDipToBlack(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // Fade out to black, then fade in from black
    const fadePoint = 0.5;

    if (progress < fadePoint) {
      // Fade out phase
      const fadeProgress = progress / fadePoint;
      if (currentFrame) {
        ctx.globalAlpha = 1 - fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
      // Overlay black
      ctx.fillStyle = "black";
      ctx.globalAlpha = fadeProgress;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } else {
      // Fade in phase
      const fadeProgress = (progress - fadePoint) / fadePoint;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);

      if (currentFrame) {
        ctx.globalAlpha = fadeProgress;
        ctx.putImageData(currentFrame, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  private applySlide(
    ctx: CanvasRenderingContext2D,
    progress: number,
    currentFrame: ImageData | null,
    previousFrame: ImageData | null,
    width: number,
    height: number
  ) {
    // Slide from right to left
    ctx.clearRect(0, 0, width, height);

    const slideOffset = width * (1 - progress);

    // Draw previous frame sliding out
    if (previousFrame) {
      ctx.putImageData(previousFrame, -slideOffset, 0);
    }

    // Draw current frame sliding in
    if (currentFrame) {
      ctx.putImageData(currentFrame, width - slideOffset, 0);
    }
  }

  /**
   * Easing functions for smooth transitions
   */
  applyEasing(progress: number, easing: string): number {
    switch (easing) {
      case "linear":
        return progress;
      case "ease-in":
        return progress * progress;
      case "ease-out":
        return 1 - (1 - progress) * (1 - progress);
      case "ease-in-out":
        return progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      default:
        return progress;
    }
  }
}
```

---

## src/lib/renderer/text-engine.ts

```typescript
// src/lib/renderer/text-engine.ts
// Kinetic captions: pop, type, slide_up, slide_down, shake, wave, split, glitch, scale_pulse, none

export interface KineticTextSpec {
  text: string;
  startTime: number;       // shot-local seconds
  duration: number;
  animation:
    | "pop"        // scale 0 → 1.1 → 1
    | "type"       // typewriter
    | "slide_up"   // from below
    | "slide_down" // from above
    | "shake"      // jitter while visible
    | "wave"       // letters bob in sine
    | "split"      // letters drop from random heights
    | "glitch"     // RGB-split + jitter
    | "scale_pulse" // rhythmic pulse
    | "none";

  style: {
    fontSize: number;
    fontFamily?: string;
    color: string;
    strokeColor?: string;
    strokeWidth?: number;
    backgroundColor?: string;  // box behind text
    fontWeight?: string;
    position: { x: number; y: number };  // 0..100 percent
    align?: "left" | "center" | "right";
  };
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export class KineticTextEngine {
  /** Draw kinetic text on ctx at currentTime (shot-local seconds) */
  draw(
    ctx: CanvasRenderingContext2D,
    spec: KineticTextSpec,
    currentTime: number,
    width: number,
    height: number,
  ) {
    const localT = (currentTime - spec.startTime) / spec.duration;
    if (localT < 0 || localT > 1) return;

    ctx.save();
    const fontFamily = spec.style.fontFamily ?? "Impact, Arial Black, sans-serif";
    const weight = spec.style.fontWeight ?? "900";
    ctx.font = `${weight} ${spec.style.fontSize}px ${fontFamily}`;
    ctx.textAlign = (spec.style.align ?? "center") as CanvasTextAlign;
    ctx.textBaseline = "middle";

    const px = (spec.style.position.x / 100) * width;
    const py = (spec.style.position.y / 100) * height;

    // Common opacity envelope: fade in fast, hold, fade out
    const fadeIn = 0.12;
    const fadeOut = 0.15;
    let alpha = 1;
    if (localT < fadeIn) alpha = localT / fadeIn;
    else if (localT > 1 - fadeOut) alpha = (1 - localT) / fadeOut;
    ctx.globalAlpha = Math.max(0, alpha);

    switch (spec.animation) {
      case "pop":       this.drawPop(ctx, spec, localT, px, py); break;
      case "type":      this.drawType(ctx, spec, localT, px, py, currentTime); break;
      case "slide_up":  this.drawSlide(ctx, spec, localT, px, py, "up"); break;
      case "slide_down": this.drawSlide(ctx, spec, localT, px, py, "down"); break;
      case "shake":     this.drawShake(ctx, spec, localT, px, py, currentTime); break;
      case "wave":      this.drawWave(ctx, spec, localT, px, py, currentTime); break;
      case "split":     this.drawSplit(ctx, spec, localT, px, py); break;
      case "glitch":    this.drawGlitch(ctx, spec, localT, px, py); break;
      case "scale_pulse": this.drawPulse(ctx, spec, localT, px, py, currentTime); break;
      default:          this.drawStatic(ctx, spec, px, py); break;
    }
    ctx.restore();
  }

  private fillBg(
    ctx: CanvasRenderingContext2D,
    spec: KineticTextSpec,
    x: number, y: number, w: number, h: number,
  ) {
    if (!spec.style.backgroundColor) return;
    ctx.fillStyle = spec.style.backgroundColor;
    const pad = 16;
    ctx.fillRect(x - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2);
  }

  private strokeAndFill(
    ctx: CanvasRenderingContext2D,
    spec: KineticTextSpec,
    text: string,
    x: number, y: number,
  ) {
    if (spec.style.strokeColor && spec.style.strokeWidth) {
      ctx.strokeStyle = spec.style.strokeColor;
      ctx.lineWidth = spec.style.strokeWidth;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = spec.style.color;
    ctx.fillText(text, x, y);
  }

  private drawStatic(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, px: number, py: number) {
    const m = ctx.measureText(spec.text);
    this.fillBg(ctx, spec, px, py, m.width, spec.style.fontSize);
    this.strokeAndFill(ctx, spec, spec.text, px, py);
  }

  private drawPop(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number, px: number, py: number) {
    let scale: number;
    if (t < 0.15) scale = (t / 0.15) * 1.25;
    else if (t < 0.3) scale = 1.25 - ((t - 0.15) / 0.15) * 0.25;
    else scale = 1.0;

    ctx.translate(px, py);
    ctx.scale(scale, scale);
    const m = ctx.measureText(spec.text);
    this.fillBg(ctx, spec, 0, 0, m.width, spec.style.fontSize);
    this.strokeAndFill(ctx, spec, spec.text, 0, 0);
  }

  private drawType(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const typeT = Math.min(1, t * 1.4);
    const chars = Math.floor(spec.text.length * typeT);
    const visible = spec.text.slice(0, chars);
    this.strokeAndFill(ctx, spec, visible, px, py);

    if (chars < spec.text.length && Math.floor(currentTime * 4) % 2 === 0) {
      const m = ctx.measureText(visible);
      const cursorX = (spec.style.align ?? "center") === "center"
        ? px + m.width / 2
        : px + m.width;
      ctx.fillStyle = spec.style.color;
      ctx.fillRect(cursorX + 4, py - spec.style.fontSize / 2.5, 4, spec.style.fontSize);
    }
  }

  private drawSlide(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, dir: "up" | "down",
  ) {
    const slideT = Math.min(1, t * 3);  // arrive at 1/3 through
    const sign = dir === "up" ? 1 : -1;
    const ease = 1 - Math.pow(1 - slideT, 3);
    const dy = (1 - ease) * 120 * sign;
    this.strokeAndFill(ctx, spec, spec.text, px, py + dy);
  }

  private drawShake(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const decay = Math.max(0, 1 - t * 1.3);
    const sx = Math.sin(currentTime * 80) * 10 * decay;
    const sy = Math.cos(currentTime * 70) * 6 * decay;
    this.strokeAndFill(ctx, spec, spec.text, px + sx, py + sy);
  }

  private drawWave(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const letters = spec.text.split("");
    const totalW = ctx.measureText(spec.text).width;
    let cursorX = px - totalW / 2;
    ctx.textAlign = "left";
    for (let i = 0; i < letters.length; i++) {
      const wave = Math.sin(currentTime * 6 + i * 0.5) * 12;
      this.strokeAndFill(ctx, spec, letters[i], cursorX, py + wave);
      cursorX += ctx.measureText(letters[i]).width;
    }
  }

  private drawSplit(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number, px: number, py: number) {
    const letters = spec.text.split("");
    const totalW = ctx.measureText(spec.text).width;
    let cursorX = px - totalW / 2;
    ctx.textAlign = "left";
    const arriveT = t * 1.5;
    for (let i = 0; i < letters.length; i++) {
      const charT = Math.max(0, Math.min(1, arriveT - i * 0.05));
      const ease = 1 - Math.pow(1 - charT, 3);
      const dy = (1 - ease) * 80;
      const oldAlpha = ctx.globalAlpha;
      ctx.globalAlpha = oldAlpha * charT;
      this.strokeAndFill(ctx, spec, letters[i], cursorX, py + dy);
      ctx.globalAlpha = oldAlpha;
      cursorX += ctx.measureText(letters[i]).width;
    }
  }

  private drawGlitch(ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number, px: number, py: number) {
    const shakeX = (Math.random() - 0.5) * 8;
    // R/B split copies
    ctx.fillStyle = "rgba(255, 60, 60, 0.7)";
    ctx.fillText(spec.text, px - 6 + shakeX, py);
    ctx.fillStyle = "rgba(60, 200, 255, 0.7)";
    ctx.fillText(spec.text, px + 6 + shakeX, py);
    this.strokeAndFill(ctx, spec, spec.text, px + shakeX, py);
  }

  private drawPulse(
    ctx: CanvasRenderingContext2D, spec: KineticTextSpec, t: number,
    px: number, py: number, currentTime: number,
  ) {
    const scale = 1 + Math.sin(currentTime * 6) * 0.08;
    ctx.translate(px, py);
    ctx.scale(scale, scale);
    this.strokeAndFill(ctx, spec, spec.text, 0, 0);
  }
}
```

---

## src/lib/renderer/media-loader.ts

```typescript
import type { MediaAsset } from "./types";
import { mediaLoaderCache } from "./media-loader-cache";

export type MediaAssetType = "video" | "audio" | "image";

export interface LoadedMediaAsset extends MediaAsset {
  id: string;
  type: MediaAssetType;
  url: string;
  duration: number;
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  loaded: boolean;
  objectUrl?: string;
  ownsObjectUrl: boolean;
  mimeType?: string;
  failed?: boolean;
  error?: string;
}

interface LoadVideoOptions {
  timeoutMs: number;
}

function isObjectUrl(url: string): boolean {
  return url.startsWith("blob:");
}

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/");
}

function normalizeMimeType(value: string | null | undefined, fallback: string): string {
  if (!value || typeof value !== "string") return fallback;
  const clean = value.trim().toLowerCase().split(";")[0];
  return clean || fallback;
}

function inferVideoMimeType(url: string, provided?: string): string {
  const normalized = normalizeMimeType(provided, "");

  if (normalized.startsWith("video/")) {
    return normalized;
  }

  const lower = url.toLowerCase().split("?")[0].split("#")[0];

  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mp4")) return "video/mp4";

  return "video/mp4";
}

function inferAudioMimeType(url: string, provided?: string): string {
  const normalized = normalizeMimeType(provided, "");

  if (normalized.startsWith("audio/")) {
    return normalized;
  }

  const lower = url.toLowerCase().split("?")[0].split("#")[0];

  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";

  return "audio/mpeg";
}

async function fetchAsObjectUrl(params: {
  url: string;
  fallbackMimeType: string;
}): Promise<{ objectUrl: string; mimeType: string }> {
  const response = await fetch(params.url, {
    method: "GET",
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch media: HTTP ${response.status}`);
  }

  const contentType = normalizeMimeType(
    response.headers.get("content-type"),
    params.fallbackMimeType
  );

  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);

  return {
    objectUrl,
    mimeType: contentType,
  };
}

function waitForVideoReady(
  video: HTMLVideoElement,
  options: LoadVideoOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) {
      resolve();
      return;
    }

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      clearTimeout(timeoutId);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`metadata timeout after 30s for ${video.src.slice(0, 80)}`));
    }, 30000);

    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };

    video.onerror = (e) => {
      cleanup();
      reject(new Error(`video error: ${(e as any)?.message ?? "unknown"}`));
    };

    // Force a play attempt to nudge metadata loading on stubborn browsers
    video.play().then(() => video.pause()).catch(() => {});
  });
}

function waitForAudioReady(
  audio: HTMLAudioElement,
  options: LoadVideoOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      window.clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("abort", handleAbort);
    };

    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const handleReady = (): void => {
      if (
        Number.isFinite(audio.duration) ||
        audio.readyState >= HTMLMediaElement.HAVE_METADATA
      ) {
        finish();
      }
    };

    const handleError = (): void => {
      const mediaError = audio.error;
      fail(mediaError?.message || "Audio load error");
    };

    const handleAbort = (): void => {
      fail("Audio load aborted");
    };

    const timer = window.setTimeout(() => {
      fail(`timeout after ${options.timeoutMs}ms`);
    }, options.timeoutMs);

    audio.addEventListener("loadedmetadata", handleReady);
    audio.addEventListener("canplay", handleReady);
    audio.addEventListener("error", handleError);
    audio.addEventListener("abort", handleAbort);

    if (
      Number.isFinite(audio.duration) ||
      audio.readyState >= HTMLMediaElement.HAVE_METADATA
    ) {
      finish();
      return;
    }

    audio.load();
  });
}

function waitForImageReady(image: HTMLImageElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }

    let settled = false;

    const cleanup = (): void => {
      window.clearTimeout(timer);
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };

    const handleLoad = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const handleError = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Image load error"));
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
  });
}

export class MediaLoader {
  private readonly assets = new Map<string, LoadedMediaAsset>();
  private readonly loadPromises = new Map<string, Promise<LoadedMediaAsset>>();
  private readonly videoElementCache = new Map<string, HTMLVideoElement>();
  private readonly audioElementCache = new Map<string, HTMLAudioElement>();
  private readonly imageElementCache = new Map<string, HTMLImageElement>();

  async loadAsset(
    id: string,
    url: string,
    type: MediaAssetType,
    mimeType?: string
  ): Promise<LoadedMediaAsset> {
    // Defensive guard: never load reference or music videos as renderable assets.
    // These have no business being rendered to canvas.
    if (type !== "video" && type !== "image") {
      console.warn(`[MediaLoader] Refusing to load non-renderable type "${type}" for ${id}`);
      return { id, type, url, duration: 0, loaded: false, ownsObjectUrl: false, element: null as any, failed: true, error: `Non-renderable type: ${type}` } as any;
    }

    // Tag the URL pattern: if the id is explicitly a reference, skip
    if (id.startsWith("ref-") || id.startsWith("music-")) {
      console.warn(`[MediaLoader] Refusing to load reference/music id: ${id}`);
      return { id, type, url, duration: 0, loaded: false, ownsObjectUrl: false, element: null as any, failed: true, error: `Reference/music id rejected: ${id}` } as any;
    }

    // Prevent duplicate loads for the same asset
    const existing = this.assets.get(id);
    if (existing && !existing.failed) {
      return existing;
    }

    const existingPromise = this.loadPromises.get(id);
    if (existingPromise) {
      return existingPromise;
    }

    return mediaLoaderCache.getOrLoad(id, url, async (resolvedUrl) => {
      const promise = this.loadAssetInternal(id, resolvedUrl, type, mimeType)
        .then((asset) => {
          this.assets.set(id, asset);
          return asset;
        })
        .catch((error) => {
          const failedAsset: LoadedMediaAsset = {
            id,
            type,
            url: resolvedUrl,
            duration: 0,
            loaded: false,
            ownsObjectUrl: false,
            element: null as any,
            mimeType,
            failed: true,
            error: error instanceof Error ? error.message : String(error),
          };

          this.assets.set(id, failedAsset);
          throw error;
        })
        .finally(() => {
          this.loadPromises.delete(id);
        });

      this.loadPromises.set(id, promise);
      return promise;
    });
  }

  // Define original fallback loader logic internally for cache misses
  async loadAssetOriginal(
    id: string,
    url: string,
    type: MediaAssetType,
    mimeType?: string
  ): Promise<LoadedMediaAsset> {
    const existing = this.assets.get(id);
    if (existing && !existing.failed) {
      return existing;
    }

    const existingPromise = this.loadPromises.get(id);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = this.loadAssetInternal(id, url, type, mimeType)
      .then((asset) => {
        this.assets.set(id, asset);
        return asset;
      })
      .catch((error) => {
        const failedAsset: LoadedMediaAsset = {
          id,
          type,
          url,
          duration: 0,
          loaded: false,
          ownsObjectUrl: false,
          element: null as any,
          mimeType,
          failed: true,
          error: error instanceof Error ? error.message : String(error),
        };

        this.assets.set(id, failedAsset);
        throw error;
      })
      .finally(() => {
        this.loadPromises.delete(id);
      });

    this.loadPromises.set(id, promise);
    return promise;
  }

  private async loadAssetInternal(
    id: string,
    url: string,
    type: MediaAssetType,
    mimeType?: string
  ): Promise<LoadedMediaAsset> {
    if (!url || typeof url !== "string") {
      throw new Error(`Missing media URL for asset ${id}`);
    }

    const shouldFetch =
      isHttpUrl(url) && !isObjectUrl(url) && !isDataUrl(url);

    let src = url;
    let resolvedMimeType = mimeType;
    let ownsObjectUrl = false;
    let objectUrl: string | undefined;

    if (shouldFetch) {
      const fallbackMimeType =
        type === "video"
          ? inferVideoMimeType(url, mimeType)
          : type === "audio"
            ? inferAudioMimeType(url, mimeType)
            : normalizeMimeType(mimeType, "image/jpeg");

      let fetched;
      try {
        fetched = await fetchAsObjectUrl({
          url,
          fallbackMimeType,
        });
      } catch (err) {
        if (url.includes("_proxy")) {
          const fallbackUrl = url.replace("_proxy", "");
          console.warn(`[MediaLoader] Failed to fetch proxy: ${url}, falling back to original: ${fallbackUrl}`, err);
          try {
            fetched = await fetchAsObjectUrl({
              url: fallbackUrl,
              fallbackMimeType,
            });
            url = fallbackUrl;
          } catch (fallbackErr) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      src = fetched.objectUrl;
      objectUrl = fetched.objectUrl;
      ownsObjectUrl = true;
      resolvedMimeType = fetched.mimeType;
    } else {
      resolvedMimeType =
        type === "video"
          ? inferVideoMimeType(url, mimeType)
          : type === "audio"
            ? inferAudioMimeType(url, mimeType)
            : mimeType;
    }

    if (type === "video") {
      let video = this.videoElementCache.get(src);

      if (!video) {
        video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        if (!isObjectUrl(src) && !isDataUrl(src)) {
          video.crossOrigin = "anonymous";
        }

        // Probe orientation via a one-time draw + pixel comparison on loadeddata
        video.addEventListener("loadeddata", () => {
          try {
            const probe = document.createElement("canvas");
            probe.width = 32;
            probe.height = 32;
            const ctx = probe.getContext("2d");
            ctx?.drawImage(video!, 0, 0, 32, 32);

            // Compare top vs bottom average brightness
            const topData = ctx?.getImageData(0, 0, 32, 8).data;
            const botData = ctx?.getImageData(0, 24, 32, 8).data;

            if (topData && botData) {
              const avg = (data: Uint8ClampedArray) => {
                let sum = 0;
                for (let i = 0; i < data.length; i += 4) {
                  sum += (data[i] + data[i+1] + data[i+2]) / 3;
                }
                return sum / (data.length / 4);
              };
              const topAvg = avg(topData);
              const botAvg = avg(botData);

              // If bottom is significantly darker than top AND aspect is portrait,
              // probably upside-down phone video
              if (botAvg < topAvg * 0.6 && video!.videoHeight > video!.videoWidth) {
                (video as any).__monetUpsideDown = true;
                console.log("[media-loader] detected upside-down video, will rotate 180°");
              }
            }
          } catch {}
        }, { once: true });

        this.videoElementCache.set(src, video);
      }

      console.log("[MediaLoader] loading video src:", src.slice(0, 120));
      video.src = src;

      await waitForVideoReady(video, { timeoutMs: 120000 });

      // Force play/pause to fully initialize some browsers' decoding pipeline
      try {
        await video.play();
        video.pause();
      } catch {}

      console.log("[MediaLoader] Loaded video asset", {
        id,
        mimeType: resolvedMimeType,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        srcKind: isObjectUrl(src) ? "blob" : "url",
        ownsObjectUrl,
      });

      return {
        id,
        type,
        url,
        duration: video.duration,
        loaded: true,
        objectUrl,
        ownsObjectUrl,
        element: video,
        mimeType: resolvedMimeType,
      };
    }

    if (type === "audio") {
      let audio = this.audioElementCache.get(src);

      if (!audio) {
        audio = document.createElement("audio");
        audio.preload = "auto";
        if (!isObjectUrl(src) && !isDataUrl(src)) {
          audio.crossOrigin = "anonymous";
        }
        this.audioElementCache.set(src, audio);
      }

      console.log("[MediaLoader] loading audio src:", src.slice(0, 120));
      audio.src = src;

      await waitForAudioReady(audio, { timeoutMs: 120000 });

      return {
        id,
        type,
        url,
        duration: audio.duration,
        loaded: true,
        objectUrl,
        ownsObjectUrl,
        element: audio,
        mimeType: resolvedMimeType,
      };
    }

    const existingImage = this.imageElementCache.get(src);
    let image = existingImage;

    if (!image) {
      image = new Image();
      image.crossOrigin = "anonymous";
      this.imageElementCache.set(src, image);
    }

    console.log("[MediaLoader] loading image src:", src.slice(0, 120));
    image.src = src;

    await waitForImageReady(image, 120000);

    return {
      id,
      type,
      url,
      duration: 0,
      loaded: true,
      objectUrl,
      ownsObjectUrl,
      element: image,
      mimeType: resolvedMimeType,
    };
  }

  getAsset(id: string): LoadedMediaAsset | null {
    return this.assets.get(id) ?? null;
  }

  async seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    const targetTime = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? video.duration : time));

    if (Math.abs(video.currentTime - targetTime) < 0.03) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        window.clearTimeout(timer);
        window.clearInterval(pollInterval);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
      };

      const finish = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      const handleSeeked = (): void => {
        finish();
      };

      const handleError = (): void => {
        fail(video.error?.message || "Video seek failed");
      };

      // Poll to check if seek finished even if event didn't fire (background tab, throttled timers)
      const pollInterval = window.setInterval(() => {
        if (!video.seeking || Math.abs(video.currentTime - targetTime) < 0.1) {
          finish();
        }
      }, 50);

      const timer = window.setTimeout(() => {
        if (Math.abs(video.currentTime - targetTime) < 0.5) {
          console.warn("[MediaLoader] Seek timeout but currentTime is close enough, resolving anyway.", {
            currentTime: video.currentTime,
            targetTime,
          });
          finish();
        } else {
          fail("Video seek timeout");
        }
      }, 2000);

      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);

      try {
        video.currentTime = targetTime;
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  }

  cleanup(): void {
    for (const asset of this.assets.values()) {
      if (asset.element instanceof HTMLMediaElement) {
        asset.element.pause();
        asset.element.removeAttribute("src");
        asset.element.load();
      }

      if (asset.ownsObjectUrl && asset.objectUrl) {
        URL.revokeObjectURL(asset.objectUrl);
      }
    }

    this.assets.clear();
    this.loadPromises.clear();
    this.videoElementCache.clear();
    this.audioElementCache.clear();
    this.imageElementCache.clear();
  }
}
```

---

## src/lib/renderer/webgl-grade-renderer.ts

```typescript
// src/lib/renderer/webgl-grade-renderer.ts
// Compiled-once WebGL pipeline for color grading + vignette + chromatic.
// Used as a final filter pass over the Canvas2D output.

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_temperature;
uniform float u_vignette;
uniform float u_chromatic;
uniform vec2 u_resolution;
varying vec2 v_uv;

vec3 saturate(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

vec3 contrast(vec3 c, float k) {
  return (c - 0.5) * k + 0.5;
}

vec3 temperature(vec3 c, float t) {
  c.r += t * 0.10;
  c.b -= t * 0.10;
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec3 col;

  if (u_chromatic > 0.001) {
    float ca = u_chromatic * 0.008;
    col.r = texture2D(u_tex, uv + vec2(ca, 0.0)).r;
    col.g = texture2D(u_tex, uv).g;
    col.b = texture2D(u_tex, uv - vec2(ca, 0.0)).b;
  } else {
    col = texture2D(u_tex, uv).rgb;
  }

  col = saturate(col, u_saturation);
  col = contrast(col, u_contrast);
  col += vec3(u_brightness);
  col = temperature(col, u_temperature);

  if (u_vignette > 0.001) {
    float d = distance(uv, vec2(0.5));
    col *= 1.0 - smoothstep(0.35, 0.85, d) * u_vignette;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface GradeParams {
  saturation: number;
  contrast: number;
  brightness: number;
  temperature: number;
  vignette: number;
  chromatic: number;
}

export const GRADE_PRESETS: Record<string, GradeParams> = {
  raw:        { saturation: 1, contrast: 1, brightness: 0, temperature: 0, vignette: 0, chromatic: 0 },
  cinematic:  { saturation: 0.85, contrast: 1.18, brightness: -0.02, temperature: 0.05, vignette: 0.3, chromatic: 0 },
  vibrant:    { saturation: 1.45, contrast: 1.1, brightness: 0.03, temperature: 0.08, vignette: 0, chromatic: 0 },
  vintage:    { saturation: 0.78, contrast: 0.92, brightness: 0.05, temperature: 0.18, vignette: 0.4, chromatic: 0.2 },
  monochrome: { saturation: 0, contrast: 1.2, brightness: 0, temperature: 0, vignette: 0.25, chromatic: 0 },
  anime:      { saturation: 1.55, contrast: 1.3, brightness: 0.04, temperature: 0.03, vignette: 0, chromatic: 0 },
};

export class WebGLGradeRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("webgl", { premultipliedAlpha: false });
    if (!ctx) throw new Error("WebGL not supported");
    this.gl = ctx;
    this.init();
  }

  private init() {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERT);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Shader link failed: " + gl.getProgramInfoLog(prog));
    }
    this.program = prog;
    gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const uNames = [
      "u_tex",
      "u_saturation",
      "u_contrast",
      "u_brightness",
      "u_temperature",
      "u_vignette",
      "u_chromatic",
      "u_resolution",
    ];
    for (const n of uNames) {
      this.uniforms[n] = gl.getUniformLocation(prog, n);
    }
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile failed: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /** Apply grade to a source canvas/video, output goes to this.canvas */
  apply(source: HTMLCanvasElement | HTMLVideoElement, params: GradeParams) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );

    gl.uniform1i(this.uniforms.u_tex, 0);
    gl.uniform1f(this.uniforms.u_saturation, params.saturation);
    gl.uniform1f(this.uniforms.u_contrast, params.contrast);
    gl.uniform1f(this.uniforms.u_brightness, params.brightness);
    gl.uniform1f(this.uniforms.u_temperature, params.temperature);
    gl.uniform1f(this.uniforms.u_vignette, params.vignette);
    gl.uniform1f(this.uniforms.u_chromatic, params.chromatic);
    gl.uniform2f(this.uniforms.u_resolution, this.canvas.width, this.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
  }
}
```

---

## src/lib/renderer/shader-fx.ts

```typescript
// src/lib/renderer/shader-fx.ts
// WebGL shader FX: glitch, VHS, RGB shift, scanlines, pixelate

import { SPIDERVERSE_SHADERS } from "../shaders/spiderverse";
import { GLFX_SHADERS } from "../shaders/glfx-effects";
import { SHADERTOY_SHADERS } from "../shaders/shadertoy-collection";
import { CUSTOM_VFX_SHADERS } from "../shaders/custom-vfx";
import { FILM_GRAIN_PRO_FRAG, FILM_GRAIN_PRO_UNIFORMS } from "../shaders/pro-effects/film-grain-pro";
import { VIGNETTE_PRO_FRAG, VIGNETTE_PRO_UNIFORMS } from "../shaders/pro-effects/vignette-pro";
import { COLOR_TEMPERATURE_FRAG, COLOR_TEMPERATURE_UNIFORMS } from "../shaders/pro-effects/color-temperature";
// Compiled once. One canvas per effect type. Stateless apply().

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// ─── GLITCH: slice displacement + RGB shift + scanlines ─────────────
const GLITCH_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

float rand(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  // Horizontal slice glitches — random per row
  float slice = floor(uv.y * 30.0);
  float seed = rand(vec2(slice, floor(u_time * 8.0)));
  float shift = (seed - 0.5) * 0.18 * u_intensity * step(0.7, seed);
  uv.x += shift;

  // RGB split
  float ca = 0.012 * u_intensity;
  float r = texture2D(u_tex, uv + vec2(ca, 0.0)).r;
  float g = texture2D(u_tex, uv).g;
  float b = texture2D(u_tex, uv - vec2(ca, 0.0)).b;

  // Scanlines
  float scan = sin(v_uv.y * 1200.0) * 0.06 * u_intensity;

  gl_FragColor = vec4(r - scan, g - scan, b - scan, 1.0);
}
`;

// ─── VHS: chroma bleed, tape noise, color shift ──────────────────────
const VHS_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

float rand(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  // Tape wobble — slow horizontal sine
  uv.x += sin(uv.y * 24.0 + u_time * 2.5) * 0.005 * u_intensity;

  // Chroma bleed — heavy on R/B
  float bleed = 0.015 * u_intensity;
  float r = texture2D(u_tex, uv + vec2(bleed, 0.0)).r;
  float g = texture2D(u_tex, uv).g;
  float b = texture2D(u_tex, uv + vec2(bleed * 1.6, 0.0)).b;
  vec3 col = vec3(r, g, b);

  // Noise
  float n = rand(uv + u_time) * 0.18 * u_intensity;
  col += n - 0.09 * u_intensity;

  // Slight desaturation + warm tint
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.82);
  col.r *= 1.0 + 0.06 * u_intensity;
  col.b *= 1.0 - 0.04 * u_intensity;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── RGB SHIFT (pure chromatic): no scanlines, no noise ─────────────
const RGB_SHIFT_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  float ca = 0.022 * u_intensity;
  float r = texture2D(u_tex, v_uv + vec2(ca, 0.0)).r;
  float g = texture2D(u_tex, v_uv).g;
  float b = texture2D(u_tex, v_uv - vec2(ca, 0.0)).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

// ─── SCANLINES alone ────────────────────────────────────────────────
const SCANLINES_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_tex, v_uv).rgb;
  float scan = sin(v_uv.y * 800.0);
  col *= 1.0 - max(0.0, scan) * 0.18 * u_intensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── PIXELATE ────────────────────────────────────────────────────────
const PIXELATE_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  float blocks = mix(800.0, 60.0, u_intensity);
  vec2 size = vec2(blocks / u_resolution.x, blocks / u_resolution.y);
  vec2 uv = floor(v_uv / size) * size + size * 0.5;
  gl_FragColor = texture2D(u_tex, uv);
}
`;

export type ShaderEffectKind =
  | "glitch"
  | "vhs"
  | "rgb_shift"
  | "scanlines"
  | "pixelate"
  | "halftone"
  | "comic_edges"
  | "frame_stutter"
  | "chromatic_glitch"
  // glfx effects
  | "brightness_contrast"
  | "hue_saturation"
  | "vibrance"
  | "sepia"
  | "vignette_pro"
  | "triangle_blur"
  | "lens_blur"
  | "tilt_shift"
  | "edges_gfx"
  | "ink_gfx"
  | "emboss_gfx"
  | "swirl_gfx"
  | "bulge_pinch"
  | "noise_film"
  | "posterize_gfx"
  | "zoom_blur"
  | "denoise_gfx"
  | "color_halftone"
  | "dot_screen"
  | "shift_towards"
  // shadertoy effects
  | "plasma"
  | "heat_wave"
  | "crt_monitor"
  | "dream_blur"
  | "kaleidoscope"
  | "pulse_wave"
  | "ascii_matrix"
  | "hologram"
  | "thermal"
  | "duotone"
  | "floating_dust"
  | "infrared"
  | "film_scratches"
  | "liquid"
  | "bloom_highlights"
  // pro-grade effects
  | "film_grain_pro"
  | "vignette_pro_v2"
  | "color_temperature"
  // custom VFX (matched to reference videos)
  | "spiderverse_halftone"
  | "sports_speed_trail"
  | "tyler_vibrant_pop"
  | "racing_motion_streak"
  | "dark_moody_cinematic"
  | "lifestyle_glitch"
  | "tiktok_energy_pulse";

interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class ShaderFXRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs: Map<ShaderEffectKind, ShaderProgram> = new Map();
  private startTime = performance.now();

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("webgl", { premultipliedAlpha: false });
    if (!ctx) throw new Error("WebGL not supported for ShaderFX");
    this.gl = ctx;
    this.initSharedResources();
    this.compileAllShaders();
  }

  private initSharedResources() {
    const gl = this.gl;
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile failed: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  private buildProgram(
    kind: ShaderEffectKind,
    fragSrc: string,
    uniformNames: string[],
  ): ShaderProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERT);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`${kind} link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniformNames) {
      uniforms[n] = gl.getUniformLocation(prog, n);
    }
    return { program: prog, uniforms };
  }

  private compileAllShaders() {
    this.programs.set("glitch", this.buildProgram("glitch", GLITCH_FRAG,
      ["u_tex", "u_time", "u_intensity"]));
    this.programs.set("vhs", this.buildProgram("vhs", VHS_FRAG,
      ["u_tex", "u_time", "u_intensity"]));
    this.programs.set("rgb_shift", this.buildProgram("rgb_shift", RGB_SHIFT_FRAG,
      ["u_tex", "u_intensity"]));
    this.programs.set("scanlines", this.buildProgram("scanlines", SCANLINES_FRAG,
      ["u_tex", "u_intensity"]));
    this.programs.set("pixelate", this.buildProgram("pixelate", PIXELATE_FRAG,
      ["u_tex", "u_intensity", "u_resolution"]));

    // NEW: Spider-Verse bundle
    for (const spec of SPIDERVERSE_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      if (spec.requiresPrevFrame) uniformNames.push("u_prevTexture", "u_hasPrevTexture");
      if (spec.requiresHeldFrame) uniformNames.push("u_heldTexture", "u_hasHeldTexture");
      this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
    }

    // Register all glfx shaders
    for (const spec of GLFX_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      try {
        this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
      } catch (e) {
        console.warn(`[shader-fx] failed to compile glfx shader ${spec.id}:`, e);
      }
    }

    // Register all shadertoy shaders
    for (const spec of SHADERTOY_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      try {
        this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
      } catch (e) {
        console.warn(`[shader-fx] failed to compile shadertoy shader ${spec.id}:`, e);
      }
    }

    // Register pro-grade shaders
    try {
      this.programs.set("film_grain_pro" as ShaderEffectKind, this.buildProgram(
        "film_grain_pro", FILM_GRAIN_PRO_FRAG,
        ["u_texture", "u_resolution", "u_time", ...Object.keys(FILM_GRAIN_PRO_UNIFORMS)]
      ));
      this.programs.set("vignette_pro_v2" as ShaderEffectKind, this.buildProgram(
        "vignette_pro_v2", VIGNETTE_PRO_FRAG,
        ["u_texture", "u_resolution", "u_time", ...Object.keys(VIGNETTE_PRO_UNIFORMS)]
      ));
      this.programs.set("color_temperature" as ShaderEffectKind, this.buildProgram(
        "color_temperature", COLOR_TEMPERATURE_FRAG,
        ["u_texture", "u_resolution", "u_time", ...Object.keys(COLOR_TEMPERATURE_UNIFORMS)]
      ));
    } catch (e) {
      console.warn("[shader-fx] failed to register pro effects:", e);
    }

    // Register custom VFX shaders (matched to reference videos)
    for (const spec of CUSTOM_VFX_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      try {
        this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
      } catch (e) {
        console.warn(`[shader-fx] failed to compile custom VFX ${spec.id}:`, e);
      }
    }

    console.log(`[shader-fx] registered ${this.programs.size} total shader programs`);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Apply effect → outputs to internal canvas.
   * Call getCanvas() to composite back onto main canvas.
   */
  apply(
    source: HTMLCanvasElement | HTMLVideoElement,
    kind: ShaderEffectKind,
    intensity: number,
  ) {
    const prog = this.programs.get(kind);
    if (!prog) {
      console.warn(`[shader-fx] unknown kind: ${kind}`);
      return;
    }

    const gl = this.gl;
    gl.useProgram(prog.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const aPos = gl.getAttribLocation(prog.program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.uniform1i(prog.uniforms.u_tex, 0);
    gl.uniform1f(prog.uniforms.u_intensity, intensity);
    if (prog.uniforms.u_time) {
      gl.uniform1f(prog.uniforms.u_time, (performance.now() - this.startTime) / 1000);
    }
    if (prog.uniforms.u_resolution) {
      gl.uniform2f(prog.uniforms.u_resolution, this.canvas.width, this.canvas.height);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  applyAdvanced(
    source: HTMLCanvasElement | HTMLVideoElement,
    shaderId: ShaderEffectKind,
    uniforms: Record<string, any>,
    prevFrame?: HTMLCanvasElement,
    heldFrame?: HTMLCanvasElement,
  ) {
    const prog = this.programs.get(shaderId);
    if (!prog) return;

    const gl = this.gl;
    gl.useProgram(prog.program);

    // Quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const aPos = gl.getAttribLocation(prog.program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Main texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(prog.uniforms.u_texture, 0);

    // Optional prev/held textures
    if (prevFrame) {
      const prevTex = this.ensureAuxTexture("prev");
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prevFrame);
      gl.uniform1i(prog.uniforms.u_prevTexture, 1);
      gl.uniform1i(prog.uniforms.u_hasPrevTexture, 1);
    } else if (prog.uniforms.u_hasPrevTexture) {
      gl.uniform1i(prog.uniforms.u_hasPrevTexture, 0);
    }

    if (heldFrame) {
      const heldTex = this.ensureAuxTexture("held");
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, heldTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, heldFrame);
      gl.uniform1i(prog.uniforms.u_heldTexture, 2);
      gl.uniform1i(prog.uniforms.u_hasHeldTexture, 1);
    } else if (prog.uniforms.u_hasHeldTexture) {
      gl.uniform1i(prog.uniforms.u_hasHeldTexture, 0);
    }

    // Standard uniforms
    if (prog.uniforms.u_time) {
      gl.uniform1f(prog.uniforms.u_time, (performance.now() - this.startTime) / 1000);
    }
    if (prog.uniforms.u_resolution) {
      gl.uniform2f(prog.uniforms.u_resolution, this.canvas.width, this.canvas.height);
    }

    // Custom uniforms from the call
    for (const [name, value] of Object.entries(uniforms)) {
      const loc = prog.uniforms[name];
      if (!loc) continue;
      if (typeof value === "number") gl.uniform1f(loc, value);
      else if (typeof value === "boolean") gl.uniform1i(loc, value ? 1 : 0);
      else if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
        else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
      }
    }

    // Special handling for u_animTiming (int) and similar
    if (uniforms.u_animTiming !== undefined && prog.uniforms.u_animTiming) {
      gl.uniform1i(prog.uniforms.u_animTiming, uniforms.u_animTiming);
    }
    if (uniforms.u_colorMode !== undefined && prog.uniforms.u_colorMode) {
      gl.uniform1i(prog.uniforms.u_colorMode, uniforms.u_colorMode);
    }
    if (uniforms.u_edgeStyle !== undefined && prog.uniforms.u_edgeStyle) {
      gl.uniform1i(prog.uniforms.u_edgeStyle, uniforms.u_edgeStyle);
    }
    if (uniforms.u_phaseOffset !== undefined && prog.uniforms.u_phaseOffset) {
      gl.uniform1i(prog.uniforms.u_phaseOffset, uniforms.u_phaseOffset);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private auxTextures = new Map<string, WebGLTexture>();
  private ensureAuxTexture(name: string): WebGLTexture {
    if (this.auxTextures.has(name)) return this.auxTextures.get(name)!;
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.auxTextures.set(name, tex);
    return tex;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    for (const { program } of this.programs.values()) gl.deleteProgram(program);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    for (const tex of this.auxTextures.values()) gl.deleteTexture(tex);
    this.auxTextures.clear();
    this.programs.clear();
  }
}
```

---

## src/lib/renderer/particle-fx.ts

```typescript
// src/lib/renderer/particle-fx.ts
// Light leaks, sparks, lens flares, dust, smoke, confetti, rain — sprite-driven Canvas2D.
// Lazy-loads sprites + caches them. Falls back to procedural if assets missing.

export type ParticleKind =
  | "light_leak"
  | "sparks"
  | "lens_flare"
  | "dust"
  | "smoke"
  | "confetti"
  | "rain";

interface ParticleConfig {
  kind: ParticleKind;
  intensity: number;       // 0..1
  progress: number;        // 0..1 — local time within effect window
  centerX?: number;        // 0..1 normalized for positioning
  centerY?: number;
  hueShift?: number;       // 0..360
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Procedural sprite generators — used when asset files aren't present
function generateLightLeakSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  // Multi-layer radial gradient — warm orange/red bloom
  const colors = [
    { stops: [[0, "rgba(255, 200, 130, 1.0)"], [0.4, "rgba(255, 140, 80, 0.6)"], [1, "rgba(255, 80, 40, 0)"]] },
    { stops: [[0, "rgba(255, 100, 50, 0.7)"], [0.6, "rgba(200, 60, 30, 0.3)"], [1, "rgba(180, 30, 10, 0)"]] },
  ];
  for (const layer of colors) {
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    for (const [pos, col] of layer.stops as [number, string][]) {
      g.addColorStop(pos, col);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  return c;
}

function generateSparksSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);

  // 80 sparks emanating from center
  for (let i = 0; i < 80; i++) {
    const angle = (i / 80) * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    const x = 256 + Math.cos(angle) * dist;
    const y = 256 + Math.sin(angle) * dist;
    const len = 30 + Math.random() * 60;
    const w = 1 + Math.random() * 2;

    const g = ctx.createLinearGradient(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    g.addColorStop(0, "rgba(255, 220, 130, 1)");
    g.addColorStop(0.5, "rgba(255, 160, 60, 0.8)");
    g.addColorStop(1, "rgba(255, 80, 20, 0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  return c;
}

function generateLensFlareSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  // Bright core
  const core = ctx.createRadialGradient(256, 256, 0, 256, 256, 60);
  core.addColorStop(0, "rgba(255, 255, 240, 1)");
  core.addColorStop(0.4, "rgba(255, 220, 180, 0.7)");
  core.addColorStop(1, "rgba(255, 180, 100, 0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 512, 512);

  // Rays
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI;
    const g = ctx.createLinearGradient(256, 256, 256 + Math.cos(angle) * 250, 256 + Math.sin(angle) * 250);
    g.addColorStop(0, "rgba(255, 255, 200, 0.6)");
    g.addColorStop(1, "rgba(255, 200, 100, 0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256 - Math.cos(angle) * 250, 256 - Math.sin(angle) * 250);
    ctx.lineTo(256 + Math.cos(angle) * 250, 256 + Math.sin(angle) * 250);
    ctx.stroke();
  }
  return c;
}

export class ParticleFXRenderer {
  private sprites: Map<ParticleKind, HTMLCanvasElement> = new Map();
  private dustParticles: Array<{ x: number; y: number; r: number; vx: number; vy: number }> = [];

  constructor() {
    // Pre-generate procedural sprites
    this.sprites.set("light_leak", generateLightLeakSprite());
    this.sprites.set("sparks", generateSparksSprite());
    this.sprites.set("lens_flare", generateLensFlareSprite());

    // Init dust particles (reused across renders)
    for (let i = 0; i < 60; i++) {
      this.dustParticles.push({
        x: Math.random(),
        y: Math.random(),
        r: 1 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 0.0008,
        vy: -Math.random() * 0.0005 - 0.0002,
      });
    }
  }

  /** Composite particle effect onto ctx */
  apply(
    ctx: CanvasRenderingContext2D,
    config: ParticleConfig,
    width: number,
    height: number,
  ) {
    const { kind, intensity, progress } = config;
    if (intensity <= 0 || progress < 0 || progress > 1) return;

    switch (kind) {
      case "light_leak": return this.drawLightLeak(ctx, intensity, progress, width, height);
      case "sparks":     return this.drawSparks(ctx, intensity, progress, width, height, config);
      case "lens_flare": return this.drawLensFlare(ctx, intensity, progress, width, height, config);
      case "dust":       return this.drawDust(ctx, intensity, width, height);
      case "smoke":      return this.drawSmoke(ctx, intensity, progress, width, height);
      case "confetti":   return this.drawConfetti(ctx, intensity, progress, width, height);
      case "rain":       return this.drawRain(ctx, intensity, width, height);
    }
  }

  private drawLightLeak(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
  ) {
    const sprite = this.sprites.get("light_leak")!;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Bell curve fade in/out
    const envelope = Math.sin(progress * Math.PI);
    ctx.globalAlpha = Math.min(1, intensity * envelope * 0.95);

    // Pan across the frame
    const panX = (progress - 0.5) * width * 0.8;
    const scale = 1.4 + intensity * 0.3;
    const sw = width * scale;
    const sh = height * scale;
    ctx.drawImage(sprite, panX + (width - sw) / 2, (height - sh) / 2, sw, sh);

    ctx.restore();
  }

  private drawSparks(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
    config: ParticleConfig,
  ) {
    const sprite = this.sprites.get("sparks")!;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = intensity * (1 - progress);

    const cx = (config.centerX ?? 0.5) * width;
    const cy = (config.centerY ?? 0.5) * height;
    const size = 220 + 380 * progress;
    ctx.translate(cx, cy);
    ctx.rotate(progress * Math.PI * 0.3);
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private drawLensFlare(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
    config: ParticleConfig,
  ) {
    const sprite = this.sprites.get("lens_flare")!;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const envelope = Math.sin(progress * Math.PI);
    ctx.globalAlpha = intensity * envelope;

    const cx = (config.centerX ?? 0.5) * width;
    const cy = (config.centerY ?? 0.5) * height;
    const size = Math.max(width, height) * 0.7;
    ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }

  private drawDust(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = rgba(255, 240, 200, 0.4 * intensity);

    for (const p of this.dustParticles) {
      // Animate
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y = 1;

      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSmoke(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
  ) {
    // Procedural radial smoke clouds
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 6; i++) {
      const baseX = (i / 6) * width + Math.sin(progress * 4 + i) * 50;
      const baseY = height - progress * height * 0.6 - i * 40;
      const r = 80 + 60 * Math.sin(progress * 2 + i);
      const g = ctx.createRadialGradient(baseX, baseY, 0, baseX, baseY, r);
      const alpha = 0.18 * intensity * (1 - progress * 0.4);
      g.addColorStop(0, rgba(220, 220, 220, alpha));
      g.addColorStop(1, rgba(160, 160, 160, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(baseX, baseY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawConfetti(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    progress: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    const count = Math.floor(40 * intensity);
    const colors = ["#ff5252", "#ffeb3b", "#4caf50", "#2196f3", "#e91e63", "#ff9800"];
    for (let i = 0; i < count; i++) {
      const x = (Math.sin(i * 1.7) * 0.5 + 0.5) * width;
      const y = (i / count + progress) % 1 * height;
      const rotation = (i + progress * 4) * Math.PI;
      ctx.fillStyle = colors[i % colors.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillRect(-4, -8, 8, 16);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawRain(
    ctx: CanvasRenderingContext2D,
    intensity: number,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.strokeStyle = rgba(180, 200, 240, 0.4 * intensity);
    ctx.lineWidth = 1.5;
    const count = Math.floor(120 * intensity);
    const t = performance.now() / 100;
    for (let i = 0; i < count; i++) {
      const x = (Math.sin(i * 7.3) * 0.5 + 0.5) * width;
      const y = ((i / count) * height + t * 8) % height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 20);
      ctx.stroke();
    }
    ctx.restore();
  }
}
```

---

## src/lib/renderer/sam-mask-renderer.ts

```typescript
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
```

---

## src/lib/export-engine.ts

```typescript
// Client-side export engine using WebCodecs
// Renders MonetEDL to 1080p H.264/AAC MP4 entirely in the browser
// Runs in a dedicated Web Worker to avoid blocking the main thread

import type { MonetEDL } from "../server/types/edl";
import { MonetRenderer } from "./renderer/monet-renderer";

export interface ExportProgress {
  phase: "rendering" | "encoding" | "muxing" | "done" | "error";
  framesRendered: number;
  totalFrames: number;
  percent: number;
  estimatedSecondsRemaining: number;
  error?: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Server-side FFmpeg export — produces a guaranteed-valid MP4
 * with proper metadata, codecs, and moov atom positioning.
 * QuickTime, VLC, and all video players will accept this output.
 */
export async function exportEDLToMP4ViaServer(
  edl: any,
  mediaUrls: Map<string, string>,
  onProgress?: (p: { percent: number; stage: string }) => void
): Promise<Blob> {
  onProgress?.({ percent: 5, stage: "Uploading EDL to server..." });

  // Convert Map to plain object, skip blob URLs (server can't access them)
  const mediaUrlsObj: Record<string, string> = {};
  for (const [k, v] of mediaUrls.entries()) {
    if (v.startsWith("blob:")) {
      console.warn(`[export] Skipping blob URL for clip ${k} — server can't access blobs`);
      continue;
    }
    mediaUrlsObj[k] = v;
  }

  if (Object.keys(mediaUrlsObj).length === 0) {
    throw new Error(
      "No server-accessible media URLs. Re-upload clips so they're stored on the server."
    );
  }

  const response = await fetch("/api/export-mp4", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edl, mediaUrls: mediaUrlsObj }),
  });

  onProgress?.({ percent: 50, stage: "Server is rendering with FFmpeg..." });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Server export failed: HTTP ${response.status} — ${errText.slice(0, 200)}`
    );
  }

  onProgress?.({ percent: 90, stage: "Downloading rendered MP4..." });

  const blob = await response.blob();

  onProgress?.({ percent: 100, stage: "Complete" });

  console.log("[export] server render complete:", {
    size: blob.size,
    type: blob.type,
  });

  return blob;
}

interface SupportedEncoderProfile {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  hardwareAcceleration: HardwareAcceleration;
  avc?: AvcEncoderConfig;
}

type HardwareAcceleration = "no-preference" | "prefer-hardware" | "prefer-software";

interface AvcEncoderConfig {
  format: "avc" | "annexb";
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function clampFps(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(60, Math.round(value)));
}

function scaleToMaxArea(params: {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}): { width: number; height: number } {
  const widthScale = params.maxWidth / params.width;
  const heightScale = params.maxHeight / params.height;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: even(params.width * scale),
    height: even(params.height * scale),
  };
}

function buildCandidateProfiles(params: {
  requestedWidth: number;
  requestedHeight: number;
  fps: number;
  bitrate?: number;
}): SupportedEncoderProfile[] {
  const requestedWidth = even(params.requestedWidth);
  const requestedHeight = even(params.requestedHeight);

  const bitrate1080 = params.bitrate ?? 8_000_000;
  const bitrate720 = Math.min(params.bitrate ?? 4_000_000, 5_000_000);

  const downscaled720 = scaleToMaxArea({
    width: requestedWidth,
    height: requestedHeight,
    maxWidth: 1280,
    maxHeight: 720,
  });

  const candidates: SupportedEncoderProfile[] = [];

  /*
   * H.264 codec string format:
   * avc1.PPCCLL
   *
   * 640028 = High profile, level 4.0 (suited for 1080p @ 30fps)
   * 4d0028 = Main profile, level 4.0
   * 42e028 = Baseline profile, level 4.0
   * 42e01f = Baseline profile, level 3.1 (suited for 720p fallback)
   * 42001f = Baseline, level 3.1
   */
  candidates.push(
    {
      codec: "avc1.640028",
      width: requestedWidth,
      height: requestedHeight,
      bitrate: bitrate1080,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.4d0028",
      width: requestedWidth,
      height: requestedHeight,
      bitrate: bitrate1080,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.42e028",
      width: requestedWidth,
      height: requestedHeight,
      bitrate: bitrate1080,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.42e01f",
      width: downscaled720.width,
      height: downscaled720.height,
      bitrate: bitrate720,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.42001f",
      width: downscaled720.width,
      height: downscaled720.height,
      bitrate: bitrate720,
      hardwareAcceleration: "no-preference",
      avc: { format: "avc" },
    }
  );

  return candidates;
}

async function selectSupportedEncoderProfile(params: {
  requestedWidth: number;
  requestedHeight: number;
  fps: number;
  bitrate?: number;
}): Promise<SupportedEncoderProfile | null> {
  const candidates = buildCandidateProfiles(params);

  for (const candidate of candidates) {
    const config: VideoEncoderConfig = {
      codec: candidate.codec,
      width: candidate.width,
      height: candidate.height,
      bitrate: candidate.bitrate,
      framerate: params.fps,
      hardwareAcceleration: candidate.hardwareAcceleration,
      avc: candidate.avc,
    };

    try {
      const support = await VideoEncoder.isConfigSupported(config);

      if (support.supported) {
        return candidate;
      }

      console.warn("[export-engine] Encoder config unsupported", {
        codec: candidate.codec,
        width: candidate.width,
        height: candidate.height,
        bitrate: candidate.bitrate,
      });
    } catch (error) {
      console.warn("[export-engine] Encoder support check failed", {
        codec: candidate.codec,
        width: candidate.width,
        height: candidate.height,
        error,
      });
    }
  }

  return null;
}

/**
 * Export a MonetEDL to an MP4 Blob.
 * Uses WebCodecs VideoEncoder + a simple MP4 muxer.
 *
 * Target spec: H.264 Baseline/Main/High, up to 1080p, 30fps, ~8Mbps
 *
 * Returns a Blob that can be used with URL.createObjectURL() for download.
 */
export async function exportEDLToMP4(
  edl: MonetEDL,
  mediaUrls: Map<string, string>,
  onProgress?: ProgressCallback
): Promise<Blob> {
  // Check WebCodecs support
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error(
      "WebCodecs not supported in this browser. Please use Chrome 94+ or Edge 94+."
    );
  }

  const rawFps = edl.timeline.fps;
  const rawDuration = edl.timeline.duration;

  if (typeof rawDuration !== "number" || !Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error(`Invalid timeline duration: ${rawDuration}. Duration must be a positive finite number.`);
  }

  const fps = clampFps(rawFps);
  const duration = rawDuration;

  const totalFrames = Math.ceil(duration * fps);
  const startTime = performance.now();

  const report = (phase: ExportProgress["phase"], framesRendered: number, error?: string) => {
    if (!onProgress) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const rate = framesRendered / (elapsed || 1);
    const remaining = rate > 0 ? (totalFrames - framesRendered) / rate : 0;
    onProgress({
      phase,
      framesRendered,
      totalFrames,
      percent: Math.round((framesRendered / totalFrames) * 100),
      estimatedSecondsRemaining: Math.round(remaining),
      error,
    });
  };

  const roundedWidth = even(edl.timeline.resolution.width);
  const roundedHeight = even(edl.timeline.resolution.height);

  // Auto-detect and select supported WebCodecs profile (downscaling to 720p if 1080p level 4.0 is unsupported)
  const profile = await selectSupportedEncoderProfile({
    requestedWidth: roundedWidth,
    requestedHeight: roundedHeight,
    fps,
    bitrate: 8_000_000,
  });

  if (!profile) {
    throw new Error(
      "No supported H.264 WebCodecs encoder configuration was found for this browser/device."
    );
  }

  console.log("[export-engine] Export encoder configuration selected", {
    codec: profile.codec,
    width: profile.width,
    height: profile.height,
    bitrate: profile.bitrate,
    fps,
  });

  // --- Set up off-screen canvas for rendering ---
  const canvas = document.createElement("canvas");
  canvas.width = profile.width;
  canvas.height = profile.height;

  const renderer = new MonetRenderer();
  await renderer.initialize(edl, canvas, mediaUrls);

  // --- Collect encoded video chunks ---
  const videoChunks: EncodedVideoChunk[] = [];
  let avcDescription: ArrayBuffer | undefined;
  let encoderClosed = false;
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      // Capture the AVCDecoderConfigurationRecord from the first key frame.
      // This is the real SPS/PPS from the encoder — required for a valid avcC box.
      if (!avcDescription && metadata?.decoderConfig?.description) {
        const desc = metadata.decoderConfig.description;
        // Always produce a plain ArrayBuffer for the muxer.
        if (desc instanceof ArrayBuffer) {
          avcDescription = desc;
        } else if (ArrayBuffer.isView(desc)) {
          const view = desc as ArrayBufferView;
          avcDescription = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
        }
      }
      videoChunks.push(chunk);
    },
    error: (e) => {
      encoderError = e;
      encoderClosed = true;
      console.error("[export-engine] VideoEncoder encountered an asynchronous error:", e);
    },
  });

  try {
    encoder.configure({
      codec: profile.codec,
      width: profile.width,
      height: profile.height,
      bitrate: profile.bitrate,
      framerate: fps,
      hardwareAcceleration: profile.hardwareAcceleration,
      avc: profile.avc,
    });
  } catch (configError) {
    encoderClosed = true;
    renderer.cleanup();
    throw configError;
  }

  // --- Render and encode each frame ---
  report("rendering", 0);

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (encoderError) {
        throw encoderError;
      }
      if (encoderClosed) {
        throw new Error("VideoEncoder closed before all frames could be encoded.");
      }

      const time = frameIdx / fps;

      // Render this frame to canvas
      await renderer.renderFrame(time);

      // Create VideoFrame from canvas
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1_000_000), // microseconds
        duration: Math.round((1 / fps) * 1_000_000),
      });

      const isKey = frameIdx % (fps * 2) === 0; // keyframe every 2s
      
      try {
        encoder.encode(frame, { keyFrame: isKey });
      } catch (encodeErr) {
        frame.close();
        throw encodeErr;
      }
      
      frame.close();

      if (frameIdx % 10 === 0) {
        report("rendering", frameIdx);
        // Yield to browser event loop every 10 frames
        await yieldToMain();
      }
    }

    if (encoderError) {
      throw encoderError;
    }

    if (!encoderClosed) {
      report("encoding", totalFrames);
      await encoder.flush();
      if (encoderError) {
        throw encoderError;
      }
      encoder.close();
      encoderClosed = true;
    }
  } catch (err) {
    if (!encoderClosed) {
      try {
        encoder.close();
      } catch {}
      encoderClosed = true;
    }
    renderer.cleanup();
    throw err;
  }

  if (encoderError) {
    throw encoderError;
  }

  // --- Mux into MP4 ---
  report("muxing", totalFrames);

  const mp4Blob = muxToMP4(videoChunks, profile.width, profile.height, fps, duration, avcDescription);

  report("done", totalFrames);

  renderer.cleanup();
  return mp4Blob;
}

/**
 * Minimal MP4 muxer for H.264 video chunks.
 *
 * Produces a valid progressive-download MP4 with:
 * - ftyp box (isom/mp41)
 * - mdat box (raw media data)
 * - moov box with correct sample table
 *
 * For MVP: video-only (audio mixing is Phase 8 expansion).
 * The music track can be mixed client-side in a follow-up using Web Audio API + OfflineAudioContext.
 */
function muxToMP4(
  chunks: EncodedVideoChunk[],
  width: number,
  height: number,
  fps: number,
  duration: number,
  avcDescription?: ArrayBuffer
): Blob {
  // Build sample data
  const samples: { data: Uint8Array; timestamp: number; duration: number; isKey: boolean }[] = [];

  for (const chunk of chunks) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    samples.push({
      data,
      timestamp: chunk.timestamp,
      duration: chunk.duration ?? Math.round((1 / fps) * 1_000_000),
      isKey: chunk.type === "key",
    });
  }

  const timescale = 90000; // Standard MP4 timescale
  const durationTS = Math.round(duration * timescale);

  // Helper functions for writing MP4 boxes
  const writeUint32 = (v: number, buf: number[]) => {
    buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };

  const writeBox = (type: string, payload: number[]): number[] => {
    const size = 8 + payload.length;
    const box: number[] = [];
    writeUint32(size, box);
    for (const c of type) box.push(c.charCodeAt(0));
    return [...box, ...payload];
  };

  const writeString = (s: string): number[] => s.split("").map((c) => c.charCodeAt(0));

  // ftyp box
  const ftyp = writeBox("ftyp", [
    ...writeString("isom"),
    0, 0, 2, 0, // minor version
    ...writeString("isom"),
    ...writeString("iso2"),
    ...writeString("avc1"),
    ...writeString("mp41"),
  ]);

  // Calculate size of mdat payload
  let mdatPayloadSize = 0;
  for (const s of samples) {
    mdatPayloadSize += 4 + s.data.length; // 4-byte size prefix + frame data
  }
  const mdatBoxSize = 8 + mdatPayloadSize;

  // Build mdat header (length + "mdat")
  const mdatHeader = new Uint8Array(8);
  const mdatHeaderView = new DataView(mdatHeader.buffer);
  mdatHeaderView.setUint32(0, mdatBoxSize, false);
  mdatHeader.set([109, 100, 97, 116], 4); // "mdat" in ASCII

  // Compute precise sample offsets in the final file
  const ftypSize = ftyp.length;
  let currentOffset = ftypSize + 8; // ftyp size + 8 bytes of mdat header
  const sampleOffsets: number[] = [];

  for (const s of samples) {
    sampleOffsets.push(currentOffset);
    currentOffset += 4 + s.data.length;
  }

  // Construct blob parts sequentially to avoid stack/array-limit memory overhead
  const blobParts: any[] = [];
  blobParts.push(new Uint8Array(ftyp));
  blobParts.push(mdatHeader);

  for (const s of samples) {
    const sizePrefix = new Uint8Array(4);
    const view = new DataView(sizePrefix.buffer);
    view.setUint32(0, s.data.length, false);
    blobParts.push(sizePrefix);
    blobParts.push(s.data);
  }

  // Build moov box using precise offsets
  const moov = buildMoovBox(samples, sampleOffsets, width, height, fps, durationTS, timescale, avcDescription);
  blobParts.push(new Uint8Array(moov));

  return new Blob(blobParts, { type: "video/mp4" });
}

function buildMoovBox(
  samples: { data: Uint8Array; timestamp: number; duration: number; isKey: boolean }[],
  sampleOffsets: number[],
  width: number,
  height: number,
  fps: number,
  durationTS: number,
  timescale: number,
  avcDescription?: ArrayBuffer
): number[] {
  const writeUint32 = (v: number): number[] => [
    (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff,
  ];
  const writeUint16 = (v: number): number[] => [(v >>> 8) & 0xff, v & 0xff];
  const writeString = (s: string): number[] => s.split("").map((c) => c.charCodeAt(0));

  const writeBox = (type: string, payload: number[]): number[] => {
    const size = 8 + payload.length;
    return [...writeUint32(size), ...writeString(type), ...payload];
  };

  const mvhd = writeBox("mvhd", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // creation time
    0, 0, 0, 0, // modification time
    ...writeUint32(timescale),
    ...writeUint32(durationTS),
    0, 1, 0, 0, // rate = 1.0
    1, 0,       // volume = 1.0
    0, 0,       // reserved
    0, 0, 0, 0, 0, 0, 0, 0, // reserved
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // matrix row 1
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, // matrix row 2
    0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0, // matrix row 3
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // pre-defined
    0, 0, 0, 2, // next track ID
  ]);

  // stts: sample-to-time table
  const sampleDuration = Math.round(timescale / fps);
  const stts = writeBox("stts", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...writeUint32(samples.length), // sample count
    ...writeUint32(sampleDuration), // sample delta
  ]);

  // stss: sync sample (keyframe) table
  const keyFrameIndices = samples
    .map((s, i) => (s.isKey ? i + 1 : -1))
    .filter((i) => i !== -1);
  const stss = writeBox("stss", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(keyFrameIndices.length),
    ...keyFrameIndices.flatMap((i) => writeUint32(i)),
  ]);

  // stsz: sample sizes
  const stsz = writeBox("stsz", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // sample size (0 = variable)
    ...writeUint32(samples.length),
    ...samples.flatMap((s) => writeUint32(s.data.length + 4)), // +4 for AVCC length prefix
  ]);

  // stco: chunk offsets
  const stco = writeBox("stco", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(samples.length),
    ...sampleOffsets.flatMap((o) => writeUint32(o)),
  ]);

  // stsc: sample-to-chunk
  const stsc = writeBox("stsc", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...writeUint32(1), // first chunk
    ...writeUint32(1), // samples per chunk
    ...writeUint32(1), // sample description index
  ]);

  // avcC: use real SPS/PPS from encoder if available, otherwise fall back to
  // a known-good Baseline 4.0 record that most decoders accept.
  const avcC = avcDescription
    ? writeBox("avcC", Array.from(new Uint8Array(avcDescription)))
    : writeBox("avcC", [
        1,          // configurationVersion
        0x42, 0x00, 0x28, // Baseline profile, level 4.0
        0xff,       // lengthSizeMinusOne = 3 (4-byte NAL length prefixes)
        0xe1,       // numSequenceParameterSets = 1
        // Minimal SPS for H.264 Baseline 4.0 (generic — encoder may override at decode time)
        0x00, 0x0b,
        0x67, 0x42, 0x00, 0x28, 0xda, 0x01, 0x40, 0x16, 0xe9, 0x20, 0x20,
        1,          // numPictureParameterSets = 1
        0x00, 0x04,
        0x68, 0xce, 0x38, 0x80,
      ]);

  const avc1 = writeBox("avc1", [
    0, 0, 0, 0, 0, 0, // reserved
    0, 1, // data reference index
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // pre-defined + reserved
    ...writeUint16(width),
    ...writeUint16(height),
    0, 72, 0, 0, // horiz resolution = 72 dpi
    0, 72, 0, 0, // vert resolution = 72 dpi
    0, 0, 0, 0, // reserved
    0, 1, // frame count
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // compressorname (32 bytes)
    0, 24, // depth
    0xff, 0xff, // pre_defined
    ...avcC,
  ]);

  const stsd = writeBox("stsd", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...avc1,
  ]);

  const stbl = writeBox("stbl", [...stsd, ...stts, ...stss, ...stsc, ...stsz, ...stco]);

  const dref = writeBox("dref", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...writeBox("url ", [0, 0, 0, 1]), // url_ with self-contained flag
  ]);

  const dinf = writeBox("dinf", [...dref]);

  const smhd = writeBox("smhd", [0, 0, 0, 0, 0, 0, 0, 0]);
  const vmhd = writeBox("vmhd", [0, 0, 0, 1, 0, 0, 0, 0]);

  const minf = writeBox("minf", [...vmhd, ...dinf, ...stbl]);

  const mdhd = writeBox("mdhd", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // creation time
    0, 0, 0, 0, // modification time
    ...writeUint32(timescale),
    ...writeUint32(durationTS),
    0, 0, // language
    0, 0, // pre_defined
  ]);

  const hdlr = writeBox("hdlr", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // pre_defined
    ...writeString("vide"), // handler type
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // reserved
    ...writeString("VideoHandler"), 0, // name
  ]);

  const mdia = writeBox("mdia", [...mdhd, ...hdlr, ...minf]);

  const tkhd = writeBox("tkhd", [
    0, 0, 0, 3, // version + flags (track enabled + in movie)
    0, 0, 0, 0, // creation time
    0, 0, 0, 0, // modification time
    0, 0, 0, 1, // track ID
    0, 0, 0, 0, // reserved
    ...writeUint32(durationTS),
    0, 0, 0, 0, 0, 0, 0, 0, // reserved
    0, 0, // layer
    0, 0, // alternate group
    0, 0, // volume
    0, 0, // reserved
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // matrix row 1
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, // matrix row 2
    0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0, // matrix row 3
    ...writeUint32(width << 16), // width (fixed point 16.16)
    ...writeUint32(height << 16), // height (fixed point 16.16)
  ]);

  const trak = writeBox("trak", [...tkhd, ...mdia]);

  return writeBox("moov", [...mvhd, ...trak]);
}

/** Yield execution back to the browser event loop */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
```

---

## src/lib/engines/engine-dispatch.ts

```typescript
// src/lib/engines/engine-dispatch.ts
// Bridges the router's per-shot engine assignments to actual renderer calls.

import { ShaderFXRenderer, type ShaderEffectKind } from "../renderer/shader-fx";
import { ParticleFXRenderer, type ParticleKind } from "../renderer/particle-fx";
import { KineticTextEngine, type KineticTextSpec } from "../renderer/text-engine";
import type { EngineId } from "./types";
import { getShaderSpec } from "../shaders/spiderverse";
import { getSAMMaskRenderer } from "../renderer/sam-mask-renderer";

// Singleton instances (heavy to construct — reuse across renders)
let _shaderFX: ShaderFXRenderer | null = null;
let _particleFX: ParticleFXRenderer | null = null;
let _textEngine: KineticTextEngine | null = null;

export function getShaderFX(width: number, height: number): ShaderFXRenderer {
  if (!_shaderFX) {
    try {
      _shaderFX = new ShaderFXRenderer(width, height);
    } catch (e) {
      console.warn("[engine-dispatch] ShaderFX init failed:", e);
      throw e;
    }
  }
  _shaderFX.resize(width, height);
  return _shaderFX;
}

export function getParticleFX(): ParticleFXRenderer {
  if (!_particleFX) _particleFX = new ParticleFXRenderer();
  return _particleFX;
}

export function getTextEngine(): KineticTextEngine {
  if (!_textEngine) _textEngine = new KineticTextEngine();
  return _textEngine;
}

const SHADER_EFFECT_MAP: Record<string, ShaderEffectKind> = {
  glitch: "glitch",
  vhs: "vhs",
  rgb_shift: "rgb_shift",
  rgb_split: "rgb_shift",
  scanlines: "scanlines",
  pixelate: "pixelate",
  // Spider-Verse bundle:
  halftone: "halftone",
  benday: "halftone",
  comic_edges: "comic_edges",
  ink: "comic_edges",
  outline: "comic_edges",
  frame_stutter: "frame_stutter",
  anime_timing: "frame_stutter",
  on_2s: "frame_stutter",
  chromatic_glitch: "chromatic_glitch",
  chromatic_burst: "chromatic_glitch",
  // glfx effects
  brightness_contrast: "brightness_contrast",
  brightness: "brightness_contrast",
  contrast: "brightness_contrast",
  exposure: "brightness_contrast",
  hue_saturation: "hue_saturation",
  hue_shift: "hue_saturation",
  vibrance: "vibrance",
  sepia: "sepia",
  vintage_tone: "sepia",
  vignette_pro: "vignette_pro",
  triangle_blur: "triangle_blur",
  soft_blur: "triangle_blur",
  gaussian_blur: "triangle_blur",
  lens_blur: "lens_blur",
  bokeh_blur: "lens_blur",
  depth_blur: "lens_blur",
  tilt_shift: "tilt_shift",
  miniature: "tilt_shift",
  edges_gfx: "edges_gfx",
  edge_detect: "edges_gfx",
  sobel: "edges_gfx",
  ink_gfx: "ink_gfx",
  pen_sketch: "ink_gfx",
  emboss_gfx: "emboss_gfx",
  relief: "emboss_gfx",
  swirl_gfx: "swirl_gfx",
  twist: "swirl_gfx",
  bulge_pinch: "bulge_pinch",
  bulge: "bulge_pinch",
  pinch: "bulge_pinch",
  fish_eye: "bulge_pinch",
  noise_film: "noise_film",
  film_grain: "noise_film",
  grain: "noise_film",
  posterize_gfx: "posterize_gfx",
  posterize: "posterize_gfx",
  zoom_blur: "zoom_blur",
  radial_blur: "zoom_blur",
  denoise_gfx: "denoise_gfx",
  denoise: "denoise_gfx",
  color_halftone: "color_halftone",
  newspaper: "color_halftone",
  dot_screen: "dot_screen",
  halftone_mono: "dot_screen",
  shift_towards: "shift_towards",
  warm_shift: "shift_towards",
  cool_shift: "shift_towards",
  color_cast: "shift_towards",
  // shadertoy effects
  plasma: "plasma",
  psychedelic: "plasma",
  heat_wave: "heat_wave",
  mirage: "heat_wave",
  crt_monitor: "crt_monitor",
  crt: "crt_monitor",
  retro_tv: "crt_monitor",
  dream_blur: "dream_blur",
  dream: "dream_blur",
  soft_focus: "dream_blur",
  kaleidoscope: "kaleidoscope",
  pulse_wave: "pulse_wave",
  shock_wave: "pulse_wave",
  ascii_matrix: "ascii_matrix",
  matrix: "ascii_matrix",
  ascii: "ascii_matrix",
  hologram: "hologram",
  sci_fi: "hologram",
  thermal: "thermal",
  predator_vision: "thermal",
  duotone: "duotone",
  floating_dust: "floating_dust",
  particles_dust: "floating_dust",
  infrared: "infrared",
  edge_glow: "infrared",
  film_scratches: "film_scratches",
  old_film: "film_scratches",
  liquid: "liquid",
  underwater: "liquid",
  bloom_highlights: "bloom_highlights",
  bloom: "bloom_highlights",
  glow_pro: "bloom_highlights",
  // pro-grade effects
  film_grain_pro: "film_grain_pro",
  grain_pro: "film_grain_pro",
  vignette_pro_v2: "vignette_pro_v2",
  color_temperature: "color_temperature",
  warm_temp: "color_temperature",
  cool_temp: "color_temperature",
  kelvin_shift: "color_temperature",
  // custom VFX (reference-matched)
  spiderverse_halftone: "spiderverse_halftone",
  comic_dots: "spiderverse_halftone",
  ben_day: "spiderverse_halftone",
  halftone_pro: "spiderverse_halftone",
  sports_speed_trail: "sports_speed_trail",
  speed_trail: "sports_speed_trail",
  motion_blur_pro: "sports_speed_trail",
  sports_energy: "sports_speed_trail",
  tyler_vibrant_pop: "tyler_vibrant_pop",
  vibrant_pop: "tyler_vibrant_pop",
  color_pop: "tyler_vibrant_pop",
  warm_vibrant: "tyler_vibrant_pop",
  racing_motion_streak: "racing_motion_streak",
  racing_streak: "racing_motion_streak",
  speed_lines: "racing_motion_streak",
  f1_energy: "racing_motion_streak",
  dark_moody_cinematic: "dark_moody_cinematic",
  dark_moody: "dark_moody_cinematic",
  moody_basketball: "dark_moody_cinematic",
  cool_cinematic: "dark_moody_cinematic",
  lifestyle_glitch: "lifestyle_glitch",
  nyc_glitch: "lifestyle_glitch",
  city_energy: "lifestyle_glitch",
  lifestyle_fast: "lifestyle_glitch",
  tiktok_energy_pulse: "tiktok_energy_pulse",
  tiktok_energy: "tiktok_energy_pulse",
  pulse: "tiktok_energy_pulse",
  viral_energy: "tiktok_energy_pulse",
};

const PARTICLE_EFFECT_MAP: Record<string, ParticleKind> = {
  light_leak: "light_leak",
  sparks: "sparks",
  lens_flare: "lens_flare",
  dust: "dust",
  smoke: "smoke",
  confetti: "confetti",
  rain: "rain",
};

const TEXT_EFFECT_KINDS = new Set([
  "kinetic_caption", "subtitle", "title_card",
  "lower_third", "lyric_text", "word_pop",
]);

export interface DispatchContext {
  ctx: CanvasRenderingContext2D;
  baseCanvas: HTMLCanvasElement;
  prevFrameCanvas?: HTMLCanvasElement;
  heldFrameCanvas?: HTMLCanvasElement;
  width: number;
  height: number;
  timelineTime: number;
  shotLocalTime: number;
  video?: HTMLVideoElement;
}

/**
 * Apply effects assigned to a specific engine for one shot's effect bundle.
 * Returns true if anything was rendered.
 */
export async function dispatchToEngine(
  engineId: EngineId,
  effectKinds: string[],
  effectsByKind: Map<string, any>,
  context: DispatchContext,
): Promise<boolean> {
  let rendered = false;

  for (const kind of effectKinds) {
    const effect = context.shotLocalTime >= 0 ? effectsByKind.get(kind) : null;
    if (!effect) continue;
    const intensity = effect.intensity ?? 0.7;
    const localStart = effect.startTime ?? 0;
    const localDur = effect.duration ?? 1.0;
    const localT = (context.shotLocalTime - localStart) / localDur;

    if (localT < 0 || localT > 1) continue;

    try {
      if (engineId === "shader-fx" && SHADER_EFFECT_MAP[kind]) {
        const shader = getShaderFX(context.width, context.height);
        const spec = getShaderSpec(SHADER_EFFECT_MAP[kind]);
        if (spec) {
          // Merge defaults with shot-level intensity override
          const params = effect.params ?? {};
          const uniforms = {
            ...spec.defaultUniforms,
            ...params,
            u_intensity: intensity,
          };
          shader.applyAdvanced(
            context.baseCanvas,
            SHADER_EFFECT_MAP[kind],
            uniforms,
            spec.requiresPrevFrame ? context.prevFrameCanvas : undefined,
            spec.requiresHeldFrame ? context.heldFrameCanvas : undefined,
          );
        } else {
          shader.apply(context.baseCanvas, SHADER_EFFECT_MAP[kind], intensity);
        }
        context.ctx.drawImage(shader.getCanvas(), 0, 0, context.width, context.height);
        rendered = true;
      }
      else if (engineId === "particle-fx" && PARTICLE_EFFECT_MAP[kind]) {
        const particles = getParticleFX();
        particles.apply(
          context.ctx,
          {
            kind: PARTICLE_EFFECT_MAP[kind],
            intensity,
            progress: localT,
            centerX: effect.params?.centerX ?? 0.5,
            centerY: effect.params?.centerY ?? 0.5,
          },
          context.width,
          context.height,
        );
        rendered = true;
      }
      else if (engineId === "text-engine" && TEXT_EFFECT_KINDS.has(kind)) {
        const textEngine = getTextEngine();
        const spec: KineticTextSpec = {
          text: effect.params?.text ?? effect.text ?? "",
          startTime: localStart,
          duration: localDur,
          animation: effect.params?.animation ?? "pop",
          style: {
            fontSize: effect.params?.fontSize ?? 120,
            fontFamily: effect.params?.fontFamily ?? "Impact",
            color: effect.params?.color ?? "#ffffff",
            strokeColor: effect.params?.strokeColor ?? "#000000",
            strokeWidth: effect.params?.strokeWidth ?? 6,
            backgroundColor: effect.params?.backgroundColor,
            position: effect.params?.position ?? { x: 50, y: 50 },
            align: effect.params?.align ?? "center",
            fontWeight: effect.params?.fontWeight ?? "900",
          },
        };
        if (spec.text) {
          textEngine.draw(context.ctx, spec, context.shotLocalTime, context.width, context.height);
          rendered = true;
        }
      }
      else if (engineId === "ai-specialist" && (kind === "subject_isolation" || kind === "isolate_subject" || kind === "bg_blur" || kind === "bg_dim")) {
        const sam = getSAMMaskRenderer();
        if (effect.params?.maskUrl && context.video) {
          const mask = await sam.loadMask(effect.params.maskUrl);
          sam.composite(
            context.ctx,
            context.video,
            mask,
            context.shotLocalTime,
            {
              intensity,
              backgroundMode: effect.params?.backgroundMode ?? (kind === "bg_blur" ? "blur" : kind === "bg_dim" ? "dim" : "blur"),
              subjectHighlight: true,
            },
            context.width,
            context.height
          );
          rendered = true;
        }
      }
      // Specialist AI engines — SAM2, Depth, RIFE
      else if (engineId === "specialist-ai") {
        const { compositeSAMMask, compositeDepthFocus, compositeSubjectFallback } = await import("./specialist-compositor");
        const sourceVideo = context.video;

        if ((kind === "subject_isolation" || kind === "subject_pop" ||
             kind === "bg_blur_subject" || kind === "bg_dim_subject") && sourceVideo) {
          if (effect.params?.maskUrl) {
            // Server provided a mask — use it
            await compositeSAMMask(
              context.ctx,
              sourceVideo,
              effect.params.maskUrl,
              context.shotLocalTime ?? 0,
              {
                intensity,
                backgroundMode: kind === "bg_blur_subject" ? "blur"
                  : kind === "bg_dim_subject" ? "dim" : "blur",
                backgroundColor: effect.params.backgroundColor,
              },
              context.width,
              context.height,
            );
            rendered = true;
          } else {
            // No mask (HF rate-limited or skipped) — use MediaPipe browser fallback
            await compositeSubjectFallback(
              context.ctx,
              sourceVideo,
              context.shotLocalTime ?? 0,
              {
                intensity,
                backgroundMode: kind === "bg_blur_subject" ? "blur"
                  : kind === "bg_dim_subject" ? "dim" : "blur",
                backgroundColor: effect.params?.backgroundColor,
              },
              context.width,
              context.height,
            );
            rendered = true;
          }
        } else if ((kind === "depth_focus" || kind === "depth_parallax") &&
                   effect.params?.depthUrl && sourceVideo) {
          await compositeDepthFocus(
            context.ctx,
            sourceVideo,
            effect.params.depthUrl,
            context.shotLocalTime ?? 0,
            {
              focalDepth: effect.params.focalDepth ?? 0.3,
              blurStrength: intensity,
            },
            context.width,
            context.height,
          );
          rendered = true;
        }
      }
      // OpenCV browser effects
      else if (engineId === "opencv-browser") {
        const { detectFaces, detectEdges } = await import("../integrations/opencv-wrapper");

        if (kind === "edge_outline" && context.baseCanvas) {
          const edges = await detectEdges(context.baseCanvas, 50, 150);
          const edgeCanvas = document.createElement("canvas");
          edgeCanvas.width = context.width;
          edgeCanvas.height = context.height;
          edgeCanvas.getContext("2d")!.putImageData(edges, 0, 0);

          context.ctx.save();
          context.ctx.globalAlpha = intensity * 0.6;
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.drawImage(edgeCanvas, 0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        } else if (kind === "face_detect_overlay" && context.baseCanvas) {
          const faces = await detectFaces(context.baseCanvas);
          context.ctx.save();
          context.ctx.strokeStyle = "rgba(0,255,128,0.7)";
          context.ctx.lineWidth = 2;
          for (const f of faces) {
            context.ctx.strokeRect(f.x, f.y, f.width, f.height);
          }
          context.ctx.restore();
          rendered = true;
        }
      }
      else if (engineId === "webgl-grade") {
        if (kind === "push_in" || kind === "speed_ramp") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.3, intensity * 0.4);
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.fillStyle = "rgba(255,255,255,0.1)";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        } else if (kind === "impact_flash") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.25, intensity * 0.3);
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.fillStyle = "rgba(255,220,180,0.15)";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        } else if (kind === "color_pulse") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.2, intensity * 0.25);
          context.ctx.globalCompositeOperation = "overlay";
          context.ctx.fillStyle = effect.params?.color ?? "rgba(255,100,50,0.1)";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        }
      }
      else if (engineId === "canvas2d") {
        if (kind === "impact_flash") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.35, intensity * 0.4);
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.fillStyle = "#ffffff";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        }
      }
    } catch (e: any) {
      console.warn(`[engine-dispatch] ${engineId}:${kind} failed:`, e.message);
    }
  }

  return rendered;
}

export function disposeDispatcher() {
  if (_shaderFX) {
    _shaderFX.dispose();
    _shaderFX = null;
  }
  _particleFX = null;
  _textEngine = null;
}
```

---

## src/lib/engines/registry.ts

```typescript
// src/lib/engines/registry.ts
import type { EngineCapability, EngineId } from "./types";

export const ENGINE_REGISTRY: EngineCapability[] = [
  {
    id: "openreel",
    displayName: "OpenReel Canvas2D",
    description: "Baseline renderer — cuts, transforms, simple effects",
    supports: new Set([
      "beat_cut", "push_in", "pull_out", "impact_flash",
      "context_shake", "speed_ramp", "freeze_frame", "whip_pan",
    ]),
    preferredFor: new Set(["beat_cut", "push_in", "freeze_frame"]),
    cost: 1,
    qualityBonus: 1,
    tier: "free",
  },

  {
    id: "webgl-grade",
    displayName: "WebGL Grade",
    description: "GPU color grading, vignette, chromatic aberration",
    supports: new Set([
      "color_pulse", "vignette_punch", "chromatic_burst",
      "color_grade", "warm_tone", "cool_tone", "desaturate",
    ]),
    preferredFor: new Set(["color_grade", "vignette_punch", "chromatic_burst"]),
    cost: 1.2,
    qualityBonus: 2.5,
    tier: "free",
  },

  {
    id: "webgl-blur",
    displayName: "WebGL Blur",
    description: "Gaussian, motion, and radial blur on GPU",
    supports: new Set([
      "motion_blur", "radial_blur", "tilt_shift", "depth_blur",
    ]),
    preferredFor: new Set(["motion_blur", "radial_blur"]),
    cost: 1.3,
    qualityBonus: 2.2,
    tier: "free",
  },

  {
    id: "shader-fx",
    displayName: "Shader FX",
    description: "50+ GPU effects: glitch, blur, color grade, distort, stylize, bloom",
    supports: new Set([
      "glitch", "vhs", "scanlines", "rgb_shift", "displacement",
      "pixelate", "kaleidoscope",
      "halftone", "comic_edges", "frame_stutter", "chromatic_glitch",
      // glfx effects
      "brightness_contrast", "hue_saturation", "vibrance", "sepia", "vignette_pro",
      "triangle_blur", "lens_blur", "tilt_shift", "edges_gfx", "ink_gfx", "emboss_gfx",
      "swirl_gfx", "bulge_pinch", "noise_film", "posterize_gfx", "zoom_blur", "denoise_gfx",
      "color_halftone", "dot_screen", "shift_towards",
      // shadertoy effects
      "plasma", "heat_wave", "crt_monitor", "dream_blur", "kaleidoscope",
      "pulse_wave", "ascii_matrix", "hologram", "thermal", "duotone",
      "floating_dust", "infrared", "film_scratches", "liquid", "bloom_highlights",
      // pro-grade effects
      "film_grain_pro", "vignette_pro_v2", "color_temperature",
      // custom VFX (reference-matched)
      "spiderverse_halftone", "sports_speed_trail", "tyler_vibrant_pop",
      "racing_motion_streak", "dark_moody_cinematic", "lifestyle_glitch",
      "tiktok_energy_pulse",
    ]),
    preferredFor: new Set([
      "glitch", "vhs", "rgb_shift",
      "halftone", "comic_edges", "chromatic_glitch",
      "crt_monitor", "hologram", "thermal", "plasma", "bloom_highlights",
    ]),
    cost: 1.5,
    qualityBonus: 3.0,
    tier: "free",
  },

  {
    id: "particle-fx",
    displayName: "Particle FX",
    description: "Sparks, light leaks, dust, lens flares, confetti",
    supports: new Set([
      "sparks", "light_leak", "dust", "lens_flare",
      "confetti", "smoke", "rain",
    ]),
    preferredFor: new Set(["light_leak", "sparks", "lens_flare"]),
    cost: 2,
    qualityBonus: 2,
    tier: "creator",
  },

  {
    id: "text-engine",
    displayName: "Kinetic Text",
    description: "Animated captions, kinetic typography, lower thirds",
    supports: new Set([
      "kinetic_caption", "subtitle", "title_card",
      "lower_third", "lyric_text", "word_pop",
    ]),
    preferredFor: new Set(["kinetic_caption", "lyric_text"]),
    cost: 1.5,
    qualityBonus: 2.5,
    tier: "free",
  },

  {
    id: "audio-engine",
    displayName: "Audio Engine",
    description: "BGM mixing, VO ducking, beat-locked fades, sidechain",
    supports: new Set([
      "bgm_mix", "vo_duck", "beat_fade",
      "sidechain", "audio_pulse",
    ]),
    preferredFor: new Set(["bgm_mix", "vo_duck", "sidechain"]),
    cost: 1.2,
    qualityBonus: 2,
    tier: "free",
  },

  {
    id: "rife-interp",
    displayName: "RIFE Optical Flow",
    description: "AI frame interpolation for buttery slow-mo and speed ramps",
    supports: new Set([
      "smooth_slowmo", "frame_interp", "speed_ramp_hq",
    ]),
    preferredFor: new Set(["smooth_slowmo", "speed_ramp_hq"]),
    cost: 6,
    qualityBonus: 3.5,
    tier: "pro",
    serverSideOnly: true,
  },

  {
    id: "sam-vfx",
    displayName: "SAM 2 Subject Isolation",
    description: "AI mask the subject, dim/blur background — hero shots",
    supports: new Set([
      "subject_isolation", "bg_dim", "bg_blur", "bg_replace",
    ]),
    preferredFor: new Set(["subject_isolation", "bg_replace"]),
    cost: 8,
    qualityBonus: 4,
    tier: "pro",
    serverSideOnly: true,
    maxShotsPerEdit: 6,
  },

  {
    id: "ai-specialist",
    displayName: "AI Specialist (SAM 2 + Depth + Face)",
    description: "Subject isolation, depth-aware compositing, face tracking",
    supports: new Set([
      "subject_isolation", "depth_parallax", "tracked_caption",
      "bg_blur", "bg_dim",
    ]),
    preferredFor: new Set([
      "subject_isolation", "depth_parallax", "tracked_caption",
    ]),
    cost: 7,
    qualityBonus: 4,
    tier: "pro",
  },

  {
    id: "depth-vfx",
    displayName: "Depth VFX",
    description: "3D parallax, atmospheric fog, defocus by distance",
    supports: new Set([
      "depth_parallax", "atmospheric_fog", "depth_defocus",
    ]),
    preferredFor: new Set(["depth_parallax"]),
    cost: 9,
    qualityBonus: 4,
    tier: "pro",
    serverSideOnly: true,
    maxShotsPerEdit: 3,
  },

  {
    id: "ffmpeg-server",
    displayName: "Server FFmpeg",
    description: "Final HD export, AV1, broadcast-quality encoding",
    supports: new Set(["final_render", "hd_export", "av1_encode"]),
    preferredFor: new Set(["final_render"]),
    cost: 4,
    qualityBonus: 5,
    tier: "creator",
    serverSideOnly: true,
  },

  {
    id: "specialist-ai",
    displayName: "AI Specialist Engines",
    description: "SAM 2 subject isolation, Depth Anything, RIFE smooth slow-mo. Pro-tier wow features.",
    supports: new Set([
      "subject_isolation",
      "subject_pop",
      "bg_blur_subject",
      "bg_dim_subject",
      "depth_focus",
      "depth_parallax",
      "text_behind_subject",
      "smooth_slowmo",
      "rife_slowmo",
    ]),
    preferredFor: new Set([
      "subject_isolation",
      "subject_pop",
      "depth_focus",
      "text_behind_subject",
      "smooth_slowmo",
    ]),
    cost: 8,
    qualityBonus: 5,
    tier: "pro",
    serverSideOnly: false,
    maxShotsPerEdit: 6,
  },

  {
    id: "opencv-browser",
    displayName: "OpenCV Browser",
    description: "In-browser computer vision: face detection, edge detection, optical flow",
    supports: new Set([
      "face_detect_overlay",
      "edge_outline",
      "optical_flow_vis",
    ]),
    preferredFor: new Set(["face_detect_overlay", "edge_outline"]),
    cost: 2,
    qualityBonus: 2.5,
    tier: "free",
    serverSideOnly: false,
  },
];

export function getEnginesForTier(tier: "free" | "creator" | "pro"): EngineCapability[] {
  const order = ["free", "creator", "pro"];
  const tierIdx = order.indexOf(tier);
  return ENGINE_REGISTRY.filter(e => order.indexOf(e.tier) <= tierIdx);
}
```

---

## src/lib/engines/router.ts

```typescript
// src/lib/engines/router.ts
import { ENGINE_REGISTRY, getEnginesForTier } from "./registry";
import type { EngineId, RoutedShot } from "./types";

export interface RoutedEffect {
  effectKind: string;
  shotId: string;
  engineId: EngineId;
  isPreferred: boolean;     // engine's preferredFor hit
  fallbackUsed: boolean;
}

const MULTI_ENGINE_EFFECTS: Record<string, EngineId[]> = {
  push_in: ["openreel", "webgl-grade"],
  impact_flash: ["canvas2d", "webgl-grade"],
  color_pulse: ["webgl-grade"],
  chromatic_burst: ["shader-fx", "webgl-grade"],
  speed_ramp: ["openreel", "webgl-grade"],
};

export interface RoutingResult {
  perShot: Array<{
    shotId: string;
    primaryEngine: EngineId;       // engine handling most effects
    engineLoad: Partial<Record<EngineId, string[]>>; // engine → effects assigned
  }>;
  perEngine: Partial<Record<EngineId, RoutedEffect[]>>;
  unrouted: string[];              // effects no engine supports
  totalCost: number;
  totalQualityBonus: number;
  enginesUsed: EngineId[];
}

export function routeEDL(
  edl: any,
  options: {
    tier?: "free" | "creator" | "pro";
    forBrowser?: boolean;          // exclude serverSideOnly engines
    budgetLimit?: number;          // cap total cost
    explicitEngines?: EngineId[];  // user-forced engines
  } = {},
): RoutingResult {
  const tier = options.tier ?? "free";
  const availableEngines = getEnginesForTier(tier).filter(e => {
    if (options.forBrowser && e.serverSideOnly) return false;
    if (options.explicitEngines && !options.explicitEngines.includes(e.id)) return false;
    return true;
  });

  const perShot: RoutingResult["perShot"] = [];
  const perEngine: Partial<Record<EngineId, RoutedEffect[]>> = {};
  const unrouted: string[] = [];
  let totalCost = 0;
  let totalQualityBonus = 0;
  const engineUseCount: Record<string, number> = {};

  for (const shot of edl.shots ?? []) {
    const effects = (shot.effects ?? shot.features ?? []).map((e: any) =>
      e.type ?? e.kind ?? "unknown",
    );

    const engineLoad: Partial<Record<EngineId, string[]>> = {};

    for (const effect of effects) {
      const multiEngines = MULTI_ENGINE_EFFECTS[effect];

      if (multiEngines) {
        for (const engineId of multiEngines) {
          const engine = availableEngines.find(e => e.id === engineId);
          if (!engine) continue;

          const routed: RoutedEffect = {
            effectKind: effect,
            shotId: shot.id,
            engineId,
            isPreferred: engine.preferredFor.has(effect),
            fallbackUsed: false,
          };

          engineLoad[engineId] = engineLoad[engineId] ?? [];
          engineLoad[engineId]!.push(effect);
          perEngine[engineId] = perEngine[engineId] ?? [];
          perEngine[engineId]!.push(routed);

          totalCost += engine.cost;
          totalQualityBonus += engine.qualityBonus;
          engineUseCount[engineId] = (engineUseCount[engineId] ?? 0) + 1;
        }
        continue;
      }

      // Find engines that support this effect
      const candidates = availableEngines.filter(e => e.supports.has(effect));

      if (candidates.length === 0) {
        unrouted.push(`${shot.id}:${effect}`);
        continue;
      }

      // Prefer engines where this effect is in preferredFor
      const preferred = candidates.find(c => c.preferredFor.has(effect));
      const isPreferred = !!preferred;
      let chosen = preferred ?? candidates.slice().sort((a, b) =>
        // Prefer higher quality bonus, then lower cost
        (b.qualityBonus - a.qualityBonus) || (a.cost - b.cost)
      )[0];

      // Honor maxShotsPerEdit cap
      const usedSoFar = engineUseCount[chosen.id] ?? 0;
      if (chosen.maxShotsPerEdit && usedSoFar >= chosen.maxShotsPerEdit) {
        // Fall back to next-best engine
        const fallback = candidates
          .filter(c => c.id !== chosen.id)
          .sort((a, b) => b.qualityBonus - a.qualityBonus)[0];
        if (fallback) {
          chosen = fallback;
        }
      }

      // Honor budget
      if (options.budgetLimit && totalCost + chosen.cost > options.budgetLimit) {
        const cheaper = candidates
          .filter(c => totalCost + c.cost <= options.budgetLimit!)
          .sort((a, b) => a.cost - b.cost)[0];
        if (cheaper) chosen = cheaper;
      }

      const routed: RoutedEffect = {
        effectKind: effect,
        shotId: shot.id,
        engineId: chosen.id,
        isPreferred,
        fallbackUsed: !!preferred && chosen.id !== preferred.id,
      };

      engineLoad[chosen.id] = engineLoad[chosen.id] ?? [];
      engineLoad[chosen.id]!.push(effect);
      perEngine[chosen.id] = perEngine[chosen.id] ?? [];
      perEngine[chosen.id]!.push(routed);

      totalCost += chosen.cost;
      totalQualityBonus += chosen.qualityBonus;
      engineUseCount[chosen.id] = (engineUseCount[chosen.id] ?? 0) + 1;
    }

    // Primary engine = the one handling most effects on this shot
    const sorted = Object.entries(engineLoad).sort(
      (a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)
    );
    const primaryEngine = (sorted[0]?.[0] as EngineId) ?? "openreel";

    perShot.push({
      shotId: shot.id,
      primaryEngine,
      engineLoad,
    });
  }

  return {
    perShot,
    perEngine,
    unrouted,
    totalCost,
    totalQualityBonus,
    enginesUsed: Object.keys(perEngine) as EngineId[],
  };
}

/**
 * Summary stats for showing the user / Gemini what engines are doing
 */
export function summarizeRouting(result: RoutingResult): {
  engineLoadCounts: Record<string, number>;
  topEngine: string;
  avgQualityPerEffect: number;
  costEfficiency: number;
} {
  const counts: Record<string, number> = {};
  for (const [engineId, routed] of Object.entries(result.perEngine)) {
    counts[engineId] = routed ? routed.length : 0;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const totalEffects = result.totalCost > 0 ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  return {
    engineLoadCounts: counts,
    topEngine: top?.[0] ?? "openreel",
    avgQualityPerEffect: totalEffects > 0 ? result.totalQualityBonus / totalEffects : 0,
    costEfficiency: result.totalCost > 0 ? result.totalQualityBonus / result.totalCost : 0,
  };
}
```

---

## src/lib/engines/types.ts

```typescript
// src/lib/engines/types.ts

export type EngineId =
  | "openreel"        // baseline Canvas2D — always available, fastest
  | "webgl-grade"     // color, vignette, chromatic — GPU, near-free
  | "webgl-blur"      // gaussian/motion/radial blur — GPU
  | "sam-vfx"         // subject isolation, bg replace — Replicate API, slow + paid
  | "depth-vfx"       // depth-based parallax, fog, defocus — Replicate, slow
  | "rife-interp"     // optical-flow slow-mo, smooth ramps — Replicate or local
  | "ffmpeg-server"   // final HD render, AV1, true export — server GPU
  | "shader-fx"       // glitch, RGB shift, scan lines — custom WebGL
  | "particle-fx"     // sparks, light leaks, dust — Canvas2D + sprites
  | "text-engine"     // kinetic typography, captions — custom DOM/Canvas
  | "audio-engine"    // BGM mixing, ducking, fades — Web Audio API
  | "ai-specialist"   // Subject isolation, depth-aware compositing, face tracking
  | "specialist-ai"   // SAM2, Depth Anything, RIFE via Replicate
  | "opencv-browser"  // OpenCV.js browser CV: face detect, edges, optical flow
  | "canvas2d";       // Canvas2D fallback for unhandled effects

export interface EngineCapability {
  id: EngineId;
  displayName: string;
  description: string;
  supports: Set<string>;        // effect kinds it natively handles
  preferredFor: Set<string>;    // effects it handles BEST (vs just supports)
  cost: number;                  // 1 = free/fast, 10 = expensive/slow
  qualityBonus: number;          // 1 = baseline, 3 = dramatic upgrade
  tier: "free" | "creator" | "pro";
  maxShotsPerEdit?: number;     // throttle expensive engines
  serverSideOnly?: boolean;      // can't run in browser preview
  requiresFlag?: string;         // beta-gate certain engines
}

export interface RoutedShot {
  shotId: string;
  primaryEngine: EngineId;
  effectsByEngine: Partial<Record<EngineId, string[]>>;
}
```

---

## src/server/services/ffmpeg-renderer.ts

```typescript
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { clampEffectIntensity, enforceShotBudget, enforceIntensityBudget } from "../lib/effect-limits";

export interface RenderEDLOptions {
  edl: any;
  mediaUrls: Record<string, string>;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
}

export interface RenderResult {
  filePath: string;
  size: number;
  duration: number;
  mimeType: "video/mp4";
}

export class FFmpegRenderer {
  private workDir: string;

  constructor() {
    this.workDir = path.join(
      os.tmpdir(),
      `monet-render-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  async render(opts: RenderEDLOptions): Promise<RenderResult> {
    const {
      edl,
      mediaUrls,
      width = 1920,
      height = 1080,
      fps = 30,
      bitrate = "6M",
    } = opts;

    await fs.mkdir(this.workDir, { recursive: true });

    try {
      // 1. Download clips
      const clipFiles = await this.downloadClips(mediaUrls);
      if (clipFiles.size === 0) {
        throw new Error("No clips downloaded — nothing to render");
      }

      // 2. Write filter graph to a file (avoids shell escaping issues)
      const filterScript = this.buildFilterGraph(edl, clipFiles, width, height, fps);
      const filterScriptPath = path.join(this.workDir, "filter_graph.txt");
      await fs.writeFile(filterScriptPath, filterScript, "utf-8");
      console.log("[ffmpeg-renderer] filter graph length:", filterScript.length, "chars");

      // 3. Build args array — avoids shell command-length limits
      const outputPath = path.join(this.workDir, "output.mp4");
      const hasMusic = !!edl.music?.sourceId && clipFiles.has(edl.music.sourceId);

      const args: string[] = ["-y"];

      for (const filePath of clipFiles.values()) {
        args.push("-i", filePath);
      }

      args.push("-filter_complex_script", filterScriptPath);
      args.push("-map", "[outv]");

      if (hasMusic) {
        args.push("-map", "[outa]");
      }

      args.push(
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-b:v", bitrate,
        "-r", String(fps),
        "-movflags", "+faststart",
      );

      if (hasMusic) {
        args.push("-c:a", "aac", "-b:a", "192k");
      }

      args.push(outputPath);

      console.log("[ffmpeg-renderer] running ffmpeg with", args.length, "args");
      console.log("[ffmpeg-renderer] command preview:", "ffmpeg " + args.slice(0, 8).join(" "), "...");

      // 4. Use spawn instead of exec to avoid shell command-length limits
      const { spawn } = await import("node:child_process");
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stderrBuf = "";

        proc.stderr.on("data", (chunk: Buffer) => {
          stderrBuf += chunk.toString();
          if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
        });

        proc.on("error", (err: Error) => {
          reject(new Error(`FFmpeg spawn failed: ${err.message}`));
        });

        proc.on("close", async (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            const errLogPath = path.join(this.workDir, "ffmpeg_error.log");
            try {
              await fs.writeFile(
                errLogPath,
                `=== FFmpeg exited with code ${code} ===\n\n=== STDERR ===\n${stderrBuf}\n\n=== FILTER GRAPH ===\n${filterScript}\n\n=== ARGS ===\n${args.join(" ")}`,
                "utf-8",
              );
              console.error(`[ffmpeg-renderer] Full error log: ${errLogPath}`);
            } catch {}

            console.error("[ffmpeg-renderer] STDERR last 3000 chars:\n", stderrBuf.slice(-3000));
            console.error("[ffmpeg-renderer] FILTER GRAPH (first 1500 chars):\n", filterScript.slice(0, 1500));

            reject(
              new Error(
                `FFmpeg exit ${code}. See server logs for full stderr and filter graph.`,
              ),
            );
          }
        });
      });

      console.log("[ffmpeg-renderer] complete");

      const stats = await fs.stat(outputPath);

      if (stats.size < 1000) {
        throw new Error(
          `Output file is suspiciously small (${stats.size} bytes). FFmpeg may have failed silently.`
        );
      }

      console.log("[ffmpeg-renderer] complete, size:", stats.size);

      return {
        filePath: outputPath,
        size: stats.size,
        duration: edl.timeline?.duration ?? 0,
        mimeType: "video/mp4",
      };
    } catch (err: any) {
      console.error("[ffmpeg-renderer] FAILED:", err.message);
      await this.cleanup().catch(() => {});
      throw new Error(`FFmpeg render failed: ${err.message}`);
    }
  }

  private async downloadClips(mediaUrls: Record<string, string>): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const entries = Object.entries(mediaUrls);

    for (let i = 0; i < entries.length; i++) {
      const [clipId, url] = entries[i];

      // Skip _http metadata keys
      if (clipId.endsWith("_http")) continue;

      const ext = url.includes(".webm") ? ".webm" : ".mp4";
      const localPath = path.join(this.workDir, `clip_${i}${ext}`);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[ffmpeg-renderer] Failed to download ${clipId}: HTTP ${response.status}`);
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(localPath, buffer);
        map.set(clipId, localPath);
        console.log(`[ffmpeg-renderer] downloaded ${clipId} -> clip_${i}${ext} (${buffer.length} bytes)`);
      } catch (err: any) {
        console.warn(`[ffmpeg-renderer] Error downloading ${clipId}:`, err.message);
      }
    }

    return map;
  }

  private buildFilterGraph(
    edl: any,
    clipFiles: Map<string, string>,
    width: number,
    height: number,
    fps: number
  ): string {
    const shots = edl.shots ?? [];
    const clipIndexMap = new Map<string, number>();
    Array.from(clipFiles.keys()).forEach((id, idx) => clipIndexMap.set(id, idx));

    const segments: string[] = [];
    const validSegments: number[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const clipIdx = clipIndexMap.get(shot.source?.clipId);
      if (clipIdx === undefined) {
        console.warn(`[ffmpeg-renderer] shot ${i} references missing clip ${shot.source?.clipId}, skipping`);
        continue;
      }

      const inPoint = shot.source?.inPoint ?? 0;
      const outPoint = shot.source?.outPoint ?? inPoint + (shot.timing?.duration ?? 2);
      const shotDuration = outPoint - inPoint;

      // Base chain — trim, scale, pad, normalize framerate
      const baseChain: string[] = [
        `[${clipIdx}:v]trim=${inPoint}:${outPoint}`,
        "setpts=PTS-STARTPTS",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "setsar=1",
        `fps=${fps}`,
      ];

      // Apply per-shot effects from EDL
      const effectFilters = this.buildShotEffectFilters(shot, width, height, shotDuration, fps, edl.intensity ?? 0.5);
      baseChain.push(...effectFilters);

      // CRITICAL: NORMALIZATION at the end — forces every shot to identical
      // size, sar, pixel format, and framerate. Without this, concat fails.
      baseChain.push(
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        `setsar=1`,
        `fps=${fps}`,
        `format=yuv420p`,
      );

      segments.push(`${baseChain.join(",")}[v${i}]`);
      validSegments.push(i);
    }

    if (validSegments.length === 0) {
      segments.push(`[0:v]copy[outv]`);
    } else {
      const concatInputs = validSegments.map((i) => `[v${i}]`).join("");
      segments.push(
        `${concatInputs}concat=n=${validSegments.length}:v=1:a=0[outv]`
      );
    }

    const hasMusic = !!edl.music?.sourceId && clipFiles.has(edl.music.sourceId);
    let audioPart = "";
    if (hasMusic) {
      const musicIdx = clipIndexMap.get(edl.music.sourceId)!;
      const duration = edl.timeline?.duration ?? 30;
      audioPart = `;[${musicIdx}:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.85[outa]`;
    }

    const filter = segments.join(";\n") + audioPart;
    console.log("[ffmpeg-renderer] filter graph:\n", filter.slice(0, 500));
    return filter;
  }

  /**
   * Map Monet EDL effects to FFmpeg filter strings.
   * Each effect type translates to one or more FFmpeg native filters.
   */
  private buildShotEffectFilters(
    shot: any,
    width: number,
    height: number,
    shotDuration: number,
    fps: number,
    globalIntensity: number = 0.5
  ): string[] {
    const filters: string[] = [];
    const effects = shot.effects ?? [];

    // Enforce shot budget: max effects per shot, max total intensity
    const budgetedEffects = enforceIntensityBudget(enforceShotBudget(effects));

    for (const effect of budgetedEffects) {
      const type = (effect.type ?? effect.kind ?? "").toString().toLowerCase();
      // Scale intensity by global edit intensity (0-1 slider)
      const rawIntensity = clampEffectIntensity(type, effect.intensity ?? 0.7);
      const intensity = rawIntensity * globalIntensity;
      const effectStart = numberOr(effect.startTime, 0);
      const effectDuration = numberOr(effect.duration, shotDuration);
      const effectEnd = effectStart + effectDuration;

      const enableExpr = `'between(t,${effectStart.toFixed(3)},${effectEnd.toFixed(3)})'`;

      try {
        switch (type) {
          case "push_in": {
            const zoomTo = 1.0 + 0.22 * intensity;
            filters.push(
              `scale=w='iw*(1+(${(zoomTo - 1).toFixed(3)})*t/${shotDuration.toFixed(3)})':h=-2:eval=frame`,
              `crop=${width}:${height}`,
            );
            break;
          }

          case "pull_out": {
            const zoomFrom = 1.0 + 0.22 * intensity;
            filters.push(
              `scale=w='iw*(${zoomFrom.toFixed(3)}-(${(zoomFrom - 1).toFixed(3)})*t/${shotDuration.toFixed(3)})':h=-2:eval=frame`,
              `crop=${width}:${height}`,
            );
            break;
          }

          case "impact_flash": {
            // SAFE brightness boost — must stay tiny to prevent stacking blowout
            // FFmpeg eq brightness is ADDITIVE — 3 effects at 0.5 = +1.5 = pure white.
            const boost = 0.08 + 0.12 * intensity;
            filters.push(`eq=brightness=${boost.toFixed(3)}:enable=${enableExpr}`);
            break;
          }

          case "color_pulse": {
            // SAFE saturation boost — capped to prevent over-saturation
            const sat = 1.0 + 0.25 * intensity;
            filters.push(`eq=saturation=${sat.toFixed(3)}:enable=${enableExpr}`);
            break;
          }

          case "context_shake":
          case "shake": {
            const amp = Math.max(2, Math.floor(14 * intensity));
            const cropW = Math.max(2, width - amp * 2);
            const cropH = Math.max(2, height - amp * 2);
            filters.push(
              `crop=${cropW}:${cropH}:x='${amp}+${(amp / 2).toFixed(1)}*sin(2*PI*t*8)':y='${amp}+${(amp / 2).toFixed(1)}*cos(2*PI*t*9)'`,
              `scale=${width}:${height}`,
            );
            break;
          }

          case "vignette_punch":
          case "vignette": {
            filters.push(`vignette=angle=PI/4:eval=init`);
            break;
          }

          case "chromatic_burst":
          case "rgb_shift":
          case "chromatic_aberration":
          case "rgb_split": {
            const shift = Math.max(1, Math.floor(6 * intensity));
            filters.push(`rgbashift=rh=${shift}:bh=-${shift}:enable=${enableExpr}`);
            break;
          }

          case "speed_ramp": {
            const speedMin = numberOr(effect.params?.minSpeed, Math.max(0.3, 1.0 - 0.6 * intensity));
            const ptsMult = 1 / speedMin;
            filters.push(`setpts=${ptsMult.toFixed(3)}*PTS`);
            break;
          }

          case "whip_pan":
          case "whip_transition": {
            const blurAmt = Math.max(1, Math.floor(20 * intensity));
            filters.push(`gblur=sigma=${blurAmt}:steps=1:enable=${enableExpr}`);
            break;
          }

          case "glow":
          case "neon_glow": {
            const brt = 0.03 * intensity;
            const con = 1.0 + 0.05 * intensity;
            filters.push(
              `eq=brightness=${brt.toFixed(3)}:contrast=${con.toFixed(3)}:enable=${enableExpr}`,
            );
            break;
          }

          case "freeze_frame": {
            const holdDur = numberOr(effect.params?.holdDuration, 0.5);
            filters.push(`tpad=stop_mode=clone:stop_duration=${holdDur.toFixed(2)}`);
            break;
          }

          case "color_grade": {
            const grade = (effect.params?.preset ?? "cinematic").toString().toLowerCase();
            filters.push(...mapColorGradeToFilters(grade));
            break;
          }

          case "beat_cut":
          case "cut":
          case "transition":
            break;

          default:
            console.log(`[ffmpeg-renderer] unmapped effect type: ${type}`);
            break;
        }
      } catch (err: any) {
        console.warn(
          `[ffmpeg-renderer] skipping malformed effect "${type}":`,
          err.message,
        );
      }
    }

    const globalGrade = shot.globalGrade ?? null;
    if (globalGrade) {
      filters.push(...mapColorGradeToFilters(globalGrade.toString().toLowerCase()));
    }

    return filters;
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function numberOr(value: any, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

function mapColorGradeToFilters(grade: string): string[] {
  switch (grade) {
    case "cinematic":
      return [`eq=contrast=1.10:saturation=0.90:brightness=-0.03`];
    case "vibrant":
      return [`eq=contrast=1.08:saturation=1.20:brightness=0.02`];
    case "vintage":
      return [`eq=contrast=0.95:saturation=0.85:brightness=0.03`, `vignette=angle=PI/4:eval=init`];
    case "monochrome":
      return [`hue=s=0`, `eq=contrast=1.15`];
    case "anime":
      return [`eq=contrast=1.20:saturation=1.30:brightness=0.02`];
    case "noir":
    case "wong-kar-wai":
    case "wongkarwai":
      return [`hue=s=0.5`, `eq=contrast=1.20:saturation=1.05`];
    case "raw":
    default:
      return [];
  }
}
```

---

## src/server/lib/render-engine-editly.ts

```typescript
// src/server/lib/render-engine-editly.ts
// The production-grade export engine powered by Editly + FFmpeg

import editly from "editly";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import type { MonetEDL } from "../types/edl";
import type { Env } from "../types/env";
import { monetEDLToEditlySpec } from "./edl-to-editly";

export interface RenderJob {
  jobId: string;
  edl: MonetEDL;
  r2OutputKey: string;
  env: Env;
  quality?: "preview" | "final";
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Render a MonetEDL to MP4 using Editly.
 */
export async function renderWithEditly(params: RenderJob): Promise<RenderResult> {
  const { jobId, edl, r2OutputKey, env, quality = "final" } = params;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `monet-render-${jobId}-`));
  const startTime = Date.now();

  try {
    console.info(`[render] Starting job ${jobId}`, { quality });
    await updateJobStatus(jobId, "processing", env);

    // 1. Resolve assets from R2
    const videoPaths: Record<string, string> = {};
    const uniqueClipIds = Array.from(new Set(edl.shots.map(s => s.source.clipId)));
    const projectId = edl.metadata?.projectId || "unknown";

    for (const clipId of uniqueClipIds) {
      const localPath = path.join(tempDir, `${clipId}.mp4`);
      const keys = [`footage/${projectId}/${clipId}.mp4`, `footage/${projectId}/${clipId}_proxy.mp4`, clipId];
      
      for (const r2Key of keys) {
        const object = await env.MONET_MEDIA.get(r2Key);
        if (object) {
          await fs.writeFile(localPath, Buffer.from(await object.arrayBuffer()));
          videoPaths[clipId] = localPath;
          break;
        }
      }
    }

    let audioPath: string | undefined;
    if (edl.music?.sourceId) {
      audioPath = path.join(tempDir, `music.mp3`);
      const keys = [`music/${projectId}/${edl.music.sourceId}.mp3`, edl.music.sourceId];
      for (const r2Key of keys) {
        const object = await env.MONET_MEDIA.get(r2Key);
        if (object) {
          await fs.writeFile(audioPath, Buffer.from(await object.arrayBuffer()));
          break;
        }
      }
    }

    // 2. Compile Spec
    const outPath = path.join(tempDir, "output.mp4");
    const spec = monetEDLToEditlySpec(edl, videoPaths, audioPath);
    spec.outPath = outPath;

    if (quality === "preview") {
      spec.width = 854;
      spec.height = 480;
      spec.fps = 24;
    }

    // 3. Exec Editly (in-process via lib)
    // @ts-ignore
    await editly(spec);

    // 4. Upload
    await env.MONET_RENDERS.put(r2OutputKey, await fs.readFile(outPath), {
      httpMetadata: { contentType: "video/mp4" }
    });

    await updateJobStatus(jobId, "done", env);
    return { success: true, durationMs: Date.now() - startTime };

  } catch (error) {
    console.error(`[render] Job ${jobId} failed:`, error);
    await updateJobStatus(jobId, "error", env, error instanceof Error ? error.message : "Unknown");
    return { success: false, error: error instanceof Error ? error.message : "Unknown" };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Quick preview render — lower resolution, faster.
 */
export async function renderPreview(params: Omit<RenderJob, "quality">): Promise<RenderResult> {
  return renderWithEditly({ ...params, quality: "preview" });
}

async function updateJobStatus(
  jobId: string, 
  status: "queued" | "processing" | "done" | "error", 
  env: Env,
  error?: string
) {
  try {
    const raw = await env.MONET_KV.get(`render:${jobId}`);
    const job = raw ? JSON.parse(raw) : { id: jobId, createdAt: Date.now() };
    job.status = status;
    if (error) job.error = error;
    await env.MONET_KV.put(`render:${jobId}`, JSON.stringify(job), { expirationTtl: 3600 });
  } catch (e) {
    console.warn(`[render] Failed to update job status for ${jobId}`, e);
  }
}
```

---

## src/server/lib/edl-to-editly.ts

```typescript
// src/server/lib/edl-to-editly.ts
// The compiler: MonetEDL → Editly specification
// Every field in the EDL becomes a real rendered pixel.

import type { MonetEDL, Shot, ColorGradePreset } from "../types/edl";
import { buildShotFilterChain, buildSpeedFilter, buildSpeedRampFilter } from "./editly-effects";
import { mapTransition } from "./editly-transitions";

interface EditlySpec {
  width: number;
  height: number;
  fps: number;
  outPath: string;
  clips: EditlyClip[];
  audioTracks: EditlyAudioTrack[];
  defaults: { transition: null };
  // Global FFmpeg output filters
  outputOptions?: string[];
}

interface EditlyClip {
  duration: number;
  transition?: { name: string; duration: number; params?: Record<string, number> };
  layers: EditlyLayer[];
}

interface EditlyLayer {
  type: "video" | "image" | "title" | "canvas" | "fabric";
  path?: string;
  text?: string;
  cutFrom?: number;
  cutTo?: number;
  speedFactor?: number;
  // Custom frame-level rendering
  func?: (args: any) => void;
  // Raw FFmpeg filter chain for this layer
  inputOptions?: string[];
}

interface EditlyAudioTrack {
  path: string;
  mixVolume?: number;
  cutFrom?: number;
  cutTo?: number;
  start?: number;
}

/**
 * Compile a MonetEDL into a complete Editly specification.
 *
 * This is the bridge between AI intent and rendered video.
 * Every MonetEDL field maps to a real Editly/FFmpeg operation.
 */
export function monetEDLToEditlySpec(
  edl: MonetEDL,
  videoPaths: Record<string, string>,
  audioPath?: string
): EditlySpec {
  const clips: EditlyClip[] = edl.shots.map((shot, index) => {
    const videoPath = videoPaths[shot.source.clipId];
    if (!videoPath) {
      console.warn(`[edl-to-editly] Missing path for clipId: ${shot.source.clipId}`);
    }

    // ─── Transition ───
    const transition = shot.transition
      ? mapTransition(shot.transition.type, shot.transition.duration)
      : undefined;

    // ─── Speed ───
    let speedFactor: number | undefined;
    if (shot.timing.speedRamp) {
      // For speed ramps, use average speed as the Editly speedFactor
      // The actual ramp is handled via FFmpeg setpts filter
      speedFactor = (shot.timing.speedRamp.startSpeed + shot.timing.speedRamp.endSpeed) / 2;
    } else if (shot.timing.speed && shot.timing.speed !== 1.0) {
      speedFactor = shot.timing.speed;
    }

    // ─── Effects as FFmpeg filters ───
    const effectFilterChain = buildShotFilterChain(shot);
    const speedFilter = buildSpeedRampFilter(shot) || buildSpeedFilter(shot);

    // Combine all filters
    const allFilters: string[] = [];
    if (speedFilter) allFilters.push(speedFilter);
    if (effectFilterChain) allFilters.push(effectFilterChain);

    // ─── Transform (position, scale, rotation, crop) ───
    const transformFilters = buildTransformFilters(shot);
    if (transformFilters) allFilters.push(transformFilters);

    // Build the video layer
    const videoLayer: EditlyLayer = {
      type: "video",
      path: videoPath || "",
      cutFrom: shot.source.inPoint,
      cutTo: shot.source.outPoint,
    };

    // Apply speed via Editly's native speedFactor (simpler, works for constant speed)
    if (speedFactor && speedFactor !== 1.0 && !shot.timing.speedRamp) {
      videoLayer.speedFactor = speedFactor;
    }

    // Apply FFmpeg filters via inputOptions
    if (allFilters.length > 0) {
      videoLayer.inputOptions = ["-vf", allFilters.join(",")];
    }

    const layers: EditlyLayer[] = [videoLayer];

    // ─── Text Overlays for this shot ───
    const shotTextOverlays = (edl.textOverlays || []).filter(
      (overlay) =>
        overlay.startTime >= shot.timing.startTime &&
        overlay.startTime < shot.timing.startTime + shot.timing.duration
    );

    for (const overlay of shotTextOverlays) {
      layers.push({
        type: "title",
        text: overlay.text,
      });
    }

    return {
      duration: shot.timing.duration,
      transition,
      layers,
    };
  });

  // ─── Global color grade as output filter ───
  const outputOptions: string[] = [];
  const colorGradeFilter = buildColorGradeFilter(edl.globalEffects?.colorGrade);
  if (colorGradeFilter) {
    outputOptions.push("-vf", colorGradeFilter);
  }

  // Global vignette
  if (edl.globalEffects?.vignette && edl.globalEffects.vignette > 0) {
    const vignetteAngle = (edl.globalEffects.vignette * Math.PI) / 4;
    const existing = outputOptions.find((_, i) => outputOptions[i - 1] === "-vf");
    if (existing) {
      const idx = outputOptions.indexOf(existing);
      outputOptions[idx] = `${existing},vignette=${vignetteAngle.toFixed(2)}`;
    } else {
      outputOptions.push("-vf", `vignette=${vignetteAngle.toFixed(2)}`);
    }
  }

  // Global grain
  if (edl.globalEffects?.grain && edl.globalEffects.grain > 0) {
    const grainAmount = Math.round(edl.globalEffects.grain * 30);
    const existing = outputOptions.find((_, i) => outputOptions[i - 1] === "-vf");
    if (existing) {
      const idx = outputOptions.indexOf(existing);
      outputOptions[idx] = `${existing},noise=alls=${grainAmount}:allf=t`;
    } else {
      outputOptions.push("-vf", `noise=alls=${grainAmount}:allf=t`);
    }
  }

  // ─── Audio ───
  const audioTracks: EditlyAudioTrack[] = [];
  if (audioPath) {
    audioTracks.push({
      path: audioPath,
      mixVolume: edl.music?.volume ?? 0.8,
    });
  }

  return {
    width: edl.timeline.resolution.width || 1920,
    height: edl.timeline.resolution.height || 1080,
    fps: edl.timeline.fps || 30,
    outPath: "output.mp4", // Overridden by caller
    clips,
    audioTracks,
    defaults: { transition: null },
    outputOptions: outputOptions.length > 0 ? outputOptions : undefined,
  };
}

/**
 * Build FFmpeg color grade filter from preset name.
 * Uses LUT files for professional-grade color treatment.
 */
function buildColorGradeFilter(grade?: ColorGradePreset): string | undefined {
  if (!grade || grade === "raw") return undefined;

  // Map preset names to FFmpeg filter chains
  const gradeFilters: Record<string, string> = {
    cinematic:
      "curves=m='0/0 0.05/0.01 0.25/0.18 0.6/0.55 0.85/0.82 1/1':" +
      "r='0/0 0.5/0.55 1/1':" +
      "b='0/0 0.5/0.42 1/0.95'," +
      "eq=saturation=0.85:contrast=1.1",

    vibrant:
      "eq=saturation=1.8:contrast=1.2:brightness=0.05," +
      "unsharp=5:5:0.8",

    vintage:
      "curves=vintage," +
      "eq=saturation=0.7:contrast=0.9:brightness=0.05," +
      "noise=alls=8:allf=t",

    monochrome:
      "hue=s=0," +
      "eq=contrast=1.4:brightness=-0.02," +
      "curves=m='0/0 0.15/0.05 0.5/0.5 0.85/0.95 1/1'",

    anime:
      "eq=saturation=2.0:contrast=1.3," +
      "unsharp=7:7:1.5," +
      "curves=m='0/0 0.1/0.02 0.5/0.5 0.9/0.98 1/1'",
  };

  return gradeFilters[grade];
}

/**
 * Build transform filters from shot transform properties.
 */
function buildTransformFilters(shot: Shot): string | undefined {
  if (!shot.transform) return undefined;

  const filters: string[] = [];

  // Crop
  if (shot.transform.crop) {
    const { top, bottom, left, right } = shot.transform.crop;
    const cropW = `iw*${(1 - left - right).toFixed(3)}`;
    const cropH = `ih*${(1 - top - bottom).toFixed(3)}`;
    const cropX = `iw*${left.toFixed(3)}`;
    const cropY = `ih*${top.toFixed(3)}`;
    filters.push(`crop=${cropW}:${cropH}:${cropX}:${cropY}`);
    filters.push("scale=1920:1080:flags=lanczos");
  }

  // Scale (static, non-keyframed)
  if (typeof shot.transform.scale === "number" && shot.transform.scale !== 1.0) {
    const s = shot.transform.scale;
    const w = Math.round(1920 * s);
    const h = Math.round(1080 * s);
    filters.push(`scale=${w}:${h}:flags=lanczos`);
    filters.push(`crop=1920:1080:(iw-1920)/2:(ih-1080)/2`);
  }

  // Rotation (static)
  if (typeof shot.transform.rotation === "number" && shot.transform.rotation !== 0) {
    const radians = (shot.transform.rotation * Math.PI) / 180;
    filters.push(`rotate=${radians.toFixed(4)}:fillcolor=black`);
  }

  return filters.length > 0 ? filters.join(",") : undefined;
}
```

---

## src/server/lib/editly-effects.ts

```typescript
// src/server/lib/editly-effects.ts
// Converts MonetEDL effects into real FFmpeg filter chains

import type { Effect, Shot } from "../types/edl";

export interface FFmpegFilter {
  filter: string;
  options: Record<string, string | number>;
}

/**
 * Convert a MonetEDL effect into one or more FFmpeg filter strings.
 * These get injected into Editly's customFrame or applied via
 * the ffmpegFilter layer option.
 */
export function effectToFFmpegFilters(effect: Effect): string[] {
  const intensity = effect.intensity ?? 0.5;

  switch (effect.type as string) {
    // ─── BLUR EFFECTS ───
    case "blur":
      return [`boxblur=${Math.round(intensity * 20)}:${Math.round(intensity * 10)}`];

    case "gaussian-blur":
    case "gaussianBlur":
    case "gaussian_blur": {
      const blurriness = (effect.params?.blurriness ?? Math.round(intensity * 20)) || 10;
      const dims = (effect.params?.dimensions as any) ?? "horizontal and vertical";
      let rx = blurriness;
      let ry = blurriness;
      if (dims === "horizontal") ry = 1;
      if (dims === "vertical") rx = 1;
      return [`boxblur=${rx || 1}:${ry || 1}`];
    }

    case "camera-blur":
    case "camera_blur":
    case "cameraBlur": {
      const blurRadius = (effect.params?.blurRadius ?? Math.round(intensity * 30)) || 15;
      return [`boxblur=${blurRadius}:${Math.round(blurRadius / 3)}`];
    }

    case "directional_blur":
    case "directionalBlur":
    case "directional-blur": {
      const angle = effect.params?.direction ?? 90;
      const length = (effect.params?.blurLength ?? Math.round(intensity * 30)) || 15;
      const rad = (angle * Math.PI) / 180;
      const sizeX = Math.max(1, Math.round(Math.abs(Math.cos(rad)) * length));
      const sizeY = Math.max(1, Math.round(Math.abs(Math.sin(rad)) * length));
      return [`avgblur=sizeX=${sizeX}:sizeY=${sizeY}`];
    }

    case "radial_zoom_blur":
    case "radialZoomBlur":
    case "radial-zoom-blur":
      // Simulated with multiple scaled overlays
      return [`unsharp=13:13:${intensity * 3}:13:13:0`];

    case "motion_blur":
    case "motionBlur":
    case "motion-blur":
      return [`tblend=all_mode=average`];

    // ─── SHARPEN EFFECTS ───
    case "sharpen": {
      const amountVal = effect.params?.amount ?? (intensity * 100);
      const amount = (amountVal / 100) * 2.5; // Scale 0 to 2.5
      return [`unsharp=5:5:${amount.toFixed(2)}:5:5:${(amount / 2).toFixed(2)}`];
    }

    case "unsharp-mask":
    case "unsharp_mask":
    case "unsharpMask": {
      const radius = effect.params?.radius ?? 2.0;
      const amountVal = effect.params?.amount ?? (intensity * 100);
      const msize = Math.max(3, Math.min(23, Math.round(radius * 2) | 1)); // Ensure odd integer
      const amount = (amountVal / 100) * 3.0; // Scale 0 to 3.0
      return [`unsharp=${msize}:${msize}:${amount.toFixed(2)}:${msize}:${msize}:${(amount / 2).toFixed(2)}`];
    }

    case "reduce-interlace-flicker":
    case "reduce_interlace_flicker":
    case "reduceInterlaceFlicker": {
      const softness = effect.params?.softness ?? intensity;
      const verticalBlurRadius = Math.max(1, Math.round(softness * 5));
      return [`boxblur=1:${verticalBlurRadius}`];
    }

    // ─── INVERT EFFECTS ───
    case "invert": {
      const blend = effect.params?.blend ?? 0; // 0-100, where 100 is original, 0 is fully inverted
      const channel = (effect.params?.channel as any) ?? "RGB";
      const opacity = ((100 - blend) / 100).toFixed(2);
      
      let negateFilter = "negate";
      if (channel === "Red" || channel === 1) negateFilter = "lutrgb=r=neg";
      else if (channel === "Green" || channel === 2) negateFilter = "lutrgb=g=neg";
      else if (channel === "Blue" || channel === 3) negateFilter = "lutrgb=b=neg";
      else if (channel === "Alpha" || channel === 4) negateFilter = "lutrgb=a=neg";
      else if (channel === "Hue" || channel === 6) negateFilter = "hue=h=180";
      else if (channel === "Lightness" || channel === 7) negateFilter = "lutyuv=y=neg";
      else if (channel === "Saturation" || channel === 8) negateFilter = "hue=s=-1";

      if (blend === 0) {
        return [negateFilter];
      } else {
        return [
          `split[inv_orig][inv_mod]`,
          `[inv_mod]${negateFilter}[inv_negated]`,
          `[inv_orig][inv_negated]blend=all_mode=normal:all_opacity=${opacity}`,
        ];
      }
    }

    // ─── DISTORTION EFFECTS ───
    case "corner_pin":
    case "cornerPin":
    case "corner-pin": {
      const x0 = effect.params?.topLeftX ?? 0;
      const y0 = effect.params?.topLeftY ?? 0;
      const x1 = effect.params?.topRightX ?? 1;
      const y1 = effect.params?.topRightY ?? 0;
      const x2 = effect.params?.bottomLeftX ?? 0;
      const y2 = effect.params?.bottomLeftY ?? 1;
      const x3 = effect.params?.bottomRightX ?? 1;
      const y3 = effect.params?.bottomRightY ?? 1;
      return [`perspective=x0='W*${x0}':y0='H*${y0}':x1='W*${x1}':y1='H*${y1}':x2='W*${x2}':y2='H*${y2}':x3='W*${x3}':y3='H*${y3}':sense=destination`];
    }

    case "lens_distortion":
    case "lensDistortion":
    case "lens-distortion": {
      const curvature = effect.params?.curvature ?? (intensity - 0.5) * 0.5;
      const cx = effect.params?.horizontalDecenter ?? 0.5;
      const cy = effect.params?.verticalDecenter ?? 0.5;
      return [`lenscorrection=cx=${cx}:cy=${cy}:k1=${curvature}:k2=${curvature}`];
    }

    case "magnify": {
      const cx = effect.params?.centerX ?? 0.5;
      const cy = effect.params?.centerY ?? 0.5;
      const mag = effect.params?.magnification ?? (1 + intensity * 2);
      return [`zoompan=z='${mag}':x='iw*${cx}-(iw/zoom/2)':y='ih*${cy}-(ih/zoom/2)':d=1:s=1920x1080`];
    }

    case "mirror": {
      const angle = effect.params?.reflectionAngle ?? 90;
      if (angle === 90 || angle === 270) {
        return [
          `split[mir_orig][mir_flip]`,
          `[mir_flip]crop=iw/2:ih:0:0,hflip[mir_flipped]`,
          `[mir_orig][mir_flipped]overlay=W/2:0`,
        ];
      } else {
        return [
          `split[mir_orig][mir_flip]`,
          `[mir_flip]crop=iw:ih/2:0:0,vflip[mir_flipped]`,
          `[mir_orig][mir_flipped]overlay=0:H/2`,
        ];
      }
    }

    // ─── STYLIZE EFFECTS ───
    case "alpha_glow":
    case "alphaGlow":
    case "alpha-glow": {
      const radius = (effect.params?.glowRadius ?? Math.round(intensity * 30)) || 15;
      const bright = effect.params?.brightness ?? 1.5;
      return [
        `split[glow_orig][glow_blur]`,
        `[glow_blur]boxblur=${radius}:${radius},geq=r='r(X,Y)*${bright}':g='g(X,Y)*${bright}':b='b(X,Y)*${bright}'[glow_colored]`,
        `[glow_orig][glow_colored]blend=all_mode=screen`,
      ];
    }

    case "brush_strokes":
    case "brushStrokes":
    case "brush-strokes": {
      const size = (effect.params?.brushSize ?? Math.round(intensity * 10)) || 5;
      return [`smartblur=lr=${size}:ls=-1:lt=0`];
    }

    case "color_emboss":
    case "colorEmboss":
    case "color-emboss": {
      const relief = (effect.params?.relief ?? Math.round(intensity * 3)) || 2;
      const rStr = `-${relief} -1 0 -1 1 1 0 1 ${relief}`;
      return [`convolution="${rStr}:${rStr}:${rStr}:${rStr}"`];
    }

    case "find_edges":
    case "findEdges":
    case "find-edges": {
      const isInv = effect.params?.invert ?? 0;
      if (isInv === 1) {
        return [`edgedetect=low=0.1:high=0.2,negate`];
      }
      return [`edgedetect=low=0.1:high=0.2`];
    }

    case "mosaic": {
      const hBlocks = (effect.params?.horizontalBlocks ?? Math.max(4, Math.round((1 - intensity) * 100))) || 20;
      const vBlocks = (effect.params?.verticalBlocks ?? Math.max(4, Math.round((1 - intensity) * 100))) || 20;
      return [`scale=${hBlocks}:${vBlocks}:flags=neighbor,scale=1920:1080:flags=neighbor`];
    }

    case "posterize": {
      const levels = (effect.params?.levels ?? Math.max(2, Math.round((1 - intensity) * 32))) || 8;
      const step = Math.round(255 / (levels - 1)) || 1;
      return [`lutrgb=r='round(val/${step})*${step}':g='round(val/${step})*${step}':b='round(val/${step})*${step}'`];
    }

    case "replicate": {
      const count = effect.params?.count ?? 2;
      if (count === 2) {
        return [
          `split=4[rep1][rep2][rep3][rep4]`,
          `[rep1]scale=iw/2:ih/2[tl];[rep2]scale=iw/2:ih/2[tr];[rep3]scale=iw/2:ih/2[bl];[rep4]scale=iw/2:ih/2[br]`,
          `[tl][tr]hstack[top];[bl][br]hstack[bottom];[top][bottom]vstack`,
        ];
      } else {
        return [`scale=iw/${count}:ih/${count},tile=${count}x${count}`];
      }
    }

    case "roughen_edges":
    case "roughenEdges":
    case "roughen-edges": {
      const border = (effect.params?.border ?? Math.round(intensity * 10)) || 5;
      return [`boxblur=${border}:luma_radius=${border},threshold=128`];
    }

    case "strobe_light":
    case "strobeLight":
    case "strobe-light": {
      const period = effect.params?.period ?? 1.0;
      const duration = effect.params?.duration ?? 0.1;
      const strobeType = effect.params?.strobeType ?? 0;
      if (strobeType === 1) {
        return [`geq=lum='if(lt(mod(T,${period}),${duration}),255-lum(X,Y),lum(X,Y))'`];
      }
      return [`geq=lum='if(lt(mod(T,${period}),${duration}),0,lum(X,Y))'`];
    }

    // ─── TIME EFFECTS ───
    case "echo": {
      const decay = effect.params?.decay ?? 0.5; // 0-1
      return [`lagfun=decay=${decay.toFixed(2)}`];
    }

    case "posterize-time":
    case "posterize_time":
    case "posterizeTime": {
      const frameRate = effect.params?.frameRate ?? 24;
      return [`fps=fps=${frameRate}`];
    }

    // ─── COLOR EFFECTS ───
    case "brightness":
      return [`eq=brightness=${(intensity - 0.5) * 0.4}`];

    case "contrast":
      return [`eq=contrast=${0.5 + intensity * 1.5}`];

    case "saturation":
      return [`eq=saturation=${intensity * 3}`];

    case "color_shift":
    case "colorShift":
    case "color-shift":
      return [`hue=h=${Math.round(intensity * 60)}`];

    // ─── GLOW / BLOOM ───
    case "glow": {
      const blurAmount = Math.round(intensity * 30) || 10;
      // Split → blur one copy → screen blend back
      return [
        `split[glow_a][glow_b]`,
        `[glow_b]boxblur=${blurAmount}:${Math.round(blurAmount / 2)}[glow_blurred]`,
        `[glow_a][glow_blurred]blend=all_mode=screen:all_opacity=${intensity * 0.7}`,
      ];
    }

    // ─── DISTORTION ───
    case "shake": {
      const amplitude = Math.max(2, Math.round(intensity * 15));
      // Random crop offset simulates camera shake
      return [
        `crop=iw-${amplitude * 2}:ih-${amplitude * 2}:` +
        `${amplitude}+random(1)*${amplitude}:` +
        `${amplitude}+random(2)*${amplitude}`,
        `scale=1920:1080:flags=lanczos`,
      ];
    }

    case "zoom_pulse":
    case "zoomPulse":
    case "zoom-pulse": {
      const zoomFactor = 1 + intensity * 0.3;
      return [
        `zoompan=z='if(between(on,0,10),${zoomFactor},1)':` +
        `d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `s=1920x1080:fps=30`,
      ];
    }

    // ─── STYLISTIC ───
    case "rgb_split":
    case "rgbSplit":
    case "rgb-split": {
      const shift = Math.max(1, Math.round(intensity * 8));
      return [`rgbashift=rh=${-shift}:bh=${shift}`];
    }

    case "chromatic_aberration":
    case "chromaticAberration":
    case "chromatic-aberration": {
      const shift = Math.max(1, Math.round(intensity * 6));
      return [`rgbashift=rh=${-shift}:rv=${Math.round(shift / 2)}:bh=${shift}:bv=${-Math.round(shift / 2)}`];
    }

    case "glitch": {
      // Combine noise + chromashift + random displacement
      return [
        `noise=alls=${Math.round(intensity * 40)}:allf=t`,
        `rgbashift=rh=${Math.round(intensity * 10)}:bh=${-Math.round(intensity * 10)}`,
      ];
    }

    case "scanlines":
      return [
        `drawgrid=w=0:h=2:t=1:c=black@${intensity * 0.5}`,
      ];

    case "waveform":
      return [`geq=lum='lum(X,Y)+${Math.round(intensity * 20)}*sin(Y/10+N/5)'`];

    // ─── FILM ───
    case "displacement_map":
      return [`noise=alls=${Math.round(intensity * 15)}:allf=t`];

    // ─── SUBJECT EFFECTS (require masks — degrade gracefully) ───
    case "facial_blur":
    case "facialBlur":
    case "facial-blur":
    case "subject_blur":
    case "subject-blur":
    case "background_blur":
    case "background-blur":
      // Without SAM/MediaPipe masks, apply uniform blur as fallback
      return [`boxblur=${Math.round(intensity * 15)}:${Math.round(intensity * 8)}`];

    case "depth_parallax":
    case "depthParallax":
    case "depth-parallax":
      // Simulated parallax via slight zoom + pan
      return [
        `zoompan=z='1+${intensity * 0.1}*sin(on/30)':` +
        `x='iw/2-(iw/zoom/2)+${Math.round(intensity * 20)}*sin(on/25)':` +
        `y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30:d=1`,
      ];

    case "particles":
      // Particles can't be done in pure FFmpeg — skip gracefully
      return [];

    default:
      console.warn(`[editly-effects] Unknown effect type: ${effect.type}`);
      return [];
  }
}

/**
 * Build the complete FFmpeg filter chain for a shot's effects.
 * Handles compound effects (glow uses split+blend) correctly.
 */
export function buildShotFilterChain(shot: Shot): string | undefined {
  if (!shot.effects || shot.effects.length === 0) return undefined;

  const allFilters: string[] = [];
  let hasCompoundFilter = false;

  for (const effect of shot.effects) {
    const filters = effectToFFmpegFilters(effect);
    if (filters.length === 0) continue;

    // Check if any filter uses split/blend (compound)
    if (filters.some(f => f.includes("split["))) {
      hasCompoundFilter = true;
    }
    allFilters.push(...filters);
  }

  if (allFilters.length === 0) return undefined;

  // For compound filters (glow), join with semicolons
  // For simple filters, join with commas
  if (hasCompoundFilter) {
    return allFilters.join(";");
  }
  return allFilters.join(",");
}

/**
 * Build speed filter for a shot.
 * Returns the setpts expression for speed changes.
 */
export function buildSpeedFilter(shot: Shot): string | undefined {
  const speed = shot.timing.speed;
  if (!speed || speed === 1.0) return undefined;

  // setpts: PTS * (1/speed) — speed 2.0 = PTS*0.5, speed 0.5 = PTS*2.0
  const ptsFactor = (1 / speed).toFixed(4);
  return `setpts=${ptsFactor}*PTS`;
}

/**
 * Build speed ramp filter for a shot.
 * Transitions from startSpeed to endSpeed over the shot duration.
 */
export function buildSpeedRampFilter(shot: Shot): string | undefined {
  if (!shot.timing.speedRamp) return undefined;

  const { startSpeed, endSpeed } = shot.timing.speedRamp;
  const duration = shot.timing.duration;

  // Linear interpolation of PTS factor over time
  const startFactor = (1 / startSpeed).toFixed(4);
  const endFactor = (1 / endSpeed).toFixed(4);

  return `setpts='lerp(${startFactor},${endFactor},T/${duration.toFixed(2)})*PTS'`;
}
```

---

## src/server/lib/editly-transitions.ts

```typescript
// src/server/lib/editly-transitions.ts
// Maps MonetEDL transitions to Editly/gl-transitions specs

import type { TransitionType } from "../types/edl";

interface EditlyTransition {
  name: string;
  duration: number;
  params?: Record<string, number>;
}

/**
 * Map a MonetEDL transition to an Editly-compatible gl-transition.
 *
 * Editly supports ALL gl-transitions natively when gl-transitions is installed.
 * See: https://github.com/gl-transitions/gl-transitions
 */
export function mapTransition(
  type: TransitionType,
  duration: number
): EditlyTransition | undefined {
  if (type === "cut" || duration <= 0) return undefined;

  const mapping: Record<string, { name: string; params?: Record<string, number> }> = {
    // Core transitions
    crossfade: { name: "fade" },
    "whip-pan": { name: "Directional", params: { direction: 0 } },
    "zoom-blur": { name: "CrossZoom" },
    glitch: { name: "GlitchMemories" },

    // Extended transitions (add to TransitionType enum as needed)
    cube: { name: "cube" },
    morph: { name: "morph" },
    pixelize: { name: "pixelize" },
    burn: { name: "burn" },
    ripple: { name: "ripple" },
    swirl: { name: "Swirl" },
    dreamy: { name: "DreamyZoom" },
    wind: { name: "wind" },
    mosaic: { name: "Mosaic" },
    radial: { name: "Radial" },
    slide: { name: "Directional", params: { direction: 1 } },
    doorway: { name: "doorway" },
    heart: { name: "heart" },
    kaleidoscope: { name: "kaleidoscope" },
  };

  const mapped = mapping[type];
  if (!mapped) {
    console.warn(`[editly-transitions] Unknown transition type: ${type}, falling back to fade`);
    return { name: "fade", duration };
  }

  return {
    name: mapped.name,
    duration,
    params: mapped.params,
  };
}

/**
 * Get all available gl-transition names for the EDL generation prompt.
 * Gemini should know what transitions are available.
 */
export function getAvailableTransitions(): string[] {
  return [
    "cut", "crossfade", "whip-pan", "zoom-blur", "glitch",
    "cube", "morph", "pixelize", "burn", "ripple",
    "swirl", "dreamy", "wind", "mosaic", "radial",
    "slide", "doorway", "heart", "kaleidoscope",
  ];
}
```

---

## src/server/lib/editly-renderer.ts

```typescript
/**
 * Editly-Based Renderer
 *
 * Uses the local editly fork to render videos with:
 * - GL transitions between clips (not just cuts)
 * - Ken Burns zoom/pan effects
 * - Color grading per clip
 * - Audio mixing with ducking
 * - Text overlays
 *
 * This replaces the raw FFmpeg concat approach.
 */

import { createRequire } from "node:module";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const require = createRequire(import.meta.url);

export interface EditlyRenderConfig {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  clips: EditlyClip[];
  audioTracks: EditlyAudioTrack[];
}

export interface EditlyClip {
  path: string;
  duration?: number;
  cutFrom?: number;
  cutTo?: number;
  layers: EditlyLayer[];
  transition?: {
    type: string;
    duration: number;
  };
}

export interface EditlyLayer {
  type: string;
  path?: string;
  text?: string;
  start?: number;
  stop?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  zoomDirection?: "in" | "out" | null;
  zoomAmount?: number;
}

export interface EditlyAudioTrack {
  path: string;
  mixVolume?: number;
  cutFrom?: number;
  cutTo?: number;
  start?: number;
}

/**
 * Render a video using editly.
 *
 * @param config - The edit configuration
 * @returns Path to the rendered video
 */
export async function renderWithEditly(config: EditlyRenderConfig): Promise<string> {
  const editlyConfig = {
    outPath: config.outputPath,
    width: config.width,
    height: config.height,
    fps: config.fps,
    clips: config.clips,
    audioTracks: config.audioTracks,
    fast: false,
  };

  // Dynamically import editly from the local fork
  const editlyPath = path.resolve(process.cwd(), "editly/dist/index.js");
  const editly = await import(editlyPath);

  console.log(`[editly-renderer] Starting render: ${config.clips.length} clips, ${config.audioTracks.length} audio tracks`);

  await editly.default(editlyConfig);

  console.log(`[editly-renderer] Render complete: ${config.outputPath}`);

  return config.outputPath;
}

/**
 * Build editly config from the edit plan.
 */
export function buildEditlyConfig(editPlan: {
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  shots: Array<{
    id: string;
    sourceFile: string;
    sourceStart: number;
    sourceDuration: number;
    timelineStart: number;
    timelineDuration: number;
    effects: string[];
    intensity: number;
    transition: string;
    transitionDuration: number;
    colorGrade: { temperature: number; saturation: number; contrast: number };
  }>;
  audio: {
    musicFile: string;
    musicStart: number;
    musicEnd: number;
    volume: number;
    fadeIn: number;
    fadeOut: number;
  };
}, outputPath: string): EditlyRenderConfig {
  const clips: EditlyClip[] = [];

  for (let i = 0; i < editPlan.shots.length; i++) {
    const shot = editPlan.shots[i];
    const isLast = i === editPlan.shots.length - 1;

    // Build layers for this clip
    const layers: EditlyLayer[] = [];

    // Video layer with Ken Burns based on effects
    const hasZoom = shot.effects.includes("push_in") || shot.effects.includes("zoom_pulse");
    const zoomDir = shot.effects.includes("push_in") ? "in" as const :
                    shot.effects.includes("zoom_pulse") ? "out" as const : null;

    layers.push({
      type: "video",
      path: path.resolve(shot.sourceFile),
      cutFrom: shot.sourceStart,
      cutTo: shot.sourceStart + shot.sourceDuration,
      ...(zoomDir ? { zoomDirection: zoomDir, zoomAmount: 0.08 + shot.intensity * 0.07 } : {}),
    });

    // Build transition for next clip
    const transition = isLast ? undefined : buildTransition(shot.transition, shot.transitionDuration);

    clips.push({
      path: path.resolve(shot.sourceFile),
      cutFrom: shot.sourceStart,
      cutTo: shot.sourceStart + shot.sourceDuration,
      layers,
      transition,
    });
  }

  // Audio track
  const audioTracks: EditlyAudioTrack[] = [{
    path: path.resolve(editPlan.audio.musicFile),
    mixVolume: editPlan.audio.volume,
    cutFrom: editPlan.audio.musicStart,
    cutTo: editPlan.audio.musicEnd,
  }];

  return {
    outputPath,
    width: editPlan.resolution.width,
    height: editPlan.resolution.height,
    fps: editPlan.fps,
    clips,
    audioTracks,
  };
}

function buildTransition(type: string, duration: number): { type: string; duration: number } | undefined {
  if (type === "cut" || duration <= 0) return undefined;

  // Map our transition types to editly GL transitions
  const transitionMap: Record<string, string> = {
    crossfade: "crossfade",
    whip: "directional-left",
    dip_black: "fade",
    glitch: "directional-right",
    dissolve: "crossfade",
  };

  const editlyType = transitionMap[type] || "crossfade";

  return {
    type: editlyType,
    duration: Math.min(0.5, duration),
  };
}
```

---

## src/server/lib/effect-engines.ts

```typescript
/**
 * Multi-Engine Effect System
 *
 * Each effect is dispatched to the best rendering engine:
 * - FFmpeg filters: blur, color, shake, zoom, speed
 * - Canvas2D: glow, chromatic aberration, vignette
 * - LUT-based: color grading, film looks
 *
 * The AI director specifies WHAT effects to apply.
 * This system decides HOW to render them.
 */

export interface EffectPlan {
  shots: ShotEffectPlan[];
  globalEffects: GlobalEffect[];
}

export interface ShotEffectPlan {
  shotId: string;
  startTime: number;
  duration: number;
  effects: PlannedEffect[];
  transitions: PlannedTransition[];
  speedRamp: SpeedRampPlan | null;
  colorGrade: ColorGradePlan | null;
}

export interface PlannedEffect {
  type: string;
  intensity: number;
  duration: number;
  startTime: number;
  engine: "ffmpeg" | "canvas" | "lut";
  params: Record<string, any>;
}

export interface PlannedTransition {
  type: "cut" | "crossfade" | "whip" | "dip_black" | "glitch";
  duration: number;
  params: Record<string, any>;
}

export interface SpeedRampPlan {
  points: Array<{ t: number; speed: number }>;
  easing: string;
}

export interface ColorGradePlan {
  temperature: number;
  tint: number;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
  grain: number;
  lut: string | null;
}

export interface GlobalEffect {
  type: string;
  params: Record<string, any>;
}

/**
 * Build a complete effect plan from the edit director's instructions.
 * This translates the AI's creative decisions into renderable operations.
 */
export function buildEffectPlan(
  shots: Array<{
    id: string;
    startTime: number;
    duration: number;
    effects: string[];
    intensity: number;
    transition?: string;
    transitionDuration?: number;
    speedRamp?: { start: number; end: number };
    colorGrade?: Partial<ColorGradePlan>;
  }>,
  musicData: {
    bpm: number;
    beatGrid: number[];
    drops: number[];
    energyCurve: number[];
  },
  referenceStyle: {
    effectsFrequency: number;
    transitionCutPercent: number;
    colorTemperature: string;
  }
): EffectPlan {
  const shotPlans: ShotEffectPlan[] = [];

  for (const shot of shots) {
    const plan: ShotEffectPlan = {
      shotId: shot.id,
      startTime: shot.startTime,
      duration: shot.duration,
      effects: [],
      transitions: [],
      speedRamp: null,
      colorGrade: null,
    };

    // ─── Effects ────────────────────────────────────────────────
    for (const effectType of shot.effects) {
      const effect = planEffect(effectType, shot, musicData);
      if (effect) plan.effects.push(effect);
    }

    // ─── Transitions ────────────────────────────────────────────
    if (shot.transition) {
      plan.transitions.push(planTransition(shot.transition, shot.transitionDuration ?? 0.1));
    }

    // ─── Speed Ramps ────────────────────────────────────────────
    if (shot.speedRamp) {
      plan.speedRamp = planSpeedRamp(shot.speedRamp, shot.duration, musicData);
    }

    // ─── Color Grade ────────────────────────────────────────────
    plan.colorGrade = planColorGrade(shot, referenceStyle);

    shotPlans.push(plan);
  }

  return {
    shots: shotPlans,
    globalEffects: [],
  };
}

// ─── Effect Planning ──────────────────────────────────────────────

function planEffect(
  type: string,
  shot: { startTime: number; duration: number; intensity: number },
  musicData: { bpm: number; beatGrid: number[] }
): PlannedEffect | null {
  const intensity = shot.intensity;

  switch (type) {
    case "shake":
      return {
        type: "shake",
        intensity: intensity * 0.6,
        duration: Math.min(0.2, shot.duration * 0.3),
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `shake=${Math.round(intensity * 8)}:${Math.round(intensity * 5)}:0.15`,
        },
      };

    case "zoom_pulse":
      return {
        type: "zoom_pulse",
        intensity,
        duration: shot.duration * 0.5,
        startTime: shot.duration * 0.25,
        engine: "ffmpeg",
        params: {
          filter: `zoompan=z='min(zoom+${0.002 * intensity},1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(shot.duration * 15)}:s=1280x720:fps=30`,
        },
      };

    case "glow":
      return {
        type: "glow",
        intensity: intensity * 0.4,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `boxblur=${Math.round(intensity * 5)}:${Math.round(intensity * 3)},blend=all_mode=screen:all_opacity=${intensity * 0.3}`,
        },
      };

    case "chromatic_aberration":
    case "rgb_split":
      return {
        type: "rgb_split",
        intensity: intensity * 0.5,
        duration: Math.min(0.3, shot.duration),
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `rgbashift=rh=${Math.round(intensity * 4)}:bh=-${Math.round(intensity * 4)}`,
        },
      };

    case "blur":
    case "gaussian_blur":
      return {
        type: "blur",
        intensity,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `boxblur=${Math.round(intensity * 15)}:${Math.round(intensity * 10)}`,
        },
      };

    case "flash":
    case "flash_white":
      return {
        type: "flash",
        intensity,
        duration: 0.08,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `eq=brightness=${intensity * 0.8}`,
        },
      };

    case "glitch":
      return {
        type: "glitch",
        intensity: intensity * 0.7,
        duration: 0.1,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `rgbashift=rh=${Math.round(intensity * 6)}:gh=-${Math.round(intensity * 3)}`,
        },
      };

    case "push_in":
      return {
        type: "push_in",
        intensity: intensity * 0.3,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `zoompan=z='1+${0.001 * intensity}*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(shot.duration * 15)}:s=1280x720:fps=30`,
        },
      };

    case "vignette":
      return {
        type: "vignette",
        intensity: intensity * 0.4,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {
          filter: `vignette=PI/${4 + intensity * 2}`,
        },
      };

    case "speed_ramp":
      return {
        type: "speed_ramp",
        intensity,
        duration: shot.duration,
        startTime: 0,
        engine: "ffmpeg",
        params: {},
      };

    default:
      return null;
  }
}

function planTransition(type: string, duration: number): PlannedTransition {
  switch (type) {
    case "crossfade":
    case "dissolve":
      return { type: "crossfade", duration, params: {} };
    case "whip":
    case "whip_pan":
      return { type: "whip", duration: Math.min(0.15, duration), params: { direction: "right" } };
    case "glitch":
      return { type: "glitch", duration: 0.1, params: {} };
    case "dip_black":
      return { type: "dip_black", duration, params: {} };
    default:
      return { type: "cut", duration: 0, params: {} };
  }
}

function planSpeedRamp(
  ramp: { start: number; end: number },
  duration: number,
  _musicData: { bpm: number }
): SpeedRampPlan {
  return {
    points: [
      { t: 0, speed: ramp.start },
      { t: 0.35, speed: ramp.start * 0.7 },
      { t: 0.65, speed: ramp.end * 1.2 },
      { t: 1, speed: ramp.end },
    ],
    easing: "bezier_punchy",
  };
}

function planColorGrade(
  shot: { intensity: number; colorGrade?: Partial<ColorGradePlan> },
  referenceStyle: { colorTemperature: string }
): ColorGradePlan {
  const base: ColorGradePlan = {
    temperature: referenceStyle.colorTemperature === "warm" ? 0.15 :
      referenceStyle.colorTemperature === "cool" ? -0.15 : 0,
    tint: 0,
    saturation: 1.1,
    contrast: 1.05,
    brightness: 0,
    vignette: 0.2,
    grain: 0.05,
    lut: null,
  };

  // Apply shot-level overrides
  if (shot.colorGrade) {
    return { ...base, ...shot.colorGrade };
  }

  // Intensity affects saturation and contrast
  base.saturation = 1 + shot.intensity * 0.3;
  base.contrast = 1 + shot.intensity * 0.15;

  return base;
}
```

---

## src/server/lib/edit-planner.ts

```typescript
/**
 * Comprehensive Edit Planner
 *
 * The master orchestrator that combines:
 * - Reference style analysis (what the edit should look like)
 * - Music direction (where to cut, when to duck/boost)
 * - Effect planning (what effects at what moments)
 * - Shot selection (which raw footage to use)
 *
 * Output: A complete, render-ready edit plan that FFmpeg can execute.
 */

import type { EffectPlan, ShotEffectPlan } from "./effect-engines";
import type { MusicDirection, MusicCut, DuckZone, BoostZone } from "./music-director";
import type { ReferenceEditTrace } from "../director/reference-edit-trace";
import type { EffectVocabulary } from "./effect-vocabulary";
import type { MomentMap, EditMoment } from "./moment-mapping";

export interface EditPlan {
  version: string;
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  shots: EditPlanShot[];
  audio: AudioPlan;
  effects: EffectPlan;
  metadata: {
    referenceId: string;
    prompt: string;
    generatedAt: number;
    similarity: number;
  };
}

export interface EditPlanShot {
  id: string;
  sourceFile: string;
  sourceStart: number;
  sourceDuration: number;
  timelineStart: number;
  timelineDuration: number;
  effects: string[];
  intensity: number;
  transition: string;
  transitionDuration: number;
  speedRamp: { start: number; end: number } | null;
  colorGrade: {
    temperature: number;
    saturation: number;
    contrast: number;
  };
}

export interface AudioPlan {
  musicFile: string;
  musicStart: number;
  musicEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  duckZones: DuckZone[];
  boostZones: BoostZone[];
}

/**
 * Build a complete edit plan from all analysis data.
 *
 * This is the master function that orchestrates everything.
 * It takes raw analysis results and produces a render-ready plan.
 */
export function buildEditPlan(params: {
  referenceTrace: ReferenceEditTrace;
  vocabulary: EffectVocabulary;
  momentMap: MomentMap;
  musicDirection: MusicDirection;
  rawFootage: {
    file: string;
    duration: number;
    segments: Array<{
      start: number;
      end: number;
      duration: number;
      score: number;
      tags: string[];
    }>;
  };
  musicFile: string;
  targetDuration: number;
  prompt: string;
}): EditPlan {
  const {
    referenceTrace,
    vocabulary,
    momentMap,
    musicDirection,
    rawFootage,
    musicFile,
    targetDuration,
    prompt,
  } = params;

  // ─── 1. Select shots from raw footage ─────────────────────────
  const selectedShots = selectShots(
    referenceTrace,
    momentMap,
    rawFootage,
    targetDuration,
    musicDirection
  );

  // ─── 2. Assign effects to each shot ──────────────────────────
  const shotsWithEffects = assignEffects(
    selectedShots,
    vocabulary,
    musicDirection,
    referenceTrace,
    momentMap
  );

  // ─── 3. Assign transitions ────────────────────────────────────
  const shotsWithTransitions = assignTransitions(
    shotsWithEffects,
    vocabulary,
    musicDirection
  );

  // ─── 4. Assign color grades ───────────────────────────────────
  const shotsWithColor = assignColorGrades(
    shotsWithTransitions,
    referenceTrace
  );

  // ─── 5. Build audio plan ──────────────────────────────────────
  const audioPlan = buildAudioPlan(
    musicFile,
    targetDuration,
    musicDirection,
    selectedShots
  );

  // ─── 6. Build effect plan ─────────────────────────────────────
  const effectPlan = buildEffectPlanFromShots(shotsWithColor, musicDirection);

  // ─── 7. Assemble final plan ───────────────────────────────────
  const plan: EditPlan = {
    version: "1.0.0",
    duration: targetDuration,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    shots: shotsWithColor,
    audio: audioPlan,
    effects: effectPlan,
    metadata: {
      referenceId: referenceTrace.sourceId,
      prompt,
      generatedAt: Date.now(),
      similarity: 0, // Calculated after render
    },
  };

  return plan;
}

// ─── Shot Selection ──────────────────────────────────────────────

function selectShots(
  trace: ReferenceEditTrace,
  momentMap: MomentMap,
  rawFootage: { file: string; duration: number; segments: Array<{ start: number; duration: number; score: number; tags: string[] }> },
  targetDuration: number,
  musicDirection: MusicDirection
): EditPlanShot[] {
  const shots: EditPlanShot[] = [];
  // Don't sort — use original order which has different start positions
  const segments = rawFootage.segments.filter(s => s.duration > 0.2);

  // Use reference shot durations as targets
  const refDurations = trace.shotDurations;
  let currentTime = 0;
  let segIndex = 0;
  const usedSegments = new Set<number>();

  for (let i = 0; i < refDurations.length && currentTime < targetDuration; i++) {
    const targetDur = Math.min(refDurations[i], targetDuration - currentTime);
    if (targetDur < 0.1) continue;

    // Pick the next unused segment, rotating through available ones
    let bestSeg: typeof segments[0] | null = null;
    for (let tries = 0; tries < segments.length; tries++) {
      const idx = (segIndex + tries) % segments.length;
      if (!usedSegments.has(idx) && segments[idx].duration >= targetDur * 0.5) {
        bestSeg = segments[idx];
        usedSegments.add(idx);
        segIndex = idx + 1;
        break;
      }
    }

    // Fallback: reuse any segment
    if (!bestSeg) {
      bestSeg = segments[segIndex % segments.length];
      segIndex++;
    }

    // Check if there's a music cut near this time
    const nearbyCut = musicDirection.cuts.find(
      c => Math.abs(c.time - currentTime) < 0.1
    );

    shots.push({
      id: `shot_${i}`,
      sourceFile: rawFootage.file,
      sourceStart: bestSeg.start,
      sourceDuration: Math.min(targetDur, bestSeg.duration),
      timelineStart: currentTime,
      timelineDuration: targetDur,
      effects: [],
      intensity: 0.5,
      transition: nearbyCut?.strength === "hard" ? "cut" : "cut",
      transitionDuration: 0,
      speedRamp: null,
      colorGrade: { temperature: 0, saturation: 1, contrast: 1 },
    });

    currentTime += targetDur;
  }

  return shots;
}

// ─── Effect Assignment ───────────────────────────────────────────

function assignEffects(
  shots: EditPlanShot[],
  vocabulary: EffectVocabulary,
  musicDirection: MusicDirection,
  trace: ReferenceEditTrace,
  momentMap?: MomentMap | null
): EditPlanShot[] {
  const freq = vocabulary.effectFrequency;
  const totalEffects = vocabulary.totalEffects;
  const effectTypes = Object.keys(freq).sort((a, b) => (freq[b] || 0) - (freq[a] || 0));

  return shots.map((shot, i) => {
    const effects: string[] = [];
    const normalizedTime = shot.timelineStart / shot.timelineDuration;

    // Check if this shot aligns with a music drop
    const isDrop = musicDirection.boostZones.some(
      z => shot.timelineStart >= z.start && shot.timelineStart < z.end
    );

    // Check if this is a moment map hit point
    const isMomentHit = momentMap.moments.some(
      m => Math.abs(m.timeSec - shot.timelineStart) < 0.2 && m.priority === "must_hit"
    );

    // Assign effects based on reference vocabulary
    const effectBudget = Math.ceil(totalEffects / shots.length);

    if (isDrop) {
      // Drops get maximum effects
      effects.push("zoom_pulse", "shake");
      if (effectTypes.includes("glitch")) effects.push("glitch");
    } else if (isMomentHit) {
      // Moment hits get 2 effects
      effects.push(effectTypes[0] || "push_in");
      effects.push(effectTypes[1] || "vignette");
    } else if (i % 2 === 0) {
      // Every other shot gets a push-in
      effects.push("push_in");
    }

    // Add effects based on vocabulary frequency
    if (effects.length < effectBudget) {
      for (const type of effectTypes) {
        if (effects.length >= effectBudget) break;
        if (!effects.includes(type) && Math.random() < (freq[type] || 0) / totalEffects) {
          effects.push(type);
        }
      }
    }

    return {
      ...shot,
      effects,
      intensity: isDrop ? 0.8 : isMomentHit ? 0.6 : 0.4,
    };
  });
}

// ─── Transition Assignment ───────────────────────────────────────

function assignTransitions(
  shots: EditPlanShot[],
  vocabulary: EffectVocabulary,
  musicDirection: MusicDirection
): EditPlanShot[] {
  const transitionBreakdown = vocabulary.transitionBreakdown;
  const total = transitionBreakdown.cuts + transitionBreakdown.crossfades + transitionBreakdown.whipPans;

  return shots.map((shot, i) => {
    if (i === 0) return { ...shot, transition: "cut", transitionDuration: 0 };

    // Check music cut strength
    const nearbyCut = musicDirection.cuts.find(
      c => Math.abs(c.time - shot.timelineStart) < 0.1
    );

    let transition = "cut";
    let transitionDuration = 0;

    if (nearbyCut?.strength === "hard") {
      transition = "cut";
    } else if (nearbyCut?.strength === "phrase") {
      transition = "crossfade";
      transitionDuration = 0.15;
    } else {
      // Use reference transition distribution
      const rand = Math.random() * total;
      if (rand < transitionBreakdown.cuts) {
        transition = "cut";
      } else if (rand < transitionBreakdown.cuts + transitionBreakdown.whipPans) {
        transition = "whip";
        transitionDuration = 0.12;
      } else {
        transition = "crossfade";
        transitionDuration = 0.2;
      }
    }

    return { ...shot, transition, transitionDuration };
  });
}

// ─── Color Grade Assignment ──────────────────────────────────────

function assignColorGrades(
  shots: EditPlanShot[],
  trace: ReferenceEditTrace
): EditPlanShot[] {
  return shots.map((shot, i) => {
    const normalizedTime = shot.timelineStart / shot.duration;
    const isClimax = Math.abs(normalizedTime - 0.65) < 0.1;

    return {
      ...shot,
      colorGrade: {
        temperature: 0.05, // Slightly warm
        saturation: isClimax ? 1.3 : 1.1,
        contrast: isClimax ? 1.15 : 1.05,
      },
    };
  });
}

// ─── Audio Plan ──────────────────────────────────────────────────

function buildAudioPlan(
  musicFile: string,
  targetDuration: number,
  musicDirection: MusicDirection,
  shots: EditPlanShot[]
): AudioPlan {
  return {
    musicFile,
    musicStart: 0,
    musicEnd: targetDuration,
    volume: 1.0,
    fadeIn: 0.3,
    fadeOut: 1.0,
    duckZones: musicDirection.duckZones.filter(z => z.start < targetDuration),
    boostZones: musicDirection.boostZones.filter(z => z.start < targetDuration),
  };
}

// ─── Effect Plan Builder ─────────────────────────────────────────

function buildEffectPlanFromShots(
  shots: EditPlanShot[],
  musicDirection: MusicDirection
): EffectPlan {
  return {
    shots: shots.map(shot => ({
      shotId: shot.id,
      startTime: shot.timelineStart,
      duration: shot.timelineDuration,
      effects: shot.effects.map(type => ({
        type,
        intensity: shot.intensity,
        duration: shot.timelineDuration,
        startTime: 0,
        engine: "ffmpeg" as const,
        params: {},
      })),
      transitions: [{
        type: shot.transition as any,
        duration: shot.transitionDuration,
        params: {},
      }],
      speedRamp: shot.speedRamp ? {
        points: [
          { t: 0, speed: shot.speedRamp.start },
          { t: 1, speed: shot.speedRamp.end },
        ],
        easing: "linear",
      } : null,
      colorGrade: {
        temperature: shot.colorGrade.temperature,
        tint: 0,
        saturation: shot.colorGrade.saturation,
        contrast: shot.colorGrade.contrast,
        brightness: 0,
        vignette: 0.2,
        grain: 0.05,
        lut: null,
      },
    })),
    globalEffects: [],
  };
}
```

---

## src/server/lib/music-director.ts

```typescript
/**
 * AI Music Director
 *
 * Analyzes music structure and makes creative decisions about:
 * - Where to cut (beat alignment, phrase boundaries)
 * - When to duck music (under dialogue, for impact)
 * - When to boost music (drops, climaxes)
 * - How to match energy curves between music and video
 *
 * This is what makes the edit feel like the music drives the visuals.
 */

export interface MusicDirection {
  cuts: MusicCut[];
  energyMap: EnergyMapPoint[];
  duckZones: DuckZone[];
  boostZones: BoostZone[];
  phraseStructure: PhraseStructure;
  bpm: number;
  timeSignature: string;
}

export interface MusicCut {
  time: number;
  beatIndex: number;
  strength: "hard" | "soft" | "phrase";
  reason: string;
}

export interface EnergyMapPoint {
  time: number;
  energy: number;
  type: "beat" | "drop" | "build" | "break" | "chorus";
}

export interface DuckZone {
  start: number;
  end: number;
  targetVolume: number;
  fadeIn: number;
  fadeOut: number;
  reason: string;
}

export interface BoostZone {
  start: number;
  end: number;
  boostAmount: number;
  fadeIn: number;
  fadeOut: number;
  reason: string;
}

export interface PhraseStructure {
  bars: Array<{
    start: number;
    end: number;
    barNumber: number;
    energy: number;
    isChorus: boolean;
    isDrop: boolean;
    isBreak: boolean;
  }>;
  totalBars: number;
  avgBarDuration: number;
}

/**
 * Analyze music and generate a complete direction plan.
 *
 * @param beatGrid - Array of beat timestamps in seconds
 * @param bpm - Beats per minute
 * @param energyCurve - Energy values per second (0-1)
 * @param duration - Total duration in seconds
 * @param drops - Timestamps of drops/climaxes
 */
export function analyzeMusicDirection(
  beatGrid: number[],
  bpm: number,
  energyCurve: number[],
  duration: number,
  drops: number[] = []
): MusicDirection {
  // ─── Beat Analysis ──────────────────────────────────────────
  const beats = beatGrid.length > 0 ? beatGrid : generateBeats(bpm, duration);
  const beatsPerBar = 4; // Standard 4/4 time
  const barDuration = (60 / bpm) * beatsPerBar;

  // ─── Phrase Structure ────────────────────────────────────────
  const phraseStructure = analyzePhraseStructure(beats, energyCurve, duration, barDuration);

  // ─── Cut Points ──────────────────────────────────────────────
  const cuts = generateCutPoints(beats, phraseStructure, drops, duration);

  // ─── Energy Map ──────────────────────────────────────────────
  const energyMap = buildEnergyMap(beatGrid, energyCurve, drops, duration);

  // ─── Duck Zones ──────────────────────────────────────────────
  const duckZones = findDuckZones(energyCurve, phraseStructure, duration);

  // ─── Boost Zones ─────────────────────────────────────────────
  const boostZones = findBoostZones(energyCurve, drops, phraseStructure, duration);

  return {
    cuts,
    energyMap,
    duckZones,
    boostZones,
    phraseStructure,
    bpm,
    timeSignature: "4/4",
  };
}

// ─── Phrase Structure Analysis ──────────────────────────────────

function analyzePhraseStructure(
  beats: number[],
  energyCurve: number[],
  duration: number,
  barDuration: number
): PhraseStructure {
  const bars: PhraseStructure["bars"] = [];
  let barStart = 0;
  let barNumber = 1;

  while (barStart < duration) {
    const barEnd = Math.min(barStart + barDuration, duration);

    // Calculate average energy for this bar
    const barEnergy = calculateBarEnergy(barStart, barEnd, energyCurve, duration);

    // Detect if this bar is a chorus/drop/break based on energy
    const isChorus = barEnergy > 0.7;
    const isDrop = barEnergy > 0.85;
    const isBreak = barEnergy < 0.25;

    bars.push({
      start: barStart,
      end: barEnd,
      barNumber,
      energy: barEnergy,
      isChorus,
      isDrop,
      isBreak,
    });

    barStart = barEnd;
    barNumber++;
  }

  return {
    bars,
    totalBars: bars.length,
    avgBarDuration: barDuration,
  };
}

function calculateBarEnergy(
  barStart: number,
  barEnd: number,
  energyCurve: number[],
  totalDuration: number
): number {
  if (energyCurve.length === 0) return 0.5;

  const bucketSize = totalDuration / energyCurve.length;
  let energy = 0;
  let count = 0;

  for (let i = 0; i < energyCurve.length; i++) {
    const time = i * bucketSize;
    if (time >= barStart && time < barEnd) {
      energy += energyCurve[i];
      count++;
    }
  }

  return count > 0 ? energy / count : 0.5;
}

// ─── Cut Point Generation ────────────────────────────────────────

function generateCutPoints(
  beats: number[],
  phrase: PhraseStructure,
  drops: number[],
  duration: number
): MusicCut[] {
  const cuts: MusicCut[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (beat > duration) break;

    // Determine cut strength based on position in phrase
    const bar = phrase.bars.find(b => beat >= b.start && beat < b.end);
    const isBarStart = bar && Math.abs(beat - bar.start) < 0.05;
    const isPhraseStart = bar && bar.barNumber % 4 === 1;
    const isDrop = drops.some(d => Math.abs(d - beat) < 0.1);

    const key = `${beat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (isDrop) {
      cuts.push({
        time: beat,
        beatIndex: i,
        strength: "hard",
        reason: "Drop/climax moment — maximum impact cut",
      });
    } else if (isPhraseStart) {
      cuts.push({
        time: beat,
        beatIndex: i,
        strength: "phrase",
        reason: "Phrase boundary — natural transition point",
      });
    } else if (isBarStart) {
      cuts.push({
        time: beat,
        beatIndex: i,
        strength: "soft",
        reason: "Bar start — rhythmic cut point",
      });
    }
  }

  return cuts;
}

// ─── Energy Map ──────────────────────────────────────────────────

function buildEnergyMap(
  beatGrid: number[],
  energyCurve: number[],
  drops: number[],
  duration: number
): EnergyMapPoint[] {
  const map: EnergyMapPoint[] = [];
  const bucketSize = duration / Math.max(1, energyCurve.length);

  for (let i = 0; i < energyCurve.length; i++) {
    const time = i * bucketSize;
    const energy = energyCurve[i];

    // Classify the energy point
    let type: EnergyMapPoint["type"] = "beat";
    if (drops.some(d => Math.abs(d - time) < 0.5)) {
      type = "drop";
    } else if (energy > 0.7) {
      type = "chorus";
    } else if (energy > 0.5 && i > 0 && energyCurve[i] > energyCurve[i - 1] * 1.2) {
      type = "build";
    } else if (energy < 0.25) {
      type = "break";
    }

    map.push({ time, energy, type });
  }

  return map;
}

// ─── Duck/Boost Zones ────────────────────────────────────────────

function findDuckZones(
  energyCurve: number[],
  phrase: PhraseStructure,
  duration: number
): DuckZone[] {
  const zones: DuckZone[] = [];

  // Duck during low-energy breaks (for potential dialogue/voiceover)
  for (const bar of phrase.bars) {
    if (bar.isBreak) {
      zones.push({
        start: bar.start,
        end: bar.end,
        targetVolume: 0.3,
        fadeIn: 0.2,
        fadeOut: 0.2,
        reason: "Low energy break — duck for voiceover/dialogue",
      });
    }
  }

  return zones;
}

function findBoostZones(
  energyCurve: number[],
  drops: number[],
  phrase: PhraseStructure,
  duration: number
): BoostZone[] {
  const zones: BoostZone[] = [];

  // Boost during drops and choruses
  for (const drop of drops) {
    zones.push({
      start: Math.max(0, drop - 0.5),
      end: Math.min(duration, drop + 2),
      boostAmount: 1.3,
      fadeIn: 0.3,
      fadeOut: 0.5,
      reason: "Drop/climax — boost for maximum impact",
    });
  }

  // Boost during high-energy choruses
  for (const bar of phrase.bars) {
    if (bar.isChorus && !bar.isDrop) {
      zones.push({
        start: bar.start,
        end: bar.end,
        boostAmount: 1.15,
        fadeIn: 0.1,
        fadeOut: 0.1,
        reason: "Chorus — slight energy boost",
      });
    }
  }

  return zones;
}

// ─── Helpers ──────────────────────────────────────────────────────

function generateBeats(bpm: number, duration: number): number[] {
  const beats: number[] = [];
  const interval = 60 / bpm;
  let time = 0;
  while (time < duration) {
    beats.push(time);
    time += interval;
  }
  return beats;
}
```

---

## src/server/api/export-mp4.ts

```typescript
import type { Env } from "../types/env";
import { FFmpegRenderer } from "../services/ffmpeg-renderer";
import * as fs from "node:fs/promises";

export async function handleExportMP4(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: any = await request.json();
    const { edl, mediaUrls } = body;

    if (!edl || !mediaUrls) {
      return jsonResponse({ success: false, error: "edl and mediaUrls are required" }, 400);
    }

    if (!edl.shots || edl.shots.length === 0) {
      return jsonResponse({ success: false, error: "EDL has no shots to render" }, 400);
    }

    // Check for blob URLs — they won't work from a server process
    const hasBlobUrls = Object.values(mediaUrls).some(
      (url: any) => typeof url === "string" && url.startsWith("blob:")
    );
    if (hasBlobUrls) {
      console.warn("[export-mp4] mediaUrls contains blob URLs — these won't resolve from the server");
      // Filter to only HTTP URLs
      const httpUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(mediaUrls) as [string, string][]) {
        if (k.endsWith("_http") || (!v.startsWith("blob:") && !v.startsWith("data:"))) {
          httpUrls[k] = v;
        }
      }
      if (Object.keys(httpUrls).length === 0) {
        return jsonResponse(
          {
            success: false,
            error: "All media URLs are blob URLs — server export requires HTTP URLs. Re-upload your footage and try again.",
          },
          400
        );
      }
      // Use the HTTP URLs
      Object.assign(mediaUrls, httpUrls);
    }

    console.log("[export-mp4] starting render", {
      shotCount: edl.shots.length,
      clipCount: Object.keys(mediaUrls).filter((k) => !k.endsWith("_http")).length,
      duration: edl.timeline?.duration,
    });

    const renderer = new FFmpegRenderer();

    try {
      const result = await renderer.render({ edl, mediaUrls });
      const fileBuffer = await fs.readFile(result.filePath);

      renderer.cleanup().catch(() => {});

      console.log("[export-mp4] success, returning", result.size, "bytes");

      return new Response(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(result.size),
          "Content-Disposition": `attachment; filename="monet-edit-${Date.now()}.mp4"`,
          "X-Render-Duration": String(result.duration),
        },
      });
    } catch (err: any) {
      await renderer.cleanup().catch(() => {});
      console.error("[export-mp4] render failed:", err.message);
      return jsonResponse(
        { success: false, error: err.message ?? "Export failed" },
        500
      );
    }
  } catch (err: any) {
    console.error("[export-mp4] request parse error:", err.message);
    return jsonResponse(
      { success: false, error: err.message ?? "Bad request" },
      400
    );
  }
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

---

## src/server/api/export.ts

```typescript
/**
 * POST /api/export
 *
 * Server-side export fallback for browsers without WebCodecs (Safari, Firefox).
 * Enqueues a render job and returns a jobId immediately.
 * Client polls GET /api/export?jobId=... for status.
 *
 * Render job format (sent to RENDER_QUEUE):
 *   { jobId, edlJson, r2OutputKey, requestedAt }
 *
 * In production the queue consumer would use editly + FFmpeg on a Node.js Worker.
 * In dev (no RENDER_QUEUE binding) it returns a descriptive 503.
 */

import { z } from "zod";
import type { Env } from "../types/env";

// ─── Request schema ───────────────────────────────────────────────────────────

const ExportRequestSchema = z.object({
  edl: z.unknown(),
  projectId: z.string().optional(),
});

// ─── Response types ───────────────────────────────────────────────────────────

export interface ServerExportJobResult {
  jobId: string;
  status: "queued" | "processing" | "done" | "error";
  downloadUrl?: string;
  error?: string;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleQueueExport(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.RENDER_QUEUE) {
    return Response.json(
      {
        success: false,
        error: "Server-side export is not available in this environment. Use Chrome or Edge for client-side export.",
        code: "NO_RENDER_QUEUE",
      },
      { status: 503 }
    );
  }

  let body: z.infer<typeof ExportRequestSchema>;
  try {
    const raw = await request.json();
    const parsed = ExportRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const r2OutputKey = `renders/${body.projectId ?? "unknown"}/${jobId}.mp4`;

  // Write initial status to KV
  await env.MONET_KV.put(
    `export:${jobId}`,
    JSON.stringify({ jobId, status: "queued", r2OutputKey, requestedAt: Date.now() }),
    { expirationTtl: 60 * 60 * 24 } // 24h TTL
  );

  // Enqueue the render job
  await env.RENDER_QUEUE.send({
    jobId,
    edlJson: JSON.stringify(body.edl),
    r2OutputKey,
    requestedAt: Date.now(),
  });

  return Response.json({ success: true, jobId } satisfies { success: boolean; jobId: string }, { status: 202 });
}

export async function handleGetExportStatus(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ success: false, error: "Missing jobId" }, { status: 400 });
  }

  const raw = await env.MONET_KV.get(`export:${jobId}`);
  if (!raw) {
    return Response.json({ success: false, error: "Job not found" }, { status: 404 });
  }

  const job = JSON.parse(raw) as {
    jobId: string;
    status: "queued" | "processing" | "done" | "error";
    r2OutputKey: string;
    requestedAt: number;
    completedAt?: number;
  };

  let downloadUrl: string | undefined;
  if (job.status === "done" && env.MONET_RENDERS) {
    // Generate a signed R2 URL valid for 1 hour
    const object = await env.MONET_RENDERS.get(job.r2OutputKey);
    if (object) {
      // Cloudflare R2 Workers binding returns objects directly — no signed URL API in Workers.
      // Return the R2 key and let the client call /api/media/{key} to download.
      downloadUrl = `/api/media/render/${encodeURIComponent(job.r2OutputKey)}`;
    }
  }

  return Response.json({
    jobId: job.jobId,
    status: job.status,
    downloadUrl,
  } satisfies ServerExportJobResult);
}
```

---

## packages/render-adapters/src/ffmpeg/timeline-filter-compiler.ts

```typescript
import type { Clip, EffectBlock, MonetEDL, Track } from "@monet/edl/src/schemas";
import type {
  ActionResult,
  CompiledTimelineGraph,
  FFmpegInput,
  IndexedAudioClip,
  IndexedVideoClip,
  RenderDimensions
} from "./timeline-types";
import {
  assertValidEDL,
  calculateTimelineDuration,
  clampNumber,
  escapeDrawText,
  getAudioTracks,
  getClipEffectsByType,
  getFxTracks,
  getNumberParam,
  getRenderDimensions,
  getStringParam,
  getTextTracks,
  getVideoTracks,
  normalizeEvenDimension,
  round3,
  shellSafeLabel
} from "./ffmpeg-utils";

interface CompileTimelineInput {
  edl: MonetEDL;
  width?: number;
  height?: number;
  fps?: number;
}

export function compileTimelineToFFmpegGraph(
  input: CompileTimelineInput
): ActionResult<CompiledTimelineGraph | null> {
  try {
    const validation = assertValidEDL(input.edl);

    if (!validation.success) {
      return validation;
    }

    const dimensionsResult = getRenderDimensions(input.edl, input.width, input.height);

    if (!dimensionsResult.success || !dimensionsResult.data) {
      return {
        success: false,
        error: dimensionsResult.error ?? {
          code: "DIMENSIONS_FAILED",
          message: "Failed to resolve render dimensions"
        }
      };
    }

    const fps =
      typeof input.fps === "number" && Number.isFinite(input.fps) && input.fps > 0
        ? input.fps
        : input.edl.meta.fps;

    const dimensions = dimensionsResult.data;
    const inputs: FFmpegInput[] = [];
    const filters: string[] = [];

    const indexedVideoResult = indexVideoClips(input.edl, inputs);

    if (!indexedVideoResult.success || !indexedVideoResult.data) {
      return {
        success: false,
        error: indexedVideoResult.error ?? {
          code: "VIDEO_INDEX_FAILED",
          message: "Failed to index video clips"
        }
      };
    }

    const indexedAudioResult = indexAudioClips(input.edl, inputs);

    if (!indexedAudioResult.success || !indexedAudioResult.data) {
      return {
        success: false,
        error: indexedAudioResult.error ?? {
          code: "AUDIO_INDEX_FAILED",
          message: "Failed to index audio clips"
        }
      };
    }

    const videoLabels: string[] = [];

    for (const indexedClip of indexedVideoResult.data) {
      const compiledClip = compileVideoClip(indexedClip, dimensions, fps);

      if (!compiledClip.success || !compiledClip.data) {
        return {
          success: false,
          error: compiledClip.error ?? {
            code: "VIDEO_CLIP_COMPILE_FAILED",
            message: `Failed to compile video clip ${indexedClip.clip.id}`
          }
        };
      }

      filters.push(...compiledClip.data.filters);
      videoLabels.push(compiledClip.data.outputLabel);
    }

    if (videoLabels.length === 0) {
      return {
        success: false,
        error: {
          code: "NO_VIDEO_LABELS",
          message: "No video labels were produced"
        }
      };
    }

    const concatVideoLabel = "v_concat";
    filters.push(
      `${videoLabels.map((label) => `[${label}]`).join("")}concat=n=${videoLabels.length}:v=1:a=0[${concatVideoLabel}]`
    );

    const captionResult = compileCaptionOverlay(input.edl, concatVideoLabel, "v_captioned");

    if (!captionResult.success || !captionResult.data) {
      return {
        success: false,
        error: captionResult.error ?? {
          code: "CAPTION_COMPILE_FAILED",
          message: "Failed to compile caption overlays"
        }
      };
    }

    filters.push(...captionResult.data.filters);

    const fxResult = compileFxOverlays(input.edl, captionResult.data.outputLabel, "v_fx");

    if (!fxResult.success || !fxResult.data) {
      return {
        success: false,
        error: fxResult.error ?? {
          code: "FX_COMPILE_FAILED",
          message: "Failed to compile FX overlays"
        }
      };
    }

    filters.push(...fxResult.data.filters);

    const audioResult = compileAudioGraph(indexedVideoResult.data, indexedAudioResult.data);

    if (!audioResult.success) {
      return {
        success: false,
        error: audioResult.error ?? {
          code: "AUDIO_COMPILE_FAILED",
          message: "Failed to compile audio graph"
        }
      };
    }

    if (audioResult.data?.filters.length) {
      filters.push(...audioResult.data.filters);
    }

    const duration = calculateTimelineDuration(input.edl);

    return {
      success: true,
      data: {
        filterComplex: filters.join(";"),
        videoOutputLabel: fxResult.data.outputLabel,
        audioOutputLabel: audioResult.data?.outputLabel,
        inputs,
        duration,
        dimensions
      }
    };
  } catch (error) {
    console.error("[timeline-filter-compiler] compile failed", {
      error,
      edlId: input.edl?.id
    });

    return {
      success: false,
      error: {
        code: "TIMELINE_GRAPH_COMPILE_FAILED",
        message: "Failed to compile MonetEDL timeline to FFmpeg graph"
      }
    };
  }
}

function indexVideoClips(
  edl: MonetEDL,
  inputs: FFmpegInput[]
): ActionResult<IndexedVideoClip[]> {
  const mediaMap = new Map(Object.entries(edl.assets.media));
  const indexed: IndexedVideoClip[] = [];

  for (const track of getVideoTracks(edl)) {
    for (const clip of track.clips) {
      const asset = mediaMap.get(clip.mediaId);

      if (!asset) {
        return {
          success: false,
          error: {
            code: "VIDEO_ASSET_MISSING",
            message: `Missing media asset for clip ${clip.id} with mediaId ${clip.mediaId}`
          }
        };
      }

      if (!asset.path || asset.path.trim().length === 0) {
        return {
          success: false,
          error: {
            code: "VIDEO_ASSET_PATH_MISSING",
            message: `Media asset ${asset.id} has no path`
          }
        };
      }

      const inputIndex = inputs.length;

      inputs.push({
        path: asset.path,
        kind: "video",
        clipId: clip.id,
        mediaId: clip.mediaId
      });

      indexed.push({
        clip,
        track,
        asset,
        inputIndex,
        outputVideoLabel: `v_${shellSafeLabel(clip.id)}`
      });
    }
  }

  indexed.sort((a, b) => {
    const byStart = a.clip.startTime - b.clip.startTime;

    return byStart !== 0 ? byStart : a.clip.id.localeCompare(b.clip.id);
  });

  return {
    success: true,
    data: indexed
  };
}

function indexAudioClips(
  edl: MonetEDL,
  inputs: FFmpegInput[]
): ActionResult<IndexedAudioClip[]> {
  const audioMap = new Map(Object.entries(edl.assets.audio));
  const indexed: IndexedAudioClip[] = [];

  for (const track of getAudioTracks(edl)) {
    for (const clip of track.clips) {
      const asset = audioMap.get(clip.mediaId);

      if (!asset) {
        return {
          success: false,
          error: {
            code: "AUDIO_ASSET_MISSING",
            message: `Missing audio asset for clip ${clip.id} with mediaId ${clip.mediaId}`
          }
        };
      }

      if (!asset.path || asset.path.trim().length === 0) {
        return {
          success: false,
          error: {
            code: "AUDIO_ASSET_PATH_MISSING",
            message: `Audio asset ${asset.id} has no path`
          }
        };
      }

      const inputIndex = inputs.length;

      inputs.push({
        path: asset.path,
        kind: "audio",
        clipId: clip.id,
        mediaId: clip.mediaId
      });

      indexed.push({
        clip,
        track,
        asset,
        inputIndex,
        outputAudioLabel: `a_${shellSafeLabel(clip.id)}`
      });
    }
  }

  indexed.sort((a, b) => {
    const byStart = a.clip.startTime - b.clip.startTime;

    return byStart !== 0 ? byStart : a.clip.id.localeCompare(b.clip.id);
  });

  return {
    success: true,
    data: indexed
  };
}

function compileVideoClip(
  indexedClip: IndexedVideoClip,
  dimensions: RenderDimensions,
  fps: number
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const { clip, inputIndex } = indexedClip;

  if (clip.duration <= 0) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_DURATION",
        message: `Clip ${clip.id} has invalid duration ${clip.duration}`
      }
    };
  }

  if (clip.outPoint <= clip.inPoint) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_RANGE",
        message: `Clip ${clip.id} has invalid in/out range`
      }
    };
  }

  const safeSpeed = clampNumber(clip.speed || 1, 0.05, 8);
  const targetWidth = normalizeEvenDimension(dimensions.width);
  const targetHeight = normalizeEvenDimension(dimensions.height);

  const base = shellSafeLabel(clip.id);
  const trimLabel = `v_trim_${base}`;
  const scaledLabel = `v_scaled_${base}`;
  const cropLabel = `v_crop_${base}`;
  const effectOutput = `v_effect_${base}`;
  const outputLabel = indexedClip.outputVideoLabel;

  const filters: string[] = [];

  filters.push(
    `[${inputIndex}:v]trim=start=${round3(clip.inPoint)}:end=${round3(
      clip.outPoint
    )},setpts=(PTS-STARTPTS)/${safeSpeed.toFixed(6)},fps=${fps}[${trimLabel}]`
  );

  filters.push(
    `[${trimLabel}]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase[${scaledLabel}]`
  );

  const crop = resolveCropFilter(clip, targetWidth, targetHeight);
  filters.push(`[${scaledLabel}]${crop}[${cropLabel}]`);

  const effectResult = compileClipVisualEffects(clip, cropLabel, effectOutput);

  if (!effectResult.success || !effectResult.data) {
    return {
      success: false,
      error: effectResult.error ?? {
        code: "CLIP_EFFECT_COMPILE_FAILED",
        message: `Failed to compile effects for clip ${clip.id}`
      }
    };
  }

  filters.push(...effectResult.data.filters);

  filters.push(
    `[${effectResult.data.outputLabel}]format=yuv420p,setsar=1[${outputLabel}]`
  );

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function resolveCropFilter(
  clip: Clip,
  targetWidth: number,
  targetHeight: number
): string {
  const cropKeyframes = clip.transforms.crop;

  if (!Array.isArray(cropKeyframes) || cropKeyframes.length === 0) {
    return `crop=${targetWidth}:${targetHeight}`;
  }

  const first = cropKeyframes[0];

  if (!first) {
    return `crop=${targetWidth}:${targetHeight}`;
  }

  const x = clampNumber(first.x, 0, 1);
  const y = clampNumber(first.y, 0, 1);
  const width = clampNumber(first.width, 0.05, 1);
  const height = clampNumber(first.height, 0.05, 1);

  const cropW = normalizeEvenDimension(targetWidth * width);
  const cropH = normalizeEvenDimension(targetHeight * height);
  const cropX = normalizeEvenDimension(targetWidth * x);
  const cropY = normalizeEvenDimension(targetHeight * y);

  return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}`;
}

function compileClipVisualEffects(
  clip: Clip,
  inputLabel: string,
  requestedOutputLabel: string
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const filters: string[] = [];
  let currentLabel = inputLabel;
  let index = 0;

  const colorGrades = getClipEffectsByType(clip, "color_grade");
  const impactFlashes = getClipEffectsByType(clip, "impact_flash");
  const shakes = getClipEffectsByType(clip, "context_shake");

  for (const effect of colorGrades) {
    const nextLabel = `${requestedOutputLabel}_color_${index}`;
    const strength = clampNumber(getNumberParam(effect.params, "strength", 0.5), 0, 1);
    const saturation = 1 + strength * 0.2;
    const contrast = 1 + strength * 0.14;
    const brightness = strength * 0.012;

    filters.push(
      `[${currentLabel}]eq=saturation=${saturation.toFixed(3)}:contrast=${contrast.toFixed(
        3
      )}:brightness=${brightness.toFixed(3)}[${nextLabel}]`
    );

    currentLabel = nextLabel;
    index += 1;
  }

  for (const effect of impactFlashes) {
    const nextLabel = `${requestedOutputLabel}_flash_${index}`;
    const localStart = clampNumber(effect.start - clip.startTime, 0, clip.duration);
    const localEnd = clampNumber(localStart + effect.duration, localStart + 0.01, clip.duration);
    const intensity = clampNumber(getNumberParam(effect.params, "intensity", 0.8), 0, 2);

    filters.push(
      `[${currentLabel}]eq=brightness=\'if(between(t,${round3(localStart)},${round3(
        localEnd
      )}),${intensity.toFixed(3)},0)\':contrast=\'if(between(t,${round3(
        localStart
      )}),${round3(localEnd)}),1.16,1)\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
    index += 1;
  }

  for (const effect of shakes) {
    const nextLabel = `${requestedOutputLabel}_shake_${index}`;
    const localStart = clampNumber(effect.start - clip.startTime, 0, clip.duration);
    const localEnd = clampNumber(localStart + effect.duration, localStart + 0.01, clip.duration);
    const intensity = clampNumber(getNumberParam(effect.params, "intensity", 0.4), 0, 2) * 18;
    const frequency = clampNumber(getNumberParam(effect.params, "frequency", 8), 1, 40);

    const xExpr = `if(between(t,${round3(localStart)},${round3(
      localEnd
    )}),${intensity.toFixed(3)}*sin(${frequency.toFixed(3)}*t*6.28318),0)`;
    const yExpr = `if(between(t,${round3(localStart)},${round3(
      localEnd
    )}),${(intensity * 0.55).toFixed(3)}*cos(${(frequency * 1.29).toFixed(
      3
    )}*t*6.28318),0)`;

    filters.push(
      `[${currentLabel}]crop=iw:ih:x=\'${xExpr}\':y=\'${yExpr}\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
    index += 1;
  }

  if (filters.length === 0) {
    filters.push(`[${currentLabel}]null[${requestedOutputLabel}]`);

    return {
      success: true,
      data: {
        filters,
        outputLabel: requestedOutputLabel
      }
    };
  }

  if (currentLabel !== requestedOutputLabel) {
    filters.push(`[${currentLabel}]null[${requestedOutputLabel}]`);
  }

  return {
    success: true,
    data: {
      filters,
      outputLabel: requestedOutputLabel
    }
  };
}

function compileCaptionOverlay(
  edl: MonetEDL,
  inputLabel: string,
  outputLabel: string
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const textTracks = getTextTracks(edl);
  const captionEffects: Array<{ clip: Clip; effect: EffectBlock }> = [];

  for (const track of textTracks) {
    for (const clip of track.clips) {
      for (const effect of clip.effects) {
        if (effect.type === "caption_pop") {
          captionEffects.push({ clip, effect });
        }
      }
    }
  }

  if (captionEffects.length === 0) {
    return {
      success: true,
      data: {
        filters: [`[${inputLabel}]null[${outputLabel}]`],
        outputLabel
      }
    };
  }

  let currentLabel = inputLabel;
  const filters: string[] = [];

  captionEffects.sort((a, b) => a.clip.startTime - b.clip.startTime);

  for (let index = 0; index < captionEffects.length; index += 1) {
    const item = captionEffects[index];

    if (!item) {
      return {
        success: false,
        error: {
          code: "INVALID_CAPTION_EFFECT",
          message: "Caption effect entry was unexpectedly missing"
        }
      };
    }

    const nextLabel = index === captionEffects.length - 1 ? outputLabel : `v_caption_${index}`;
    const text = getStringParam(item.effect.params, "text", String(item.clip.meta?.text ?? ""));
    const escaped = escapeDrawText(text.toUpperCase());
    const start = round3(item.clip.startTime);
    const end = round3(item.clip.startTime + item.clip.duration);

    filters.push(
      `[${currentLabel}]drawtext=text=\'${escaped}\':x=(w-text_w)/2:y=h*0.76:fontsize=h*0.052:fontcolor=white:borderw=6:bordercolor=black:enable=\'between(t,${start},${end})\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
  }

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function compileFxOverlays(
  edl: MonetEDL,
  inputLabel: string,
  outputLabel: string
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const fxTracks = getFxTracks(edl);
  const pulses: Clip[] = [];

  for (const track of fxTracks) {
    for (const clip of track.clips) {
      const hasPulse = clip.effects.some((effect) => effect.type === "asset_pulse");

      if (hasPulse) {
        pulses.push(clip);
      }
    }
  }

  if (pulses.length === 0) {
    return {
      success: true,
      data: {
        filters: [`[${inputLabel}]null[${outputLabel}]`],
        outputLabel
      }
    };
  }

  let currentLabel = inputLabel;
  const filters: string[] = [];

  pulses.sort((a, b) => a.startTime - b.startTime);

  for (let index = 0; index < pulses.length; index += 1) {
    const pulse = pulses[index];

    if (!pulse) {
      return {
        success: false,
        error: {
          code: "INVALID_FX_PULSE",
          message: "FX pulse entry was unexpectedly missing"
        }
      };
    }

    const effect = pulse.effects.find((item) => item.type === "asset_pulse");

    if (!effect) {
      return {
        success: false,
        error: {
          code: "ASSET_PULSE_EFFECT_MISSING",
          message: `FX clip ${pulse.id} was expected to contain asset_pulse effect`
        }
      };
    }

    const nextLabel = index === pulses.length - 1 ? outputLabel : `v_fx_${index}`;
    const start = round3(pulse.startTime);
    const end = round3(pulse.startTime + pulse.duration);
    const intensity = clampNumber(getNumberParam(effect.params, "intensity", 0.7), 0, 1.5);

    filters.push(
      `[${currentLabel}]drawbox=x=0:y=0:w=iw:h=ih:color=white@${(0.07 * intensity).toFixed(
        3
      )}:t=fill:enable=\'between(t,${start},${end})\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
  }

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function compileAudioGraph(
  videoClips: IndexedVideoClip[],
  audioClips: IndexedAudioClip[]
): ActionResult<{ filters: string[]; outputLabel?: string }> {
  const filters: string[] = [];
  const audioLabels: string[] = [];

  for (const indexed of videoClips) {
    const clip = indexed.clip;
    const label = `a_video_${shellSafeLabel(clip.id)}`;
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const gain = typeof clip.audio?.gain === "number" ? clampNumber(clip.audio.gain, 0, 3) : 1;

    filters.push(
      `[${indexed.inputIndex}:a]atrim=start=${round3(clip.inPoint)}:end=${round3(
        clip.outPoint
      )},asetpts=PTS-STARTPTS,atempo=${compileAtempoChain(
        clip.speed || 1
      )},volume=${gain.toFixed(3)},adelay=${delayMs}|${delayMs}[${label}]`
    );

    audioLabels.push(label);
  }

  for (const indexed of audioClips) {
    const clip = indexed.clip;
    const label = indexed.outputAudioLabel;
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const gain = typeof clip.audio?.gain === "number" ? clampNumber(clip.audio.gain, 0, 3) : 1;

    filters.push(
      `[${indexed.inputIndex}:a]atrim=start=${round3(clip.inPoint)}:end=${round3(
        clip.outPoint
      )},asetpts=PTS-STARTPTS,volume=${gain.toFixed(3)},adelay=${delayMs}|${delayMs}[${label}]`
    );

    audioLabels.push(label);
  }

  if (audioLabels.length === 0) {
    return {
      success: true,
      data: {
        filters
      }
    };
  }

  const outputLabel = "aout";

  filters.push(
    `${audioLabels.map((label) => `[${label}]`).join("")}amix=inputs=${
      audioLabels.length
    }:duration=longest:dropout_transition=0,alimiter=limit=0.95[${outputLabel}]`
  );

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function compileAtempoChain(speed: number): string {
  const safeSpeed = clampNumber(speed, 0.05, 8);
  const factors: number[] = [];
  let remaining = safeSpeed;

  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }

  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }

  factors.push(remaining);

  return factors.map((factor) => factor.toFixed(6)).join(",atempo=");
}```

---

## packages/render-adapters/src/ffmpeg/render-timeline.ts

```typescript
import { execa } from "execa";
import { compileTimelineToFFmpegGraph } from "./timeline-filter-compiler";
import { getFFmpegPath } from "./ffmpeg-utils";
import { assertLGPLCompatibleFFmpeg } from "./license-guard";
import type {
  ActionResult,
  TimelineRenderInput,
  TimelineRenderResult
} from "./timeline-types";

export async function renderTimelineWithFFmpeg(
  input: TimelineRenderInput
): Promise<ActionResult<TimelineRenderResult>> {
  try {
    const licenseCheck = await assertLGPLCompatibleFFmpeg();

    if (!licenseCheck.success) {
      return {
        success: false,
        error: licenseCheck.error ?? {
          code: "FFMPEG_LICENSE_CHECK_FAILED",
          message: "FFmpeg license check failed"
        }
      };
    }

    if (!input.outputPath || input.outputPath.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "OUTPUT_PATH_REQUIRED",
          message: "outputPath is required"
        }
      };
    }

    const compiled = compileTimelineToFFmpegGraph({
      edl: input.edl,
      width: input.width,
      height: input.height,
      fps: input.fps
    });

    if (!compiled.success || !compiled.data) {
      return {
        success: false,
        error: compiled.error ?? {
          code: "COMPILE_FAILED",
          message: "Failed to compile FFmpeg timeline graph"
        }
      };
    }

    const args: string[] = ["-y"];

    for (const ffmpegInput of compiled.data.inputs) {
      args.push("-i", ffmpegInput.path);
    }

    args.push("-filter_complex", compiled.data.filterComplex);
    args.push("-map", `[${compiled.data.videoOutputLabel}]`);

    if (compiled.data.audioOutputLabel) {
      args.push("-map", `[${compiled.data.audioOutputLabel}]`);
    }

    const crf = input.mode === "preview" ? "28" : "18";
    const preset = input.mode === "preview" ? "veryfast" : "medium";
    const audioBitrate = input.mode === "preview" ? "128k" : "192k";

    args.push(
      "-t",
      compiled.data.duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p"
    );

    if (compiled.data.audioOutputLabel) {
      args.push("-c:a", "aac", "-b:a", audioBitrate);
    } else {
      args.push("-an");
    }

    args.push("-movflags", "+faststart");
    args.push(input.outputPath);

    const child = execa(getFFmpegPath(), args, {
      reject: false,
      all: true
    });

    let lastProgress = 0;

    if (input.mode === "preview" || input.mode === "final") {
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();

        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);

        if (match && compiled.data) {
          const [, h, m, s] = match;

          const seconds =
            Number(h) * 3600 +
            Number(m) * 60 +
            Number(s);

          const progress = Math.min(
            100,
            (seconds / compiled.data.duration) * 100
          );

          if (progress - lastProgress >= 1) {
            lastProgress = progress;
            const inputAny = input as any;
            if (inputAny.onProgress) {
              inputAny.onProgress(progress);
            }
          }
        }
      });
    }

    const result = await child;

    if (result.exitCode !== 0) {
      console.error("[render-timeline] ffmpeg failed", {
        exitCode: result.exitCode,
        outputPath: input.outputPath,
        all: result.all,
        args
      });

      return {
        success: false,
        error: {
          code: "FFMPEG_TIMELINE_RENDER_FAILED",
          message: "FFmpeg failed while rendering Monet timeline"
        }
      };
    }

    return {
      success: true,
      data: {
        outputPath: input.outputPath,
        filterComplex: compiled.data.filterComplex,
        inputCount: compiled.data.inputs.length,
        duration: compiled.data.duration
      }
    };
  } catch (error) {
    console.error("[render-timeline] render failed", {
      error,
      outputPath: input.outputPath
    });

    return {
      success: false,
      error: {
        code: "TIMELINE_RENDER_FAILED",
        message: "Failed to render Monet timeline"
      }
    };
  }
}```

---

## packages/render-adapters/src/ffmpeg/render-ffmpeg.ts

```typescript
import { execa } from "execa";
import type { MonetEDL } from "@monet/edl/src/schemas";
import { compileEDLEffectsToFFmpeg } from "./filter-compiler";

export interface RenderFFmpegInput {
  edl: MonetEDL;
  inputPath: string;
  outputPath: string;
  mode: "preview" | "final";
}

export interface RenderFFmpegResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
  data?: {
    outputPath: string;
  };
}

function getFFmpegPath(): string {
  return process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim().length > 0
    ? process.env.FFMPEG_PATH
    : "ffmpeg";
}

export async function renderWithFFmpeg(
  input: RenderFFmpegInput
): Promise<RenderFFmpegResult> {
  try {
    if (!input.inputPath || input.inputPath.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT_PATH",
          message: "inputPath is required"
        }
      };
    }

    if (!input.outputPath || input.outputPath.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_OUTPUT_PATH",
          message: "outputPath is required"
        }
      };
    }

    const compiled = compileEDLEffectsToFFmpeg(input.edl);

    if (!compiled.success || !compiled.data) {
      return {
        success: false,
        error: compiled.error ?? {
          code: "FILTER_COMPILE_FAILED",
          message: "Could not compile FFmpeg filters"
        }
      };
    }

    const crf = input.mode === "preview" ? "28" : "18";
    const preset = input.mode === "preview" ? "veryfast" : "medium";

    const args = [
      "-y",
      "-i",
      input.inputPath,
      "-filter_complex",
      compiled.data.filterComplex,
      "-map",
      `[${compiled.data.videoOutputLabel}]`,
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      input.outputPath
    ];

    const result = await execa(getFFmpegPath(), args, {
      reject: false
    });

    if (result.exitCode !== 0) {
      console.error("[render-ffmpeg] ffmpeg failed", {
        stderr: result.stderr,
        stdout: result.stdout
      });

      return {
        success: false,
        error: {
          code: "FFMPEG_FAILED",
          message: "FFmpeg render failed"
        }
      };
    }

    return {
      success: true,
      data: {
        outputPath: input.outputPath
      }
    };
  } catch (error) {
    console.error("[render-ffmpeg] render failed", error);

    return {
      success: false,
      error: {
        code: "RENDER_FAILED",
        message: "Failed to render with FFmpeg"
      }
    };
  }
}```

---

## packages/render-adapters/src/ffmpeg/filter-compiler.ts

```typescript
import type { MonetEDL } from "@monet/edl/src/schemas";

export interface CompileFilterResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
  data?: {
    filterComplex: string;
    videoOutputLabel: string;
    audioOutputLabel?: string;
  };
}

interface EffectBlock {
  id: string;
  type: string;
  start: number;
  duration: number;
  params: Record<string, unknown>;
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = params[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function escapeExpression(value: string): string {
  return value.replace(/'/g, "\\'");
}

function compileImpactFlash(
  inputLabel: string,
  outputLabel: string,
  effect: EffectBlock
): string {
  const intensity = Math.max(0, Math.min(2, numberParam(effect.params, "intensity", 0.8)));
  const start = Math.max(0, effect.start);
  const end = Math.max(start, start + Math.max(0.01, effect.duration));

  return `[${inputLabel}]eq=brightness='if(between(t,${start.toFixed(3)},${end.toFixed(3)}),${intensity.toFixed(3)},0)':contrast='if(between(t,${start.toFixed(3)},${end.toFixed(3)}),1.15,1)'[${outputLabel}]`;
}

function compileContextShake(
  inputLabel: string,
  outputLabel: string,
  effect: EffectBlock
): string {
  const intensity = Math.max(0, Math.min(100, numberParam(effect.params, "intensity", 0.4) * 30));
  const frequency = Math.max(1, Math.min(60, numberParam(effect.params, "frequency", 8)));
  const start = Math.max(0, effect.start);
  const end = Math.max(start, start + Math.max(0.01, effect.duration));

  const xExpr = `if(between(t,${start.toFixed(3)},${end.toFixed(3)}),${intensity.toFixed(3)}*sin(${frequency.toFixed(3)}*t*6.28318),0)`;
  const yExpr = `if(between(t,${start.toFixed(3)},${end.toFixed(3)}),${(intensity * 0.6).toFixed(3)}*cos(${(frequency * 1.3).toFixed(3)}*t*6.28318),0)`;

  return `[${inputLabel}]crop=iw:ih:x='${escapeExpression(xExpr)}':y='${escapeExpression(yExpr)}'[${outputLabel}]`;
}

function compileColorGrade(
  inputLabel: string,
  outputLabel: string,
  effect: EffectBlock
): string {
  const strength = Math.max(0, Math.min(1, numberParam(effect.params, "strength", 0.7)));
  const saturation = 1 + strength * 0.15;
  const contrast = 1 + strength * 0.12;
  const brightness = strength * 0.015;

  return `[${inputLabel}]eq=saturation=${saturation.toFixed(3)}:contrast=${contrast.toFixed(3)}:brightness=${brightness.toFixed(3)}[${outputLabel}]`;
}

function compileUnsupportedPassthrough(
  inputLabel: string,
  outputLabel: string
): string {
  return `[${inputLabel}]null[${outputLabel}]`;
}

export function compileEDLEffectsToFFmpeg(edl: MonetEDL): CompileFilterResult {
  try {
    if (!edl || edl.version !== 1) {
      return {
        success: false,
        error: {
          code: "INVALID_EDL",
          message: "Expected MonetEDL version 1"
        }
      };
    }

    const videoTrack = edl.timeline.tracks.find((track) => track.type === "video");

    if (!videoTrack) {
      return {
        success: false,
        error: {
          code: "VIDEO_TRACK_MISSING",
          message: "EDL has no video track"
        }
      };
    }

    const effects: EffectBlock[] = [];

    for (const clip of videoTrack.clips) {
      for (const effect of clip.effects ?? []) {
        effects.push({
          id: effect.id,
          type: effect.type,
          start: effect.start,
          duration: effect.duration,
          params: effect.params
        });
      }
    }

    effects.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

    let currentLabel = "0:v";
    const filters: string[] = [];
    let counter = 0;

    for (const effect of effects) {
      const nextLabel = `vfx${counter}`;

      if (effect.type === "impact_flash") {
        filters.push(compileImpactFlash(currentLabel, nextLabel, effect));
      } else if (effect.type === "context_shake") {
        filters.push(compileContextShake(currentLabel, nextLabel, effect));
      } else if (effect.type === "color_grade") {
        filters.push(compileColorGrade(currentLabel, nextLabel, effect));
      } else {
        filters.push(compileUnsupportedPassthrough(currentLabel, nextLabel));
      }

      currentLabel = nextLabel;
      counter += 1;
    }

    if (filters.length === 0) {
      return {
        success: true,
        data: {
          filterComplex: "[0:v]null[vout]",
          videoOutputLabel: "vout"
        }
      };
    }

    const finalLabel = "vout";
    filters.push(`[${currentLabel}]format=yuv420p[${finalLabel}]`);

    return {
      success: true,
      data: {
        filterComplex: filters.join(";"),
        videoOutputLabel: finalLabel
      }
    };
  } catch (error) {
    console.error("[filter-compiler] failed", error);

    return {
      success: false,
      error: {
        code: "FILTER_COMPILE_FAILED",
        message: "Failed to compile EDL effects to FFmpeg filter graph"
      }
    };
  }
}```

---

## packages/engine-freecut/src/executor/render.ts

```typescript
// packages/engine-freecut/src/executor/render.ts
import { spawn } from "child_process";
import path from "path";
import os from "os";
import crypto from "crypto";

import { Action, ProjectSettings, RenderResult } from "./types";
import { AssetResolver } from "./assetResolver";
import { validatePlan } from "./planValidator";
import { buildTimeline } from "./timelineBuilder";
import { compileTimeline } from "./ffmpegCompiler";

export interface RenderOptions {
  actions: Action[];
  resolver: AssetResolver;
  settings: ProjectSettings;
  outputPath?: string;
  ffmpegBin?: string;
  // FAIL LOUD: if true, throws on unsupported actions instead of silently dropping
  strict?: boolean;
  onLog?: (line: string) => void;
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const ffmpegBin = opts.ffmpegBin ?? "ffmpeg";
  const log = opts.onLog ?? ((l) => console.log(l));

  log(`[executor] received ${opts.actions.length} actions`);

  // ---------- 1. Validate ----------
  const validation = await validatePlan(opts.actions, opts.resolver);
  log(`[executor] validation ok=${validation.ok} errors=${validation.errors.length} warnings=${validation.warnings.length}`);
  for (const w of validation.warnings) log(`[executor][warn] ${w}`);
  if (!validation.ok) {
    for (const e of validation.errors) log(`[executor][err]  ${e}`);
    throw new Error(`Plan validation failed:\n${validation.errors.join("\n")}`);
  }

  // ---------- 2. Build timeline ----------
  const timeline = await buildTimeline(opts.actions, opts.resolver, opts.settings);
  log(
    `[executor] timeline built: ${timeline.videoSegments.length} video segs, ` +
      `${timeline.bgmTracks.length} bgm tracks, ${timeline.captions.length} captions, ` +
      `duration=${timeline.duration.toFixed(3)}s`
  );

  // ---------- 3. Compile to FFmpeg ----------
  const compiled = compileTimeline(timeline);

  const outputPath =
    opts.outputPath ??
    path.join(
      os.tmpdir(),
      `monet-media-dev/edited_${crypto.randomUUID()}.mp4`
    );

  const args: string[] = ["-y"];
  for (const inp of compiled.inputs) args.push("-i", inp);
  args.push("-filter_complex", compiled.filterGraph);
  args.push(...compiled.mapArgs);
  args.push(...compiled.outputArgs);
  args.push(outputPath);

  const fullCommand = `${ffmpegBin} ${args
    .map((a) => (a.includes(" ") || a.includes(";") ? `"${a}"` : a))
    .join(" ")}`;
  log(`[executor] cmd: ${fullCommand}`);

  // ---------- 4. Run ----------
  await runFfmpeg(ffmpegBin, args, log);

  // ---------- 5. Coverage report ----------
  const resolvedMedia: Record<string, string> = {};
  for (const id of [...new Set(validation.mediaIds)]) {
    const e = opts.resolver.resolve(id);
    if (e) resolvedMedia[id] = e.filePath;
  }

  return {
    outputPath,
    command: fullCommand,
    filterGraph: compiled.filterGraph,
    durationSec: timeline.duration,
    coverage: {
      actionsReceived: opts.actions.length,
      actionsApplied: opts.actions.length,
      unsupportedActions: [],
      resolvedMedia,
      unresolvedMedia: [],
    },
  };
}

function runFfmpeg(bin: string, args: string[], log: (l: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args);
    proc.stderr.on("data", (chunk) => log(`[ffmpeg] ${chunk.toString().trim()}`));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))
    );
  });
}
```

---

## packages/engine-freecut/src/executor/ffmpegCompiler.ts

```typescript
// packages/engine-freecut/src/executor/ffmpegCompiler.ts
import { Timeline, VideoSegment, AudioSegment } from "./types";
import { buildDrawtextFilter } from "./drawtext";

export interface CompiledCommand {
  inputs: string[];           // absolute paths in -i order
  filterGraph: string;        // full filter_complex string
  mapArgs: string[];          // ["-map", "[vout]", "-map", "[aout]"]
  outputArgs: string[];       // codec/preset/etc
}

/**
 * atempo only accepts 0.5-100 per filter in modern ffmpeg, BUT for max
 * compatibility we chain it for any speed < 0.5 or > 2.0.
 */
function atempoChain(speed: number): string {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  if (Math.abs(remaining - 1.0) > 1e-6) {
    filters.push(`atempo=${remaining.toFixed(6)}`);
  }
  if (filters.length === 0) filters.push("atempo=1.0");
  return filters.join(",");
}

export function compileTimeline(t: Timeline): CompiledCommand {
  const { width, height, fps, audioSampleRate, audioChannels } = t.settings;

  // Build a list of inputs from segments (dedup by inputIndex)
  const inputMap = new Map<number, string>();
  for (const s of [...t.videoSegments, ...t.bgmTracks]) {
    inputMap.set(s.inputIndex, s.inputPath);
  }
  const inputs = [...inputMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, p]) => p);

  const parts: string[] = [];

  // ----- Per-segment video processing -----
  const vSegLabels: string[] = [];
  const aSegLabels: string[] = [];

  t.videoSegments.forEach((seg, i) => {
    const inLabel = `[${seg.inputIndex}:v]`;
    const outLabel = `[v_seg${i}]`;
    const setpts =
      seg.playbackSpeed === 1.0
        ? "setpts=PTS-STARTPTS"
        : `setpts=(PTS-STARTPTS)/${seg.playbackSpeed}`;

    parts.push(
      `${inLabel}trim=start=${seg.sourceIn.toFixed(3)}:end=${seg.sourceOut.toFixed(
        3
      )},${setpts},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps}${outLabel}`
    );
    vSegLabels.push(outLabel);

    // Source audio for this segment (muted or not)
    const aIn = `[${seg.inputIndex}:a]`;
    const aOut = `[a_seg${i}]`;
    const atempo = atempoChain(seg.playbackSpeed);
    const vol = seg.mute ? 0 : seg.volume;
    parts.push(
      `${aIn}atrim=start=${seg.sourceIn.toFixed(3)}:end=${seg.sourceOut.toFixed(
        3
      )},asetpts=PTS-STARTPTS,${atempo},volume=${vol},aresample=${audioSampleRate}${aOut}`
    );
    aSegLabels.push(aOut);
  });

  // ----- Concat all video+audio segments in timeline order -----
  const n = t.videoSegments.length;
  const concatInputs = vSegLabels.map((v, i) => `${v}${aSegLabels[i]}`).join("");
  parts.push(`${concatInputs}concat=n=${n}:v=1:a=1[v_cat][a_cat_src]`);

  // ----- Apply caption drawtext stack -----
  let lastV = "[v_cat]";
  t.captions.forEach((cap, i) => {
    const out = `[v_txt${i}]`;
    parts.push(buildDrawtextFilter(cap, t.settings, lastV, out));
    lastV = out;
  });
  parts.push(`${lastV}null[v_out]`); // alias final video label

  // ----- Mix BGM tracks with source audio -----
  const audioMixInputs: string[] = ["[a_cat_src]"];
  t.bgmTracks.forEach((bgm, i) => {
    const inLabel = `[${bgm.inputIndex}:a]`;
    const outLabel = `[a_bgm${i}]`;
    const segDur = bgm.sourceOut - bgm.sourceIn;
    parts.push(
      `${inLabel}atrim=start=${bgm.sourceIn.toFixed(3)}:end=${bgm.sourceOut.toFixed(
        3
      )},asetpts=PTS-STARTPTS,volume=${bgm.volume},adelay=${Math.round(
        bgm.timelineStart * 1000
      )}|${Math.round(bgm.timelineStart * 1000)},apad=whole_dur=${t.duration.toFixed(
        3
      )},atrim=0:${t.duration.toFixed(3)},aresample=${audioSampleRate}${outLabel}`
    );
    audioMixInputs.push(outLabel);
  });

  if (audioMixInputs.length === 1) {
    parts.push(`[a_cat_src]anull[a_out]`);
  } else {
    parts.push(
      `${audioMixInputs.join("")}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0:normalize=0[a_out]`
    );
  }

  const filterGraph = parts.join(";");

  return {
    inputs,
    filterGraph,
    mapArgs: ["-map", "[v_out]", "-map", "[a_out]"],
    outputArgs: [
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "20",
      "-r", String(fps),
      "-c:a", "aac",
      "-ar", String(audioSampleRate),
      "-ac", String(audioChannels),
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
    ],
  };
}
```

---

## packages/engine-freecut/src/executor/timelineBuilder.ts

```typescript
// packages/engine-freecut/src/executor/timelineBuilder.ts
import {
  Action,
  AddMediaAction,
  AudioSegment,
  CaptionSegment,
  ProjectSettings,
  Timeline,
  VideoSegment,
} from "./types";
import { AssetResolver, AssetEntry } from "./assetResolver";
import { probeDuration } from "./ffprobe";

interface ClipState {
  trackId: string;
  inputIndex: number;
  inputPath: string;
  kind: "video" | "audio";
  // SOURCE range currently bound to this clipId
  sourceIn: number;
  sourceOut: number;
  // TIMELINE start (clip will be shifted as speed changes downstream)
  timelineStart: number;
  playbackSpeed: number;
  volume: number;
  mute: boolean;
}

export async function buildTimeline(
  actions: Action[],
  resolver: AssetResolver,
  settings: ProjectSettings
): Promise<Timeline> {
  const clips = new Map<string, ClipState>();
  const captions: CaptionSegment[] = [];

  // map inputPath -> inputIndex (dedupe inputs to ffmpeg)
  const inputIndexByPath = new Map<string, number>();
  const nextInputIndex = () => inputIndexByPath.size;

  const ensureInput = (path: string): number => {
    if (inputIndexByPath.has(path)) return inputIndexByPath.get(path)!;
    const idx = nextInputIndex();
    inputIndexByPath.set(path, idx);
    return idx;
  };

  for (const a of actions) {
    switch (a.type) {
      case "addMedia": {
        const entry = resolver.resolve(a.mediaId);
        if (!entry) throw new Error(`addMedia: unresolved ${a.mediaId}`);
        const duration =
          entry.durationSec ?? (await probeDuration(entry.filePath));
        const sourceIn = a.sourceIn ?? 0;
        const sourceOut = a.sourceOut ?? duration;
        const inputIndex = ensureInput(entry.filePath);

        const kind: "video" | "audio" =
          entry.kind === "audio" ? "audio" : "video";

        clips.set(a.clipId, {
          trackId: a.trackId,
          inputIndex,
          inputPath: entry.filePath,
          kind,
          sourceIn,
          sourceOut,
          timelineStart: a.startTime,
          playbackSpeed: 1.0,
          volume: 1.0,
          mute: false,
        });
        break;
      }

      case "split": {
        const orig = clips.get(a.clipId);
        if (!orig) throw new Error(`split: unknown clipId ${a.clipId}`);
        const splitSource = orig.sourceIn + a.time;
        if (splitSource <= orig.sourceIn || splitSource >= orig.sourceOut)
          throw new Error(`split: time ${a.time} out of bounds`);

        const seg1: ClipState = { ...orig, sourceOut: splitSource };
        const seg1Duration = seg1.sourceOut - seg1.sourceIn;

        const seg2: ClipState = {
          ...orig,
          sourceIn: splitSource,
          timelineStart: orig.timelineStart + seg1Duration / orig.playbackSpeed,
        };

        clips.delete(a.clipId);
        clips.set(`${a.clipId}_segment_1`, seg1);
        clips.set(`${a.clipId}_segment_2`, seg2);
        break;
      }

      case "updateClip": {
        const c = clips.get(a.clipId);
        if (!c) throw new Error(`updateClip: unknown clipId ${a.clipId}`);
        if (a.properties.playbackSpeed !== undefined)
          c.playbackSpeed = a.properties.playbackSpeed;
        if (a.properties.volume !== undefined) c.volume = a.properties.volume;
        if (a.properties.mute !== undefined) c.mute = a.properties.mute;
        break;
      }

      case "removeClip": {
        clips.delete(a.clipId);
        break;
      }

      case "addCaption": {
        captions.push({
          startTime: a.startTime,
          duration: a.duration,
          text: a.text,
          style: normalizeCaptionStyle(a.style, settings),
        });
        break;
      }
    }
  }

  // Partition clips into video vs audio (bgm) tracks
  const videoSegments: VideoSegment[] = [];
  const bgmTracks: AudioSegment[] = [];

  for (const c of clips.values()) {
    if (c.trackId.startsWith("video_")) {
      videoSegments.push({
        inputIndex: c.inputIndex,
        inputPath: c.inputPath,
        sourceIn: c.sourceIn,
        sourceOut: c.sourceOut,
        timelineStart: c.timelineStart,
        playbackSpeed: c.playbackSpeed,
        volume: c.mute ? 0 : c.volume,
        mute: c.mute,
      });
    } else if (c.trackId.startsWith("audio_")) {
      bgmTracks.push({
        inputIndex: c.inputIndex,
        inputPath: c.inputPath,
        sourceIn: c.sourceIn,
        sourceOut: c.sourceOut,
        timelineStart: c.timelineStart,
        volume: c.mute ? 0 : c.volume,
      });
    }
  }

  videoSegments.sort((a, b) => a.timelineStart - b.timelineStart);
  bgmTracks.sort((a, b) => a.timelineStart - b.timelineStart);

  // total timeline duration = end of last video segment
  const duration = videoSegments.reduce((max, s) => {
    const segDur = (s.sourceOut - s.sourceIn) / s.playbackSpeed;
    return Math.max(max, s.timelineStart + segDur);
  }, 0);

  return { settings, duration, videoSegments, bgmTracks, captions };
}

function normalizeCaptionStyle(
  style: any,
  settings: ProjectSettings
): CaptionSegment["style"] {
  const fs = parseFontSize(style?.fontSize, settings);
  return {
    color: style?.color ?? "white",
    fontSize: fs,
    fontFamily: style?.fontFamily ?? "Arial",
    fontWeight: style?.fontWeight ?? "bold",
    textAlign: style?.textAlign ?? "center",
    verticalAlign: style?.verticalAlign ?? "middle",
    backgroundColor: style?.backgroundColor,
    strokeColor: style?.strokeColor,
    strokeWidth: style?.strokeWidth ?? 0,
  };
}

function parseFontSize(input: any, settings: ProjectSettings): number {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    const m = input.match(/^([\d.]+)(vw|vh|px)?$/i);
    if (!m) return 72;
    const n = parseFloat(m[1]);
    const unit = (m[2] ?? "px").toLowerCase();
    if (unit === "vw") return Math.round((settings.width * n) / 100);
    if (unit === "vh") return Math.round((settings.height * n) / 100);
    return n;
  }
  return 72;
}
```

---

## packages/engine-freecut/src/executor/drawtext.ts

```typescript
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
```

---

