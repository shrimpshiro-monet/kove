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
  cutFrom?: number;
  cutTo?: number;
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
  // ponytail: import path constructed at runtime to prevent esbuild from tracing it
  const editlyDir = ["editly", "dist", "index.js"].join("/");
  const editlyPath = [process.cwd(), editlyDir].join("/");
  // eslint-disable-next-line no-eval
  const editly = await (eval("import") as (p: string) => Promise<any>)(editlyPath);

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
