// src/server/lib/lut-generator.ts
// Generates 3D .cube LUT files from source/reference frame comparison.
// Based on HALD LUT approach (zayneio/lut-generator) + MKL color transfer (kijai/ComfyUI-VideoColorGrading).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface LUTOptions {
  /** LUT resolution (default 33 = 33x33x33 grid). Higher = more precise but larger file. */
  size?: number;
  /** Number of representative frames to sample from each video (default 8). */
  sampleFrames?: number;
  /** Temp directory for intermediate files. */
  tempDir?: string;
}

export interface LUTResult {
  outputPath: string;
  size: number;
  gridPoints: number;
  durationMs: number;
}

/**
 * Generate a 3D .cube LUT file by comparing source video frames to a reference frame.
 *
 * Algorithm:
 * 1. Extract representative frames from source video
 * 2. Extract the reference frame
 * 3. Compute color mapping between source and reference color spaces
 * 4. Build a 3D identity LUT and apply the color transform
 * 5. Write the .cube file in Adobe standard format
 *
 * @param sourceVideoPath - Path to the source video
 * @param referenceFramePath - Path to the reference frame/image (color grading target)
 * @param outputPath - Where to write the .cube file
 * @param options - LUT generation options
 */
export async function generateLUT(
  sourceVideoPath: string,
  referenceFramePath: string,
  outputPath: string,
  options: LUTOptions = {},
): Promise<LUTResult> {
  const {
    size = 33,
    sampleFrames = 8,
    tempDir = path.join(os.tmpdir(), `lut-gen-${Date.now()}`),
  } = options;

  const startTime = Date.now();
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Extract representative frames from source video
    const sourceFrames = await extractRepresentativeFrames(
      sourceVideoPath,
      tempDir,
      sampleFrames,
    );

    // Step 2: Verify reference frame exists
    try {
      await fs.access(referenceFramePath);
    } catch {
      throw new Error(`Reference frame not found: ${referenceFramePath}`);
    }

    // Step 3: Compute color statistics for source and reference
    const sourceStats = await computeFrameColorStats(sourceFrames);
    const refStats = await computeFrameColorStats([referenceFramePath]);

    // Step 4: Compute 3D LUT transform matrix using MKL-inspired approach
    const lutGrid = buildColorTransformLUT(
      size,
      sourceStats.meanRGB,
      sourceStats.covMatrix,
      refStats.meanRGB,
      refStats.covMatrix,
    );

    // Step 5: Write .cube file
    await writeCubeFile(outputPath, lutGrid, size);

    const durationMs = Date.now() - startTime;
    const stats = await fs.stat(outputPath);

    return {
      outputPath,
      size: stats.size,
      gridPoints: size,
      durationMs,
    };
  } finally {
    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract representative frames from a video using FFmpeg.
 * Uses scene-change detection to pick frames that represent the video's color palette.
 */
async function extractRepresentativeFrames(
  videoPath: string,
  outDir: string,
  count: number,
): Promise<string[]> {
  const outputPath = path.join(outDir, "frame_%03d.jpg");

  // Get video duration first
  const { stdout: probeOut } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ], { timeout: 10_000 }).catch(() => ({ stdout: "30" }));

  const duration = Math.max(1, parseFloat(probeOut.trim()) || 30);

  // Extract evenly-spaced frames
  const fps = Math.max(0.1, count / duration);
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vf", `fps=${fps.toFixed(4)}`,
    "-vframes", String(count),
    "-q:v", "2",
    outputPath,
    "-y",
  ], { timeout: 60_000 }).catch((err) => {
    // FFmpeg may exit non-zero on some systems
    if (!err.stderr) throw err;
    return { stderr: err.stderr };
  });

  // Collect extracted frames
  const frames: string[] = [];
  for (let i = 1; i <= count; i++) {
    const framePath = path.join(outDir, `frame_${String(i).padStart(3, "0")}.jpg`);
    try {
      await fs.access(framePath);
      frames.push(framePath);
    } catch {
      break; // No more frames
    }
  }

  if (frames.length === 0) {
    throw new Error(`Failed to extract frames from ${videoPath}`);
  }

  return frames;
}

interface ColorStats {
  meanRGB: [number, number, number];
  covMatrix: [[number, number, number], [number, number, number], [number, number, number]];
}

/**
 * Compute mean RGB and covariance matrix for a set of image frames.
 * Uses FFmpeg to extract pixel data and computes statistics in Node.
 */
async function computeFrameColorStats(framePaths: string[]): Promise<ColorStats> {
  // Use FFmpeg to get average color stats for all frames
  const allR: number[] = [];
  const allG: number[] = [];
  const allB: number[] = [];

  for (const framePath of framePaths) {
    try {
      // Extract pixel data as raw RGB using FFmpeg
      const tmpRaw = path.join(os.tmpdir(), `lut-pixel-${Date.now()}-${Math.random().toString(36).slice(2)}.raw`);
      await execFileAsync("ffmpeg", [
        "-i", framePath,
        "-vf", "scale=64:64",
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        tmpRaw,
        "-y",
      ], { timeout: 10_000 });

      const raw = await fs.readFile(tmpRaw);
      await fs.unlink(tmpRaw).catch(() => {});

      // Sample every 9th pixel to reduce computation (3 bytes per pixel RGB24)
      for (let i = 0; i + 2 < raw.length; i += 27) {
        allR.push(raw[i] / 255);
        allG.push(raw[i + 1] / 255);
        allB.push(raw[i + 2] / 255);
      }
    } catch {
      // Skip frames that fail
    }
  }

  if (allR.length === 0) {
    throw new Error("Failed to extract color data from frames");
  }

  // Compute mean
  const n = allR.length;
  const meanR = allR.reduce((a, b) => a + b, 0) / n;
  const meanG = allG.reduce((a, b) => a + b, 0) / n;
  const meanB = allB.reduce((a, b) => a + b, 0) / n;

  // Compute covariance matrix
  let cRR = 0, cRG = 0, cRB = 0;
  let cGR = 0, cGG = 0, cGB = 0;
  let cBR = 0, cBG = 0, cBB = 0;

  for (let i = 0; i < n; i++) {
    const dR = allR[i] - meanR;
    const dG = allG[i] - meanG;
    const dB = allB[i] - meanB;
    cRR += dR * dR;
    cRG += dR * dG;
    cRB += dR * dB;
    cGR += dG * dR;
    cGG += dG * dG;
    cGB += dG * dB;
    cBR += dB * dR;
    cBG += dB * dG;
    cBB += dB * dB;
  }

  return {
    meanRGB: [meanR, meanG, meanB],
    covMatrix: [
      [cRR / n, cRG / n, cRB / n],
      [cGR / n, cGG / n, cGB / n],
      [cBR / n, cBG / n, cBB / n],
    ],
  };
}

/**
 * Build a 3D LUT that maps source color space to reference color space.
 * Uses a simplified Monge-Kantorovitch linear color transfer.
 */
function buildColorTransformLUT(
  size: number,
  srcMean: [number, number, number],
  srcCov: [[number, number, number], [number, number, number], [number, number, number]],
  refMean: [number, number, number],
  refCov: [[number, number, number], [number, number, number], [number, number, number]],
): Float64Array {
  const total = size * size * size;
  const lut = new Float64Array(total * 3);

  // Compute transfer matrix: T = ref_sqrt * inv(src_sqrt) that maps src → ref
  // Simplified: use mean-shift + scale adjustment
  const scaleR = srcCov[0][0] > 0.001 ? Math.sqrt(refCov[0][0] / srcCov[0][0]) : 1;
  const scaleG = srcCov[1][1] > 0.001 ? Math.sqrt(refCov[1][1] / srcCov[1][1]) : 1;
  const scaleB = srcCov[2][2] > 0.001 ? Math.sqrt(refCov[2][2] / srcCov[2][2]) : 1;

  const shiftR = refMean[0] - srcMean[0] * scaleR;
  const shiftG = refMean[1] - srcMean[1] * scaleG;
  const shiftB = refMean[2] - srcMean[2] * scaleB;

  let idx = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        // Input color (normalized 0-1)
        const inR = ri / (size - 1);
        const inG = gi / (size - 1);
        const inB = bi / (size - 1);

        // Apply color transform
        const outR = Math.max(0, Math.min(1, inR * scaleR + shiftR));
        const outG = Math.max(0, Math.min(1, inG * scaleG + shiftG));
        const outB = Math.max(0, Math.min(1, inB * scaleB + shiftB));

        lut[idx] = outR;
        lut[idx + 1] = outG;
        lut[idx + 2] = outB;
        idx += 3;
      }
    }
  }

  return lut;
}

/**
 * Write a .cube LUT file in Adobe standard format.
 */
async function writeCubeFile(
  outputPath: string,
  lut: Float64Array,
  size: number,
): Promise<void> {
  const lines: string[] = [];

  // Header
  lines.push(`# Monet AI Editor — Auto-generated 3D LUT`);
  lines.push(`TITLE "Monet Color Grade"`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push(`DOMAIN_MIN 0.0 0.0 0.0`);
  lines.push(`DOMAIN_MAX 1.0 1.0 1.0`);
  lines.push("");

  // LUT data: B varies slowest, then G, then R (Adobe standard order)
  let idx = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = lut[idx];
        const g = lut[idx + 1];
        const b = lut[idx + 2];
        lines.push(`${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`);
        idx += 3;
      }
    }
  }

  await fs.writeFile(outputPath, lines.join("\n"), "utf-8");
}

/**
 * Apply a .cube LUT to a video using FFmpeg's lut3d filter.
 */
export async function applyLUTToVideo(
  inputVideoPath: string,
  lutPath: string,
  outputPath: string,
): Promise<void> {
  // Validate lutPath to prevent injection
  if (!/^[a-zA-Z0-9_\-/.]+$/.test(lutPath)) {
    throw new Error(`Invalid LUT path: ${lutPath}`);
  }

  await execFileAsync("ffmpeg", [
    "-i", inputVideoPath,
    "-vf", `lut3d=file=${lutPath}`,
    "-c:v", "libx264",
    "-crf", "18",
    "-c:a", "copy",
    outputPath,
    "-y",
  ], { timeout: 300_000 });
}
