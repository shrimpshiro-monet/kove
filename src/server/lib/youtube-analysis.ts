/**
 * YouTube Video Analysis via FFmpeg
 *
 * Downloads YouTube videos using yt-dlp and runs real FFmpeg analysis
 * (scene detection + energy calculation) on them. This replaces the
 * Gemini-only analysis for YouTube references with ground-truth data.
 *
 * Requirements:
 * - yt-dlp must be installed: `brew install yt-dlp`
 * - FFmpeg must be installed: `brew install ffmpeg`
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface YouTubeAnalysisResult {
  videoPath: string;
  duration: number;
  title: string;
  thumbnail: string;
  scenes: Array<{ timestamp: number; score: number }>;
  shotDurations: number[];
  avgShotDuration: number;
  energyCurve: number[];
  climaxPosition: number;
  breathingMoments: number[];
  fps: number;
  resolution: { width: number; height: number };
}

/**
 * Download and analyze a YouTube video with FFmpeg.
 *
 * @param url - YouTube video URL
 * @param outputDir - Directory to save the downloaded video
 * @param maxDuration - Maximum duration to download (seconds). Default 300 (5 min).
 *   For longer videos, only the first N seconds are analyzed.
 */
export async function analyzeYouTubeVideo(
  url: string,
  outputDir?: string,
  maxDuration = 300
): Promise<YouTubeAnalysisResult> {
  const tmpDir = outputDir ?? await fs.mkdtemp(path.join(os.tmpdir(), "yt-analysis-"));
  const videoPath = path.join(tmpDir, "video.mp4");

  try {
    // Step 1: Download video
    console.info(`[yt-analysis] Downloading: ${url}`);
    await downloadYouTubeVideo(url, videoPath, maxDuration);

    // Step 2: Get video metadata
    const metadata = await getVideoMetadata(videoPath);

    // Step 3: Run scene detection
    console.info(`[yt-analysis] Detecting scene changes...`);
    const scenes = await detectScenes(videoPath);

    // Step 4: Calculate energy curve
    console.info(`[yt-analysis] Calculating energy curve...`);
    const energy = await calculateEnergy(videoPath);

    // Step 5: Find climax and breathing moments
    const climaxPosition = findClimaxPosition(energy, metadata.duration);
    const breathingMoments = findBreathingMoments(energy, metadata.duration);

    // Calculate shot durations
    const shotDurations = calculateShotDurations(scenes, metadata.duration);
    const avgShotDuration = shotDurations.length > 0
      ? shotDurations.reduce((a, b) => a + b, 0) / shotDurations.length
      : metadata.duration;

    return {
      videoPath,
      duration: metadata.duration,
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      scenes,
      shotDurations,
      avgShotDuration,
      energyCurve: buildEnergyCurve(energy, metadata.duration),
      climaxPosition,
      breathingMoments,
      fps: metadata.fps,
      resolution: metadata.resolution,
    };
  } catch (error) {
    // Clean up on failure
    if (!outputDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

// ─── YouTube Download ─────────────────────────────────────────────

async function downloadYouTubeVideo(
  url: string,
  outputPath: string,
  maxDuration: number
): Promise<void> {
  const args = [
    url,
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-playlist",
    "--max-filesize", "500M",
    // Limit duration
    "--download-sections", `*0-${maxDuration}`,
    // Embed metadata
    "--write-info-json",
    "--write-thumbnail",
  ];

  try {
    await execFileAsync("yt-dlp", args, { timeout: 300_000 });
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      throw new Error(
        "yt-dlp is not installed. Install it with: brew install yt-dlp"
      );
    }
    throw new Error(`Failed to download YouTube video: ${err.message}`);
  }
}

async function getVideoMetadata(videoPath: string): Promise<{
  duration: number;
  title: string;
  thumbnail: string;
  fps: number;
  resolution: { width: number; height: number };
}> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ], { timeout: 30_000 });

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === "video");

    return {
      duration: parseFloat(data.format?.duration ?? "0"),
      title: data.format?.tags?.title ?? path.basename(videoPath, ".mp4"),
      thumbnail: "", // Would need to extract from video
      fps: parseFps(videoStream?.r_frame_rate ?? "30/1"),
      resolution: {
        width: parseInt(videoStream?.width ?? "1920"),
        height: parseInt(videoStream?.height ?? "1080"),
      },
    };
  } catch {
    return {
      duration: 0,
      title: path.basename(videoPath, ".mp4"),
      thumbnail: "",
      fps: 30,
      resolution: { width: 1920, height: 1080 },
    };
  }
}

function parseFps(fpsStr: string): number {
  const parts = fpsStr.split("/");
  if (parts.length === 2) {
    const num = parseInt(parts[0]);
    const den = parseInt(parts[1]);
    return den > 0 ? num / den : 30;
  }
  return parseFloat(fpsStr) || 30;
}

// ─── Scene Detection ──────────────────────────────────────────────

async function detectScenes(
  videoPath: string,
  threshold = 0.3
): Promise<Array<{ timestamp: number; score: number }>> {
  const scenes: Array<{ timestamp: number; score: number }> = [];

  try {
    let stderr = "";
    try {
      const result = await execFileAsync("ffmpeg", [
        "-i", videoPath,
        "-vf", `select='gt(scene,${threshold})',showinfo`,
        "-vsync", "vfr",
        "-f", "null",
        "-"
      ], { timeout: 300_000 });
      stderr = result.stderr ?? "";
    } catch (err: any) {
      stderr = err.stderr ?? err.stdout ?? "";
      if (!stderr) throw err;
    }

    // Parse timestamps from showinfo output
    const regex = /pts_time:\s*([\d.]+)/g;
    let match;
    while ((match = regex.exec(stderr)) !== null) {
      const ts = parseFloat(match[1]);
      if (!isNaN(ts) && ts >= 0) {
        scenes.push({ timestamp: ts, score: 0.5 });
      }
    }

    // Deduplicate
    return deduplicateScenes(scenes);
  } catch (err) {
    console.warn("[yt-analysis] Scene detection failed:", err);
    return [];
  }
}

function deduplicateScenes(
  scenes: Array<{ timestamp: number; score: number }>
): Array<{ timestamp: number; score: number }> {
  const sorted = [...scenes].sort((a, b) => a.timestamp - b.timestamp);
  const deduped: Array<{ timestamp: number; score: number }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp - deduped[deduped.length - 1].timestamp >= 0.05) {
      deduped.push(sorted[i]);
    }
  }

  return deduped;
}

// ─── Energy Analysis ──────────────────────────────────────────────

async function calculateEnergy(
  videoPath: string,
  interval = 0.5
): Promise<Array<{ timestamp: number; value: number }>> {
  const energy: Array<{ timestamp: number; value: number }> = [];
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-energy-"));

  try {
    // Extract frames
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vf", `fps=1/${interval},format=gray`,
      "-q:v", "2",
      path.join(tmpDir, "frame_%06d.png"),
    ], { timeout: 300_000 });

    const files = (await fs.readdir(tmpDir)).filter(f => f.endsWith(".png")).sort();
    let prevData: Uint8Array | null = null;

    for (let i = 0; i < files.length; i++) {
      const buffer = await fs.readFile(path.join(tmpDir, files[i]));
      const data = new Uint8Array(buffer);

      // Calculate brightness (average of sampled bytes)
      let brightness = 0;
      const step = Math.max(1, Math.floor(data.length / 5000));
      let count = 0;
      for (let j = 0; j < data.length; j += step) {
        brightness += data[j];
        count++;
      }
      brightness = count > 0 ? brightness / count / 255 : 0.5;

      // Calculate motion (difference from previous frame)
      let motion = 0;
      if (prevData && prevData.length === data.length) {
        let diff = 0;
        const mStep = Math.max(1, Math.floor(data.length / 5000));
        let mCount = 0;
        for (let j = 0; j < data.length; j += mStep) {
          diff += Math.abs(data[j] - prevData[j]);
          mCount++;
        }
        motion = mCount > 0 ? Math.min(1, (diff / mCount) / 128) : 0;
      }

      const combined = Math.min(1, motion * 0.65 + brightness * 0.35);
      energy.push({ timestamp: i * interval, value: combined });

      prevData = data;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return energy;
}

function buildEnergyCurve(
  energy: Array<{ timestamp: number; value: number }>,
  duration: number
): number[] {
  if (energy.length === 0 || duration <= 0) {
    return new Array(10).fill(0.5);
  }

  const bucketSize = duration / 10;
  const curve: number[] = [];

  for (let bucket = 0; bucket < 10; bucket++) {
    const start = bucket * bucketSize;
    const end = start + bucketSize;
    const bucketEnergy = energy.filter(e => e.timestamp >= start && e.timestamp < end);

    if (bucketEnergy.length > 0) {
      const avg = bucketEnergy.reduce((s, e) => s + e.value, 0) / bucketEnergy.length;
      curve.push(Math.round(avg * 100) / 100);
    } else {
      curve.push(curve.length > 0 ? curve[curve.length - 1] : 0.5);
    }
  }

  return curve;
}

function findClimaxPosition(
  energy: Array<{ timestamp: number; value: number }>,
  duration: number
): number {
  if (energy.length === 0 || duration <= 0) return 0.65;

  // Find the peak energy moment
  let maxIdx = 0;
  for (let i = 1; i < energy.length; i++) {
    if (energy[i].value > energy[maxIdx].value) {
      maxIdx = i;
    }
  }

  return duration > 0 ? energy[maxIdx].timestamp / duration : 0.65;
}

function findBreathingMoments(
  energy: Array<{ timestamp: number; value: number }>,
  duration: number
): number[] {
  if (energy.length < 5) return [];

  const breathing: number[] = [];
  const windowSize = 3;

  for (let i = windowSize; i < energy.length - windowSize; i++) {
    const current = energy[i].value;
    const before = energy.slice(i - windowSize, i).reduce((s, e) => s + e.value, 0) / windowSize;
    const after = energy.slice(i + 1, i + windowSize + 1).reduce((s, e) => s + e.value, 0) / windowSize;

    if (current < before * 0.7 && current < after * 0.7 && current < 0.4) {
      breathing.push(energy[i].timestamp);
    }
  }

  // Deduplicate within 2 seconds
  return deduplicateTimestamps(breathing, 2.0);
}

function deduplicateTimestamps(timestamps: number[], minGap: number): number[] {
  if (timestamps.length === 0) return [];
  const sorted = [...timestamps].sort((a, b) => a - b);
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - result[result.length - 1] >= minGap) {
      result.push(sorted[i]);
    }
  }
  return result;
}

function calculateShotDurations(
  scenes: Array<{ timestamp: number; score: number }>,
  duration: number
): number[] {
  const durations: number[] = [];
  let prevTime = 0;

  for (const scene of scenes) {
    const dur = scene.timestamp - prevTime;
    if (dur > 0.01) durations.push(dur);
    prevTime = scene.timestamp;
  }

  const finalDur = duration - prevTime;
  if (finalDur > 0.01) durations.push(finalDur);

  return durations;
}
