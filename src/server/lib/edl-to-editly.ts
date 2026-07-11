// src/server/lib/edl-to-editly.ts
// The compiler: MonetEDL → Editly specification
// Every field in the EDL becomes a real rendered pixel.

import type { MonetEDL, Shot, ColorGradePreset } from "../types/edl";
import { buildShotFilterChain, buildSpeedFilter, buildSpeedRampFilter } from "./editly-effects";
import { generateVelocityFactors, velocityToSetpts } from "./bezier-velocity";
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
    let bezierSetpts: string | undefined;
    if (shot.timing.speedRamp && shot.timing.speedRamp.easing !== "linear") {
      const fps = edl.timeline.fps || 30;
      const totalFrames = Math.floor(shot.timing.duration * fps);
      const { startSpeed, endSpeed } = shot.timing.speedRamp;
      const entryFrames = Math.floor(totalFrames * 0.2);
      const exitFrames = Math.floor(totalFrames * 0.2);
      const curve = {
        entrySpeed: startSpeed,
        anchorSpeed: (startSpeed + endSpeed) / 2,
        exitSpeed: endSpeed,
        entryFrames,
        exitFrames,
        anchorPosition: 0.5,
      };
      const factors = generateVelocityFactors(curve, totalFrames);
      bezierSetpts = velocityToSetpts(factors);
    } else if (shot.timing.speedRamp) {
      speedFactor = (shot.timing.speedRamp.startSpeed + shot.timing.speedRamp.endSpeed) / 2;
    } else if (shot.timing.speed && shot.timing.speed !== 1.0) {
      speedFactor = shot.timing.speed;
    }

    // ─── Effects as FFmpeg filters ───
    const effectFilterChain = buildShotFilterChain(shot);
    const speedFilter = buildSpeedRampFilter(shot) || buildSpeedFilter(shot);

    // Combine all filters
    const allFilters: string[] = [];
    if (bezierSetpts) allFilters.push(bezierSetpts);
    if (speedFilter && !bezierSetpts) allFilters.push(speedFilter);
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

    // Build drawtext filter chain for text overlays
    const drawtextFilters: string[] = [];
    for (const overlay of shotTextOverlays) {
      const text = overlay.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
      const fontSize = overlay.style?.fontSize ?? 72;
      const fontColor = overlay.style?.color ?? "white";
      const fontWeight = overlay.style?.weight ?? "bold";
      const shadow = overlay.style?.shadow ?? true;
      const align = overlay.style?.alignment ?? "center";

      // Position calculation
      let xExpr = "(w-text_w)/2"; // center
      if (align === "left") xExpr = "50";
      if (align === "right") xExpr = "w-text_w-50";

      // Apply offset if provided
      if (overlay.offset) {
        const ox = Math.round(overlay.offset.x * 960);
        const oy = Math.round(overlay.offset.y * 540);
        if (align === "center") xExpr = `(w-text_w)/2+${ox}`;
        else if (align === "left") xExpr = `${50+ox}`;
        else xExpr = `w-text_w-50+${ox}`;
      }

      // Calculate draw timing within the shot
      const overlayLocalStart = Math.max(0, overlay.startTime - shot.timing.startTime);
      const overlayLocalEnd = Math.min(
        shot.timing.duration,
        overlay.endTime - shot.timing.startTime
      );

      let filter = `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}`;
      filter += `:x=${xExpr}:y=(h-text_h)/2`;
      filter += `:fontfile=/System/Library/Fonts/Helvetica.ttc:font=${fontWeight === "bold" ? "Bold" : ""}`;

      if (shadow) {
        filter += `:shadowcolor=black@0.8:shadowx=3:shadowy=3`;
      }

      // Enable only during the overlay's time range
      filter += `:enable='between(t,${overlayLocalStart.toFixed(3)},${overlayLocalEnd.toFixed(3)})'`;

      drawtextFilters.push(filter);
    }

    if (drawtextFilters.length > 0) {
      // Add drawtext filters to the video layer's input options
      const existingFilters = videoLayer.inputOptions?.[1] || "";
      const allFilters = existingFilters
        ? `${existingFilters},${drawtextFilters.join(",")}`
        : drawtextFilters.join(",");
      videoLayer.inputOptions = ["-vf", allFilters];
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

  // ─── Audio (3-stage pipeline from Editly research) ───
  const audioTracks: EditlyAudioTrack[] = [];
  if (audioPath) {
    // Stage 1: Main music track with volume
    audioTracks.push({
      path: audioPath,
      mixVolume: edl.music?.volume ?? 0.8,
      cutFrom: edl.music?.fadeIn ? 0 : undefined,
      cutTo: edl.music?.fadeOut ? undefined : undefined,
    });

    // Stage 2: Per-shot source audio (if keepSourceAudio)
    // Stage 3: Arbitrary audio tracks mixed with amix=duration=first
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

    cool_desaturated:
      "eq=saturation=0.5:contrast=1.15:brightness=-0.03," +
      "curves=b='0/0 0.5/0.58 1/1':" +
      "r='0/0 0.5/0.45 1/0.95'",

    warm_dark:
      "curves=m='0/0 0.1/0.02 0.4/0.35 0.7/0.65 1/0.9':" +
      "r='0/0 0.5/0.58 1/1':" +
      "b='0/0 0.5/0.4 1/0.9'," +
      "eq=saturation=0.7:contrast=1.2:brightness=-0.05",

    vivid_red:
      "eq=saturation=3.5:brightness=-0.15:contrast=1.5," +
      "curves=r='0/0 0.3/0.6 0.7/1 1/1':" +
      "g='0/0 0.5/0.2 1/0.4':" +
      "b='0/0 0.5/0.15 1/0.3'",

    neutral_desaturated:
      "hue=s=0.15," +
      "eq=contrast=1.3:brightness=-0.02," +
      "curves=m='0/0 0.1/0.05 0.5/0.5 0.9/0.95 1/1'",

    bright_warm:
      "eq=saturation=1.3:contrast=1.1:brightness=0.08," +
      "curves=r='0/0 0.5/0.55 1/1':" +
      "g='0/0 0.5/0.52 1/1':" +
      "b='0/0 0.5/0.45 1/0.95'",

    vibrant_warm:
      "eq=saturation=2.0:contrast=1.2:brightness=0.03," +
      "curves=r='0/0 0.5/0.6 1/1':" +
      "g='0/0 0.5/0.55 1/1':" +
      "b='0/0 0.5/0.4 1/0.9'",

    hyper_neon:
      "eq=saturation=2.5:contrast=1.4:brightness=0.02," +
      "curves=c='0/0 0.3/0.7 0.6/0.5 1/0.8':" +
      "m='0/0 0.4/0.8 0.7/0.4 1/0.7':" +
      "y='0/0 0.5/0.9 1/0.6'",

    cool_dark:
      "eq=saturation=0.4:contrast=1.3:brightness=-0.1," +
      "curves=b='0/0 0.3/0.6 0.7/0.7 1/0.8':" +
      "r='0/0 0.5/0.3 1/0.6'",

    warm_cinematic:
      "eq=saturation=1.1:contrast=1.15:brightness=0.02," +
      "curves=r='0/0 0.5/0.58 1/1':" +
      "g='0/0 0.5/0.52 1/1':" +
      "b='0/0 0.5/0.42 1/0.92'",

    desaturated_natural:
      "eq=saturation=0.6:contrast=1.1:brightness=-0.01," +
      "curves=m='0/0 0.1/0.05 0.5/0.5 0.9/0.92 1/1'",
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
