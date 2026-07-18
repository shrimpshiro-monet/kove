// src/server/lib/post-process-render.ts
// Unified single-pass post-processing for Editly/FFmpeg renders.
// Applies LUT (.cube), ASS text overlays, and subject mask effects
// in ONE combined -filter_complex graph to avoid double encoding.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Env } from "../types/env";

const execFileAsync = promisify(execFile);

export interface PostProcessOptions {
  /** R2 key for the .cube LUT file. */
  lutKey?: string;
  /** Inline .ass subtitle content (written to temp file). */
  assContent?: string;
  /** R2 key for the .ass subtitle file. */
  assKey?: string;
  /** R2 key for the subject mask video. */
  maskKey?: string;
  /** Masked blur strength (default 15). */
  blurStrength?: number;
}

export interface PostProcessResult {
  outputPath: string;
  durationMs: number;
  filtersApplied: string[];
}

interface VideoInfo {
  width: number;
  height: number;
  fps: number;
  duration: number;
}

/**
 * Apply post-processing filters to a rendered video in a SINGLE FFmpeg pass.
 *
 * Unified filter graph strategy:
 *   [0:v] → lut3d → subtitles → [color_text]  (if LUT/ASS present)
 *   [1:v] → scale? → boxblur → [blurred_mask] (if mask present)
 *   [color_text][blurred_mask] → maskedmerge   (if mask present)
 *
 * When no mask is present, falls back to simple -vf (no filter_complex needed).
 */
export async function postProcessRender(
  inputVideoPath: string,
  outputVideoPath: string,
  options: PostProcessOptions,
  env: Env,
  tempDir: string,
): Promise<PostProcessResult> {
  const startTime = Date.now();
  const filtersApplied: string[] = [];

  // Validate input exists
  try {
    await fs.access(inputVideoPath);
  } catch {
    throw new Error(`Input video not found: ${inputVideoPath}`);
  }

  // 1. Download/prepare assets
  const lutLocalPath = options.lutKey
    ? await downloadR2Asset(env, options.lutKey, tempDir, "grade.cube")
    : undefined;

  const assLocalPath = options.assContent
    ? await writeASSFile(options.assContent, tempDir)
    : options.assKey
      ? await downloadR2Asset(env, options.assKey, tempDir, "subtitles.ass")
      : undefined;

  const maskLocalPath = options.maskKey
    ? await downloadR2Asset(env, options.maskKey, tempDir, "mask.mp4")
    : undefined;

  if (lutLocalPath) filtersApplied.push("lut3d");
  if (assLocalPath) filtersApplied.push("subtitles");
  if (maskLocalPath) filtersApplied.push("maskedmerge");

  // If no filters to apply, just copy
  if (filtersApplied.length === 0) {
    await fs.copyFile(inputVideoPath, outputVideoPath);
    return { outputPath: outputVideoPath, durationMs: Date.now() - startTime, filtersApplied: [] };
  }

  // 2. Get video metadata for resolution/FPS matching
  const baseInfo = await probeVideo(inputVideoPath);

  // 3. Build and execute the unified filter graph
  if (maskLocalPath) {
    // Mask present → must use -filter_complex (two inputs)
    await executeUnifiedGraph(inputVideoPath, maskLocalPath, outputVideoPath, {
      lutLocalPath,
      assLocalPath,
      blurStrength: options.blurStrength ?? 15,
      baseInfo,
    });
  } else {
    // No mask → simple -vf chain (single input)
    await executeSimpleFilter(inputVideoPath, outputVideoPath, {
      lutLocalPath,
      assLocalPath,
    });
  }

  return {
    outputPath: outputVideoPath,
    durationMs: Date.now() - startTime,
    filtersApplied,
  };
}

// ─── UNIFIED FILTER GRAPH (LUT + ASS + Mask in one pass) ──────────

async function executeUnifiedGraph(
  inputVideoPath: string,
  maskLocalPath: string,
  outputPath: string,
  opts: {
    lutLocalPath?: string;
    assLocalPath?: string;
    blurStrength: number;
    baseInfo: VideoInfo;
  },
): Promise<void> {
  // Validate paths to prevent injection
  validateAssetPath(inputVideoPath);
  validateAssetPath(maskLocalPath);
  if (opts.lutLocalPath) validateAssetPath(opts.lutLocalPath);
  if (opts.assLocalPath) validateAssetPath(opts.assLocalPath);

  // Get mask video info for resolution/FPS matching
  const maskInfo = await probeVideo(maskLocalPath);

  // ─── Build the main video chain [0:v] ───
  const mainFilters: string[] = [];

  if (opts.lutLocalPath) {
    mainFilters.push(`lut3d=file=${opts.lutLocalPath}:interp=tetrahedral`);
  }

  if (opts.assLocalPath) {
    const escapedAss = escapeFilterPath(opts.assLocalPath);
    mainFilters.push(`subtitles=${escapedAss}`);
  }

  // Label the main chain output
  const mainChainLabel = mainFilters.length > 0 ? "[color_text]" : "[base_v]";

  // ─── Build the mask chain [1:v] ───
  const maskFilters: string[] = [];

  // Resolution matching: inject scale if mask dimensions differ from base
  if (maskInfo.width !== opts.baseInfo.width || maskInfo.height !== opts.baseInfo.height) {
    maskFilters.push(`scale=${opts.baseInfo.width}:${opts.baseInfo.height}:flags=lanczos`);
  }

  // FPS matching: inject fps filter if frame rates differ
  const fpsDiff = Math.abs(maskInfo.fps - opts.baseInfo.fps);
  if (fpsDiff > 0.01) {
    maskFilters.push(`fps=fps=${opts.baseInfo.fps}`);
  }

  // Blur the mask for soft edges
  const blurY = Math.round(opts.blurStrength / 2);
  maskFilters.push(`boxblur=${opts.blurStrength}:${blurY}`);

  // ─── Compose the full filter_complex string ───
  const graphParts: string[] = [];

  // Main video chain
  if (mainFilters.length > 0) {
    graphParts.push(`[0:v]${mainFilters.join(",")}${mainChainLabel}`);
  }

  // Mask chain
  const maskLabel = "[blurred_mask]";
  if (maskFilters.length > 0) {
    graphParts.push(`[1:v]${maskFilters.join(",")}${maskLabel}`);
  } else {
    // No transforms needed on mask — just label it
    graphParts.push(`[1:v]copy${maskLabel}`);
  }

  // Final merge
  const mainInput = mainFilters.length > 0 ? mainChainLabel : "[base_v]";
  if (mainFilters.length === 0) {
    // No main chain filters — need to label [0:v] first
    graphParts.unshift(`[0:v]copy${mainInput}`);
  }
  graphParts.push(`${mainInput}${maskLabel}maskedmerge[outv]`);

  const filterComplex = graphParts.join(";\n");

  // Write filter graph to file (avoids shell escaping issues with long strings)
  const filterPath = path.join(path.dirname(outputPath), "filter_graph.txt");
  await fs.writeFile(filterPath, filterComplex, "utf-8");

  const args = [
    "-i", inputVideoPath,
    "-i", maskLocalPath,
    "-filter_complex_script", filterPath,
    "-map", "[outv]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "copy",
    outputPath,
    "-y",
  ];

  await execFileAsync("ffmpeg", args, { timeout: 600_000 });
}

// ─── SIMPLE FILTER (-vf only, no mask) ────────────────────────────

async function executeSimpleFilter(
  inputVideoPath: string,
  outputPath: string,
  opts: {
    lutLocalPath?: string;
    assLocalPath?: string;
  },
): Promise<void> {
  const filterParts: string[] = [];

  if (opts.lutLocalPath) {
    validateAssetPath(opts.lutLocalPath);
    filterParts.push(`lut3d=file=${opts.lutLocalPath}:interp=tetrahedral`);
  }

  if (opts.assLocalPath) {
    validateAssetPath(opts.assLocalPath);
    const escapedAss = escapeFilterPath(opts.assLocalPath);
    filterParts.push(`subtitles=${escapedAss}`);
  }

  if (filterParts.length === 0) return;

  const vf = filterParts.join(",");
  await execFileAsync("ffmpeg", [
    "-i", inputVideoPath,
    "-vf", vf,
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "copy",
    outputPath,
    "-y",
  ], { timeout: 600_000 });
}

// ─── EDITLY PIPELINE INTEGRATION ──────────────────────────────────

/**
 * Apply post-processing to an Editly render job.
 * Integrates into the render-engine-editly.ts pipeline.
 */
export async function postProcessEditlyRender(
  editlyOutputPath: string,
  tempDir: string,
  edl: any,
  env: Env,
): Promise<PostProcessResult> {
  const options: PostProcessOptions = {
    lutKey: edl?.metadata?.lutKey || edl?.globalEffects?.lutKey,
    assContent: edl?.metadata?.assContent,
    assKey: edl?.metadata?.assKey,
    maskKey: edl?.metadata?.maskKey,
    blurStrength: edl?.metadata?.blurStrength,
  };

  if (!options.lutKey && !options.assContent && !options.assKey && !options.maskKey) {
    return { outputPath: editlyOutputPath, durationMs: 0, filtersApplied: [] };
  }

  const outputPath = path.join(tempDir, "post-processed.mp4");
  return postProcessRender(editlyOutputPath, outputPath, options, env, tempDir);
}

// ─── PROBE / VALIDATION HELPERS ───────────────────────────────────

async function probeVideo(videoPath: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=width,height,r_frame_rate,duration",
    "-show_entries", "format=duration",
    "-of", "json",
    videoPath,
  ], { timeout: 10_000 });

  const probe = JSON.parse(stdout);
  const stream = probe.streams?.find((s: any) => s.codec_type === "video") ?? {};

  return {
    width: stream.width ?? 1920,
    height: stream.height ?? 1080,
    fps: parseFrameRate(stream.r_frame_rate ?? "30/1"),
    duration: parseFloat(probe.format?.duration ?? stream.duration ?? "0") || 0,
  };
}

function parseFrameRate(rateStr: string): number {
  if (!rateStr) return 30;
  const parts = rateStr.split("/");
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den > 0 && !isNaN(num) && !isNaN(den)) return num / den;
  }
  const val = parseFloat(rateStr);
  return !isNaN(val) && val > 0 ? val : 30;
}

function validateAssetPath(filePath: string): void {
  // Only allow safe characters (alphanumeric, dash, underscore, dot, slash)
  if (!/^[a-zA-Z0-9_\-/.]+$/.test(filePath)) {
    throw new Error(`Invalid asset path (possible injection): ${filePath}`);
  }
}

function escapeFilterPath(p: string): string {
  return p
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// ─── R2 / FILE HELPERS ────────────────────────────────────────────

async function downloadR2Asset(
  env: Env,
  r2Key: string,
  tempDir: string,
  filename: string,
): Promise<string> {
  const localPath = path.join(tempDir, filename);
  const possibleKeys = [r2Key, `luts/${r2Key}`, `renders/${r2Key}`, `masks/${r2Key}`];

  for (const key of possibleKeys) {
    const object = await env.MONET_RENDERS.get(key);
    if (object) {
      await fs.writeFile(localPath, Buffer.from(await object.arrayBuffer()));
      return localPath;
    }
    const mediaObject = await env.MONET_MEDIA.get(key);
    if (mediaObject) {
      await fs.writeFile(localPath, Buffer.from(await mediaObject.arrayBuffer()));
      return localPath;
    }
  }

  throw new Error(`R2 asset not found: ${r2Key} (tried ${possibleKeys.join(", ")})`);
}

async function writeASSFile(assContent: string, tempDir: string): Promise<string> {
  const assPath = path.join(tempDir, "subtitles.ass");
  await fs.writeFile(assPath, assContent, "utf-8");
  return assPath;
}
