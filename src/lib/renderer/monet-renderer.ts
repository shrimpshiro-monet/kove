// Monet Canvas Renderer
// Renders MonetEDL to Canvas2D for preview

import type { MonetEDL, Shot } from "../../server/types/edl";
import type { RenderContext, RenderFrame } from "./types";
import { MediaLoader } from "./media-loader";
import { EffectsEngine } from "./effects";
import { TransitionEngine } from "./transitions";

export class MonetRenderer {
  private mediaLoader: MediaLoader;
  private effects: EffectsEngine;
  private transitions: TransitionEngine;
  private edl: MonetEDL | null = null;
  private renderContext: RenderContext | null = null;
  private previousFrameData: ImageData | null = null;

  constructor() {
    this.mediaLoader = new MediaLoader();
    this.effects = new EffectsEngine();
    this.transitions = new TransitionEngine();
  }

  /**
   * Initialize renderer with EDL and canvas
   */
  async initialize(
    edl: MonetEDL,
    canvas: HTMLCanvasElement,
    mediaUrls?: Map<string, string> // Optional map of clipId -> URL
  ) {
    this.edl = edl;

    // Set up canvas
    canvas.width = edl.timeline.resolution.width;
    canvas.height = edl.timeline.resolution.height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }

    this.renderContext = {
      canvas,
      ctx,
      width: edl.timeline.resolution.width,
      height: edl.timeline.resolution.height,
      fps: edl.timeline.fps,
    };

    // Preload all media assets
    await this.preloadAssets(edl, mediaUrls);
  }

  private async preloadAssets(
    edl: MonetEDL,
    mediaUrls?: Map<string, string>
  ) {
    const clipIds = new Set<string>();

    // Collect all unique clip IDs
    for (const shot of edl.shots) {
      clipIds.add(shot.source.clipId);
    }

    // Load all clips (in parallel)
    const loadPromises = Array.from(clipIds).map((clipId) => {
      // Use provided URL or fallback to API endpoint
      const url = mediaUrls?.get(clipId) || `/api/media/${clipId}`;
      return this.mediaLoader.loadAsset(clipId, url, "video");
    });

    await Promise.all(loadPromises);
    console.log(`Loaded ${clipIds.size} media assets`);
  }

  /**
   * Render a single frame at given time
   */
  async renderFrame(time: number): Promise<void> {
    if (!this.edl || !this.renderContext) {
      throw new Error("Renderer not initialized");
    }

    const { ctx, width, height } = this.renderContext;

    // Find which shot we're in
    const renderFrame = this.calculateRenderFrame(time);
    if (!renderFrame) {
      // No shot at this time, show black
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // Get the source clip
    const shot = this.edl.shots[renderFrame.shotIndex];
    const asset = this.mediaLoader.getAsset(shot.source.clipId);

    if (!asset || !asset.element || asset.type !== "video") {
      console.warn(`Asset not loaded: ${shot.source.clipId}`);
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const video = asset.element as HTMLVideoElement;

    // Seek video to correct time
    await this.mediaLoader.seekVideo(video, renderFrame.sourceTime);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Save context state
    ctx.save();

    // Apply transform (scale, rotation, position)
    this.applyTransform(ctx, renderFrame.transform, width, height);

    // Apply effects
    this.effects.applyEffects(ctx, renderFrame.effects, width, height);

    // Draw video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Capture current frame data for transitions
    const currentFrameData = ctx.getImageData(0, 0, width, height);

    // Apply transition if in transition period
    if (renderFrame.transition && renderFrame.transition.progress < 1) {
      this.transitions.applyTransition(
        ctx,
        renderFrame.transition.type,
        renderFrame.transition.progress,
        currentFrameData,
        this.previousFrameData,
        width,
        height
      );
    }

    // Store frame for next transition
    this.previousFrameData = currentFrameData;

    // Reset effects
    this.effects.resetEffects(ctx);

    // Restore context state
    ctx.restore();
  }

  /**
   * Calculate render parameters for given time
   */
  private calculateRenderFrame(time: number): RenderFrame | null {
    if (!this.edl) return null;

    // Find current shot
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

    // Calculate time within shot
    const timeInShot = time - currentShot.timing.startTime;

    // Calculate source time (accounting for speed)
    const speed = currentShot.timing.speed || 1.0;
    const sourceTime =
      currentShot.source.inPoint + timeInShot * speed;

    // Check if we're in a transition
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

    // Build transform
    const transform = {
      scale: currentShot.transform?.scale || 1.0,
      rotation: currentShot.transform?.rotation || 0,
      position: currentShot.transform?.position || { x: 0, y: 0 },
    };

    // Build effects list
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

  /**
   * Apply transform (scale, rotation, position)
   */
  private applyTransform(
    ctx: CanvasRenderingContext2D,
    transform: { scale: number; rotation: number; position: { x: number; y: number } },
    width: number,
    height: number
  ) {
    const { scale, rotation, position } = transform;

    // Translate to center
    ctx.translate(width / 2, height / 2);

    // Apply scale
    if (scale !== 1.0) {
      ctx.scale(scale, scale);
    }

    // Apply rotation (degrees to radians)
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Apply position offset (normalized -1 to 1)
    const offsetX = position.x * width;
    const offsetY = position.y * height;
    ctx.translate(offsetX, offsetY);

    // Translate back
    ctx.translate(-width / 2, -height / 2);
  }

  /**
   * Get total duration
   */
  getDuration(): number {
    return this.edl?.timeline.duration || 0;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.mediaLoader.cleanup();
    this.edl = null;
    this.renderContext = null;
    this.previousFrameData = null;
  }
}
