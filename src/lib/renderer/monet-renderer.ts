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
  private hasLoadedAnyAsset = false;

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
    mediaUrls?: Map<string, string>
  ) {
    this.edl = edl;

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

    this.hasLoadedAnyAsset = await this.preloadAssets(edl, mediaUrls);
  }

  private async preloadAssets(
    edl: MonetEDL,
    mediaUrls?: Map<string, string>
  ): Promise<boolean> {
    const clipIds = new Set<string>();

    for (const shot of edl.shots) {
      clipIds.add(shot.source.clipId);
    }

    const clipIdList = Array.from(clipIds);
    const loadPromises = clipIdList.map((clipId) => {
      const url = mediaUrls?.get(clipId) || `/api/media/${clipId}`;
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
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failed.push(`${clipId}: ${reason}`);
    }

    if (failed.length > 0) {
      console.warn(
        `Loaded ${loaded}/${clipIdList.length} media assets. Some clips were skipped:\n${failed.join("\n")}`
      );
    } else {
      console.log(`Loaded ${loaded} media assets`);
    }

    return loaded > 0;
  }

  /**
   * Render a single frame at given time
   */
  async renderFrame(time: number): Promise<void> {
    if (!this.edl || !this.renderContext) {
      throw new Error("Renderer not initialized");
    }

    const { ctx, width, height } = this.renderContext;

    const renderFrame = this.calculateRenderFrame(time);
    if (!renderFrame) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const shot = this.edl.shots[renderFrame.shotIndex];
    const asset = this.mediaLoader.getAsset(shot.source.clipId);

    if (!asset || !asset.element || asset.type !== "video") {
      this.renderPlaceholderFrame(ctx, shot, renderFrame.sourceTime, width, height);
      return;
    }

    const video = asset.element as HTMLVideoElement;

    await this.mediaLoader.seekVideo(video, renderFrame.sourceTime);

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    // Set initial filter to color grade
    const colorGrade = this.edl?.globalEffects?.colorGrade;
    ctx.filter = colorGradeToFilter(colorGrade);

    this.applyTransform(ctx, renderFrame.transform, width, height);

    if (this.effects.hasCustomDraw(renderFrame.effects)) {
      this.effects.customDraw(ctx, video, renderFrame.effects, width, height, time);
    } else {
      this.effects.applyEffects(ctx, renderFrame.effects, width, height, time);
      ctx.drawImage(video, 0, 0, width, height);
    }

    // Vignette: radial gradient overlay, intensity from globalEffects.
    const vignetteStrength = this.edl?.globalEffects?.vignette ?? 0;
    if (vignetteStrength > 0) {
      applyVignette(ctx, width, height, vignetteStrength);
    }

    const currentFrameData = ctx.getImageData(0, 0, width, height);

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

    this.renderTextOverlays(time, shot, renderFrame.sourceTime, width, height, video);
    this.previousFrameData = currentFrameData;
    this.effects.resetEffects(ctx);
    ctx.restore();
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
      scale: currentShot.transform?.scale || 1.0,
      rotation: currentShot.transform?.rotation || 0,
      position: currentShot.transform?.position || { x: 0, y: 0 },
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

  cleanup() {
    this.mediaLoader.cleanup();
    this.edl = null;
    this.renderContext = null;
    this.previousFrameData = null;
    this.hasLoadedAnyAsset = false;
  }
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
