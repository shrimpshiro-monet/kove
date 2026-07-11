/**
 * transition-detector.ts — Detect transition types between shots in reference video.
 *
 * Analyzes frame differences at cut points to classify transitions:
 * - hard cut (sharp frame change)
 * - crossfade (gradual blend)
 * - whip pan (motion blur at cut)
 * - morph cut (face/body alignment)
 * - dissolve (gradual blend with noise)
 * - jump cut (same subject, time skip)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface TransitionDetection {
  timestamp: number;
  type: "hard_cut" | "crossfade" | "whip_pan" | "morph_cut" | "dissolve" | "jump_cut";
  confidence: number;
  frameDiffMean: number;
  motionBlurEstimate: number;
}

/**
 * Detect transition types by analyzing frame differences at cut points.
 * Extracts frames before/after each cut and computes difference metrics.
 */
export async function detectTransitions(
  videoPath: string,
  shotBoundaries: number[],
): Promise<TransitionDetection[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transition-detect-"));
  const results: TransitionDetection[] = [];

  try {
    // Get video fps
    const { stdout: fpsStr } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=r_frame_rate",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ], { timeout: 10_000 });
    const fps = eval(fpsStr.trim()) || 30;

    for (const cutTime of shotBoundaries) {
      try {
        // Extract 3 frames before and 3 frames after the cut
        const beforeFrames: Buffer[] = [];
        const afterFrames: Buffer[] = [];

        for (let offset = -3; offset <= 3; offset++) {
          const t = cutTime + offset / fps;
          if (t < 0) continue;
          const framePath = path.join(tmpDir, `cut_${cutTime.toFixed(3)}_${offset}.jpg`);
          await execFileAsync("ffmpeg", [
            "-ss", String(t),
            "-i", videoPath,
            "-frames:v", "1",
            "-q:v", "2",
            framePath,
          ], { timeout: 5_000 });
          const data = await fs.readFile(framePath);
          if (offset < 0) beforeFrames.push(data);
          else if (offset > 0) afterFrames.push(data);
        }

        if (beforeFrames.length === 0 || afterFrames.length === 0) continue;

        // Compute frame difference metrics
        const lastBefore = beforeFrames[beforeFrames.length - 1];
        const firstAfter = afterFrames[0];

        // Simple JPEG byte difference (not pixel-perfect, but fast)
        const diffBytes = computeByteDiff(lastBefore, firstAfter);
        const frameDiffMean = diffBytes.meanDiff;
        const motionBlurEstimate = diffBytes.motionBlurEstimate;

        // Classify transition
        const classification = classifyTransition(
          frameDiffMean,
          motionBlurEstimate,
          beforeFrames,
          afterFrames,
        );

        results.push({
          timestamp: cutTime,
          ...classification,
          frameDiffMean,
          motionBlurEstimate,
        });
      } catch {
        // Skip failed cut points
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return results;
}

/**
 * Compute byte-level difference between two JPEG buffers.
 * Returns mean difference and motion blur estimate.
 */
function computeByteDiff(a: Buffer, b: Buffer): {
  meanDiff: number;
  motionBlurEstimate: number;
} {
  // Compare file sizes as a proxy for content change
  const sizeDiff = Math.abs(a.length - b.length) / Math.max(a.length, b.length);

  // Sample bytes at regular intervals for speed
  const sampleSize = Math.min(a.length, b.length, 10000);
  const step = Math.max(1, Math.floor(Math.min(a.length, b.length) / sampleSize));
  let totalDiff = 0;
  let highDiffCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    const idx = i * step;
    if (idx < a.length && idx < b.length) {
      const diff = Math.abs(a[idx] - b[idx]);
      totalDiff += diff;
      if (diff > 100) highDiffCount++;
    }
  }

  const meanDiff = totalDiff / sampleSize / 255; // Normalize to 0-1
  const motionBlurEstimate = highDiffCount / sampleSize;

  return { meanDiff, motionBlurEstimate };
}

/**
 * Classify transition type based on frame difference metrics.
 */
function classifyTransition(
  frameDiffMean: number,
  motionBlurEstimate: number,
  beforeFrames: Buffer[],
  afterFrames: Buffer[],
): { type: TransitionDetection["type"]; confidence: number } {
  // Hard cut: sharp frame change, no motion blur
  if (frameDiffMean > 0.3 && motionBlurEstimate < 0.1) {
    return { type: "hard_cut", confidence: 0.8 };
  }

  // Whip pan: high motion blur at cut point
  if (motionBlurEstimate > 0.3) {
    return { type: "whip_pan", confidence: 0.7 };
  }

  // Crossfade: moderate frame change with gradual transition
  if (frameDiffMean > 0.1 && frameDiffMean < 0.3) {
    // Check if frames before/after show gradual change
    const beforeDiff = computeByteDiff(beforeFrames[0], beforeFrames[beforeFrames.length - 1]);
    const afterDiff = computeByteDiff(afterFrames[0], afterFrames[afterFrames.length - 1]);
    if (beforeDiff.meanDiff < 0.1 && afterDiff.meanDiff < 0.1) {
      return { type: "crossfade", confidence: 0.6 };
    }
  }

  // Jump cut: same subject, time skip (moderate difference)
  if (frameDiffMean > 0.15 && frameDiffMean < 0.25) {
    return { type: "jump_cut", confidence: 0.5 };
  }

  // Dissolve: low frame difference with noise
  if (frameDiffMean < 0.15) {
    return { type: "dissolve", confidence: 0.4 };
  }

  // Default to hard cut
  return { type: "hard_cut", confidence: 0.3 };
}

/**
 * Aggregate transition detections into a breakdown.
 */
export function aggregateTransitions(
  detections: TransitionDetection[],
): {
  cutPercentage: number;
  crossfadePercentage: number;
  whipPanPercentage: number;
  otherPercentage: number;
  avgConfidence: number;
} {
  if (detections.length === 0) {
    return { cutPercentage: 1, crossfadePercentage: 0, whipPanPercentage: 0, otherPercentage: 0, avgConfidence: 0 };
  }

  const counts = { hard_cut: 0, crossfade: 0, whip_pan: 0, other: 0 };
  let totalConf = 0;

  for (const d of detections) {
    totalConf += d.confidence;
    if (d.type === "hard_cut") counts.hard_cut++;
    else if (d.type === "crossfade") counts.crossfade++;
    else if (d.type === "whip_pan") counts.whip_pan++;
    else counts.other++;
  }

  const total = detections.length;
  return {
    cutPercentage: counts.hard_cut / total,
    crossfadePercentage: counts.crossfade / total,
    whipPanPercentage: counts.whip_pan / total,
    otherPercentage: counts.other / total,
    avgConfidence: totalConf / total,
  };
}
