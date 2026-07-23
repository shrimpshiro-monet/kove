// Computer-vision metrics for footage quality scoring.
// Uses FFmpeg filters to extract per-segment quality signals.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface SegmentQuality {
  segmentIndex: number;
  startTime: number;
  endTime: number;
  motionScore: number;      // 0-1, higher = more motion
  brightnessScore: number;  // 0-1, higher = better exposed
  blurScore: number;        // 0-1, higher = sharper (less blur)
  sceneChangeScore: number; // 0-1, higher = more dynamic
  overallQuality: number;   // 0-1, weighted composite
  isBlackFrame: boolean;
  isStaticFrame: boolean;
}

export interface CVMetricsResult {
  segments: SegmentQuality[];
  avgMotion: number;
  avgBrightness: number;
  avgSharpness: number;
  peakMoment: number; // timestamp of highest quality segment
  totalDuration: number;
}

/**
 * Extract per-segment quality metrics using FFmpeg filters.
 * Divides video into segments and computes motion, brightness, blur metrics.
 */
export async function extractCVMetrics(
  videoPath: string,
  segmentDuration = 2.0
): Promise<CVMetricsResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-metrics-"));

  try {
    // Get video duration
    const { stdout: durStr } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ], { timeout: 15000 });
    const totalDuration = parseFloat(durStr.trim()) || 0;
    if (totalDuration <= 0) {
      return emptyResult(0);
    }

    // Extract frames at regular intervals for analysis
    const frameInterval = Math.min(segmentDuration / 2, 0.5); // 2 frames per segment
    const framesDir = path.join(tmpDir, "frames");
    await fs.mkdir(framesDir, { recursive: true });

    // Extract frames with signalstats for brightness/saturation
    const framePattern = path.join(framesDir, "frame_%06d.jpg");
    try {
      await execFileAsync("ffmpeg", [
        "-i", videoPath,
        "-vf", `fps=1/${frameInterval},signalstats`,
        "-q:v", "2",
        framePattern,
      ], { timeout: 60000 });
    } catch {
      // Fallback: extract frames without signalstats
      await execFileAsync("ffmpeg", [
        "-i", videoPath,
        "-vf", `fps=1/${frameInterval}`,
        "-q:v", "2",
        framePattern,
      ], { timeout: 60000 });
    }

    // Read extracted frames
    const frameFiles = (await fs.readdir(framesDir))
      .filter(f => f.startsWith("frame_") && f.endsWith(".jpg"))
      .sort();

    if (frameFiles.length === 0) {
      return emptyResult(totalDuration);
    }

    // Analyze each frame using pixel-level metrics
    const frameMetrics: Array<{
      timestamp: number;
      motion: number;
      brightness: number;
      blur: number;
    }> = [];

    for (let i = 0; i < frameFiles.length; i++) {
      const timestamp = i * frameInterval;
      const framePath = path.join(framesDir, frameFiles[i]);

      try {
        const metrics = await analyzeFrame(framePath, i > 0 ? frameMetrics[i - 1] : null);
        frameMetrics.push({ timestamp, ...metrics });
      } catch {
        frameMetrics.push({ timestamp, motion: 0.5, brightness: 0.5, blur: 0.5 });
      }
    }

    // Aggregate into segments
    const segmentCount = Math.ceil(totalDuration / segmentDuration);
    const segments: SegmentQuality[] = [];

    for (let s = 0; s < segmentCount; s++) {
      const segStart = s * segmentDuration;
      const segEnd = Math.min((s + 1) * segmentDuration, totalDuration);

      // Find frames in this segment
      const segFrames = frameMetrics.filter(
        f => f.timestamp >= segStart && f.timestamp < segEnd
      );

      if (segFrames.length === 0) {
        segments.push({
          segmentIndex: s,
          startTime: segStart,
          endTime: segEnd,
          motionScore: 0.5,
          brightnessScore: 0.5,
          blurScore: 0.5,
          sceneChangeScore: 0.5,
          overallQuality: 0.5,
          isBlackFrame: false,
          isStaticFrame: false,
        });
        continue;
      }

      // Aggregate frame metrics for this segment
      const avgMotion = segFrames.reduce((sum, f) => sum + f.motion, 0) / segFrames.length;
      const avgBrightness = segFrames.reduce((sum, f) => sum + f.brightness, 0) / segFrames.length;
      const avgBlur = segFrames.reduce((sum, f) => sum + f.blur, 0) / segFrames.length;

      // Detect scene changes within segment
      let sceneChanges = 0;
      for (let i = 1; i < segFrames.length; i++) {
        const diff = Math.abs(segFrames[i].brightness - segFrames[i - 1].brightness);
        if (diff > 0.15) sceneChanges++;
      }
      const sceneChangeScore = Math.min(1, sceneChanges / Math.max(1, segFrames.length - 1));

      // Detect black/static frames
      const isBlackFrame = avgBrightness < 0.05;
      const isStaticFrame = avgMotion < 0.02;

      // Compute overall quality (higher = better for selection)
      const motionQuality = isStaticFrame ? 0.2 : Math.min(1, (avgMotion || 0) * 1.5);
      const brightnessQuality = isBlackFrame ? 0.1 : 1 - Math.abs((avgBrightness || 0.5) - 0.5) * 2;
      const sharpnessQuality = avgBlur || 0.5;
      const dynamicQuality = sceneChangeScore || 0;

      const overallQuality = (
        (motionQuality || 0) * 0.3 +
        (brightnessQuality || 0) * 0.2 +
        (sharpnessQuality || 0) * 0.25 +
        (dynamicQuality || 0) * 0.25
      );

      segments.push({
        segmentIndex: s,
        startTime: segStart,
        endTime: segEnd,
        motionScore: avgMotion,
        brightnessScore: avgBrightness,
        blurScore: avgBlur,
        sceneChangeScore,
        overallQuality,
        isBlackFrame,
        isStaticFrame,
      });
    }

    // Find peak moment
    const peakSegment = segments.reduce((best, seg) =>
      seg.overallQuality > best.overallQuality ? seg : best
    , segments[0]);

    const avgMotion = segments.reduce((s, seg) => s + seg.motionScore, 0) / segments.length;
    const avgBrightness = segments.reduce((s, seg) => s + seg.brightnessScore, 0) / segments.length;
    const avgSharpness = segments.reduce((s, seg) => s + seg.blurScore, 0) / segments.length;

    return {
      segments,
      avgMotion,
      avgBrightness,
      avgSharpness,
      peakMoment: (peakSegment.startTime + peakSegment.endTime) / 2,
      totalDuration,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Analyze a single frame for quality metrics.
 * Uses FFmpeg's signalstats and pixel analysis.
 */
async function analyzeFrame(
  framePath: string,
  prevFrame: { motion: number; brightness: number; blur: number } | null
): Promise<{ motion: number; brightness: number; blur: number }> {
  // Get frame dimensions and basic stats using ffprobe
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
    framePath,
  ], { timeout: 5000 });

  const [width, height] = stdout.trim().split(",").map(Number);
  if (!width || !height) {
    return { motion: 0.5, brightness: 0.5, blur: 0.5 };
  }

  // Extract raw pixel data for analysis
  const { stdout: pixelData } = await execFileAsync("ffmpeg", [
    "-i", framePath,
    "-f", "rawvideo",
    "-pix_fmt", "gray",
    "-v", "quiet",
    "pipe:1",
  ], { timeout: 5000, maxBuffer: 10 * 1024 * 1024 });

  const pixels = Buffer.from(pixelData, "binary");
  if (pixels.length === 0) {
    return { motion: 0.5, brightness: 0.5, blur: 0.5 };
  }

  // Calculate brightness (average luminance)
  let brightnessSum = 0;
  for (let i = 0; i < pixels.length; i++) {
    brightnessSum += pixels[i];
  }
  const brightness = brightnessSum / pixels.length / 255;

  // Calculate motion (difference from previous frame)
  let motion = 0.5;
  if (prevFrame) {
    // Estimate motion from brightness change
    const brightnessDiff = Math.abs(brightness - prevFrame.brightness);
    motion = Math.min(1, brightnessDiff * 5 + prevFrame.motion * 0.3);
  }

  // Calculate blur (using Laplacian variance approximation)
  // Higher variance = sharper image
  let laplacianSum = 0;
  const w = width;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const center = pixels[idx] * 1;
      const top = pixels[(y - 1) * w + x] * -1;
      const bottom = pixels[(y + 1) * w + x] * -1;
      const left = pixels[y * w + (x - 1)] * -1;
      const right = pixels[y * w + (x + 1)] * -1;
      laplacianSum += Math.abs(center + top + bottom + left + right);
    }
  }
  const laplacianVariance = laplacianSum / ((height - 2) * (w - 2)) / 255;
  const blur = Math.min(1, Math.max(0, laplacianVariance * 10)); // Normalize to 0-1

  return {
    motion: Math.max(0, Math.min(1, motion || 0.5)),
    brightness: Math.max(0, Math.min(1, brightness || 0.5)),
    blur: Math.max(0, Math.min(1, blur || 0.5)),
  };
}

function emptyResult(totalDuration: number): CVMetricsResult {
  return {
    segments: [],
    avgMotion: 0.5,
    avgBrightness: 0.5,
    avgSharpness: 0.5,
    peakMoment: totalDuration / 2,
    totalDuration,
  };
}

/**
 * Score a segment for selection based on pacing class and position.
 * Higher score = better candidate for that position in the edit.
 */
export function scoreSegmentForSelection(
  segment: SegmentQuality,
  pacingClass: "rapid" | "medium" | "cinematic" | "dialogue",
  position: number, // 0-1, position in timeline
  usedSegments: Set<number> = new Set()
): number {
  // Base quality score
  let score = segment.overallQuality;

  // Penalty for black/static frames
  if (segment.isBlackFrame) score *= 0.1;
  if (segment.isStaticFrame) score *= 0.3;

  // Penalty for already-used segments
  if (usedSegments.has(segment.segmentIndex)) {
    score *= 0.5;
  }

  // Pacing-class adjustments
  switch (pacingClass) {
    case "rapid":
      // Prefer high-motion, dynamic segments
      score += segment.motionScore * 0.3;
      score += segment.sceneChangeScore * 0.2;
      break;
    case "cinematic":
      // Prefer well-exposed, sharp segments
      score += segment.blurScore * 0.3; // sharpness
      score += (1 - Math.abs(segment.brightnessScore - 0.5)) * 0.2;
      break;
    case "dialogue":
      // Prefer well-exposed, stable segments
      score += (1 - Math.abs(segment.brightnessScore - 0.5)) * 0.3;
      score += (1 - segment.motionScore) * 0.2; // less motion for dialogue
      break;
    case "medium":
    default:
      // Balanced
      score += segment.motionScore * 0.15;
      score += segment.blurScore * 0.15;
      break;
  }

  // Position-based adjustments
  if (position < 0.15) {
    // Intro: prefer establishing shots (moderate motion, good exposure)
    score += (1 - Math.abs(segment.motionScore - 0.4)) * 0.2;
  } else if (position > 0.6 && position < 0.85) {
    // Peak: prefer high-energy moments
    score += segment.motionScore * 0.3;
    score += segment.sceneChangeScore * 0.2;
  } else if (position > 0.85) {
    // Resolution: prefer calmer moments
    score += (1 - segment.motionScore) * 0.2;
  }

  return Math.max(0, Math.min(1, score));
}
