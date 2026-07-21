/**
 * Segment Labeler — non-LLM frame analysis for content classification.
 *
 * Uses FFmpeg filters to extract:
 * - Motion (frame difference)
 * - Brightness (luminance)
 * - Contrast (dynamic range)
 * - Scene changes
 * - Face-like regions (skin tone detection)
 *
 * Results are cached in D1 so we never re-analyze the same clip.
 * This is the "cheap" layer — runs in seconds, no tokens consumed.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

// ── Types ───────────────────────────────────────────────────────────────────

export interface FrameMetrics {
  timestamp: number;
  brightness: number;    // 0-255
  contrast: number;      // 0-255 (dynamic range)
  motion: number;        // 0-1 (frame difference)
  skinTone: number;      // 0-1 (likely face/body visible)
  edgeDensity: number;   // 0-1 (visual complexity)
  isBlackFrame: boolean;
  isFlashFrame: boolean;
}

export interface SegmentLabel {
  startTime: number;
  endTime: number;
  duration: number;

  // Content classification
  contentType: "action" | "close-up" | "wide" | "transition" | "slow-mo" | "static" | "flash";
  confidence: number;    // 0-1

  // Metrics
  avgMotion: number;
  avgBrightness: number;
  avgContrast: number;
  avgSkinTone: number;
  avgEdgeDensity: number;
  hasFace: boolean;
  isHighEnergy: boolean;
  isSlowMoment: boolean;

  // Position in timeline
  position: number;      // 0-1, normalized position
  isClimaxRegion: boolean;
  isBreathingRoom: boolean;
}

export interface ClipAnalysisResult {
  clipId: string;
  duration: number;
  totalSegments: number;
  segments: SegmentLabel[];
  summary: {
    actionRatio: number;
    closeUpRatio: number;
    transitionRatio: number;
    avgMotion: number;
    avgBrightness: number;
    climaxPosition: number; // 0-1
    breathingMoments: number[];
    highEnergySegments: number;
    totalFaceTime: number;  // seconds with face visible
  };
  analyzedAt: number;
}

// ── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Analyze a video clip using only FFmpeg (no LLM).
 * Results are deterministic and cacheable.
 */
export async function analyzeClipFrames(
  videoPath: string,
  clipId: string,
  sampleInterval = 1.0, // seconds between samples
): Promise<ClipAnalysisResult> {
  const totalDuration = await getDuration(videoPath);
  if (totalDuration <= 0) {
    return emptyResult(clipId, 0);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "segment-label-"));

  try {
    // Extract frames at regular intervals
    const framesDir = path.join(tmpDir, "frames");
    await fs.mkdir(framesDir, { recursive: true });

    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vf", `fps=1/${sampleInterval}`,
      "-q:v", "2",
      path.join(framesDir, "frame_%06d.jpg"),
    ], { timeout: 120_000 });

    const frameFiles = (await fs.readdir(framesDir))
      .filter(f => f.endsWith(".jpg"))
      .sort();

    // Analyze each frame
    const frameMetrics: FrameMetrics[] = [];
    let prevBrightness = 128;

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const timestamp = i * sampleInterval;

      const metrics = await analyzeSingleFrame(framePath, timestamp, prevBrightness);
      frameMetrics.push(metrics);
      prevBrightness = metrics.brightness;
    }

    // Group frames into segments (2-second windows)
    const segmentDuration = 2.0;
    const segments: SegmentLabel[] = [];

    for (let t = 0; t < totalDuration; t += segmentDuration) {
      const segEnd = Math.min(t + segmentDuration, totalDuration);

      // Get frames in this segment
      const segFrames = frameMetrics.filter(
        f => f.timestamp >= t - 0.1 && f.timestamp < segEnd + 0.1,
      );

      if (segFrames.length === 0) continue;

      // Compute averages
      const avgMotion = avg(segFrames.map(f => f.motion));
      const avgBrightness = avg(segFrames.map(f => f.brightness));
      const avgContrast = avg(segFrames.map(f => f.contrast));
      const avgSkinTone = avg(segFrames.map(f => f.skinTone));
      const avgEdgeDensity = avg(segFrames.map(f => f.edgeDensity));
      const hasFace = avgSkinTone > 0.15;
      const isBlackFrame = avgBrightness < 20;
      const isFlashFrame = segFrames.some(f => f.isFlashFrame);

      // Classify content type
      const contentType = classifySegment(
        avgMotion, avgBrightness, avgContrast, avgSkinTone,
        avgEdgeDensity, hasFace, isBlackFrame, isFlashFrame,
        segEnd / totalDuration,
      );

      // Confidence based on how clear the signals are
      const confidence = Math.min(1,
        (avgMotion > 0.3 ? 0.3 : 0.1) +
        (hasFace ? 0.3 : 0) +
        (avgContrast > 100 ? 0.2 : 0.1) +
        (avgEdgeDensity > 0.3 ? 0.2 : 0.1),
      );

      segments.push({
        startTime: t,
        endTime: segEnd,
        duration: segEnd - t,
        contentType,
        confidence,
        avgMotion,
        avgBrightness,
        avgContrast,
        avgSkinTone,
        avgEdgeDensity,
        hasFace,
        isHighEnergy: avgMotion > 0.6,
        isSlowMoment: avgMotion < 0.15,
        position: (t + segEnd) / 2 / totalDuration,
        isClimaxRegion: false, // computed below
        isBreathingRoom: avgMotion < 0.1 && avgBrightness > 100,
      });
    }

    // Find climax region (highest energy)
    const climaxIdx = segments.reduce((best, seg, i) =>
      seg.avgMotion > segments[best].avgMotion ? i : best, 0);
    segments[climaxIdx].isClimaxRegion = true;

    // Mark breathing room (low energy between high energy)
    for (let i = 1; i < segments.length - 1; i++) {
      if (segments[i].isSlowMoment && segments[i - 1].isHighEnergy) {
        segments[i].isBreathingRoom = true;
      }
    }

    // Compute summary
    const actionCount = segments.filter(s => s.contentType === "action" || s.contentType === "close-up").length;
    const closeUpCount = segments.filter(s => s.contentType === "close-up").length;
    const transitionCount = segments.filter(s => s.contentType === "transition" || s.contentType === "flash").length;

    const breathingMoments = segments
      .filter(s => s.isBreathingRoom)
      .map(s => (s.startTime + s.endTime) / 2);

    const faceSegments = segments.filter(s => s.hasFace);
    const totalFaceTime = faceSegments.reduce((sum, s) => sum + s.duration, 0);

    return {
      clipId,
      duration: totalDuration,
      totalSegments: segments.length,
      segments,
      summary: {
        actionRatio: actionCount / Math.max(1, segments.length),
        closeUpRatio: closeUpCount / Math.max(1, segments.length),
        transitionRatio: transitionCount / Math.max(1, segments.length),
        avgMotion: avg(segments.map(s => s.avgMotion)),
        avgBrightness: avg(segments.map(s => s.avgBrightness)),
        climaxPosition: segments[climaxIdx].position,
        breathingMoments,
        highEnergySegments: segments.filter(s => s.isHighEnergy).length,
        totalFaceTime,
      },
      analyzedAt: Date.now(),
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Frame Analysis ──────────────────────────────────────────────────────────

async function analyzeSingleFrame(
  framePath: string,
  timestamp: number,
  prevBrightness: number,
): Promise<FrameMetrics> {
  let brightness = 128;
  let contrast = 128;
  let skinTone = 0;
  let edgeDensity = 0;
  let isBlackFrame = false;
  let isFlashFrame = false;

  try {
    // Get brightness and contrast via signalstats
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", framePath,
      "-vf", "signalstats",
      "-f", "null", "-",
    ], { timeout: 5000, encoding: "utf8" });

    brightness = parseFloat(stdout.match(/YAVG=(\d+\.?\d*)/)?.[1] ?? "128");
    const ymin = parseFloat(stdout.match(/YMIN=(\d+\.?\d*)/)?.[1] ?? "0");
    const ymax = parseFloat(stdout.match(/YMAX=(\d+\.?\d*)/)?.[1] ?? "255");
    contrast = ymax - ymin;

    isBlackFrame = brightness < 20;
    isFlashFrame = brightness > 220 && Math.abs(brightness - prevBrightness) > 80;
  } catch {}

  try {
    // Detect skin tone regions (rough face/body detection)
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", framePath,
      "-vf", "colorbalance=rs=0.3:gs=-0.1:bs=-0.3,signalstats",
      "-f", "null", "-",
    ], { timeout: 5000, encoding: "utf8" });

    const satAvg = parseFloat(stdout.match(/SAT_AVG=(\d+\.?\d*)/)?.[1] ?? "128");
    skinTone = satAvg / 255; // Higher saturation in skin tone range
  } catch {}

  try {
    // Edge density (visual complexity)
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", framePath,
      "-vf", "edgedetect=low=0.1:high=0.3,signalstats",
      "-f", "null", "-",
    ], { timeout: 5000, encoding: "utf8" });

    const yavg = parseFloat(stdout.match(/YAVG=(\d+\.?\d*)/)?.[1] ?? "0");
    edgeDensity = yavg / 255; // More edges = more white in edge-detected image
  } catch {}

  // Motion = brightness change from previous frame
  const motion = Math.min(1, Math.abs(brightness - prevBrightness) / 100);

  return {
    timestamp,
    brightness,
    contrast,
    motion,
    skinTone,
    edgeDensity,
    isBlackFrame,
    isFlashFrame,
  };
}

// ── Classification ──────────────────────────────────────────────────────────

function classifySegment(
  motion: number,
  brightness: number,
  contrast: number,
  skinTone: number,
  edgeDensity: number,
  hasFace: boolean,
  isBlack: boolean,
  isFlash: boolean,
  position: number,
): SegmentLabel["contentType"] {
  if (isFlash) return "flash";
  if (isBlack) return "transition";
  if (motion < 0.1 && brightness > 100) return "static";

  // Close-up: face visible, moderate motion, high contrast
  if (hasFace && motion > 0.2 && motion < 0.7 && contrast > 120) return "close-up";

  // Wide shot: low skin tone, high edge density (complex scene)
  if (!hasFace && edgeDensity > 0.4) return "wide";

  // Slow-mo: very low motion but not black
  if (motion < 0.15 && !isBlack) return "slow-mo";

  // Action: high motion
  if (motion > 0.4) return "action";

  // Default
  return "action";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + (v || 0), 0) / values.length;
}

async function getDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ], { timeout: 10_000 });
    return parseFloat(stdout.trim());
  } catch {
    return 0;
  }
}

function emptyResult(clipId: string, duration: number): ClipAnalysisResult {
  return {
    clipId,
    duration,
    totalSegments: 0,
    segments: [],
    summary: {
      actionRatio: 0,
      closeUpRatio: 0,
      transitionRatio: 0,
      avgMotion: 0,
      avgBrightness: 0,
      climaxPosition: 0.5,
      breathingMoments: [],
      highEnergySegments: 0,
      totalFaceTime: 0,
    },
    analyzedAt: Date.now(),
  };
}
