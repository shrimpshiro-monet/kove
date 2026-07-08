/**
 * Real scene change detection using FFmpeg.
 *
 * Extracts actual cut timestamps from video files by analyzing
 * frame-to-frame visual differences. This replaces the mock trace
 * generator with ground-truth data.
 *
 * Works in Node.js environments (Fastify API, worker-node).
 * For Cloudflare Workers, pre-extract frames or use the LLM fallback.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface SceneChange {
  timestamp: number;
  score: number;
}

export interface SceneDetectionResult {
  scenes: SceneChange[];
  shotCount: number;
  avgShotDuration: number;
  shotDurations: number[];
  totalDuration: number;
  cutFrequency: number;
}

/**
 * Detect scene changes in a video file using FFmpeg's scene filter.
 *
 * @param videoPath - Path to the video file on disk
 * @param threshold - Scene change sensitivity (0.0-1.0, default 0.3).
 *   Lower = more sensitive (detects subtle cuts).
 *   0.3 works well for most edited content.
 *   0.2 for fast-paced edits (AMVs, sports).
 *   0.4 for slower content (cinematic, documentary).
 */
export async function detectSceneChanges(
  videoPath: string,
  threshold = 0.3
): Promise<SceneDetectionResult> {
  // Validate file exists
  try {
    await fs.access(videoPath);
  } catch {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Step 1: Get video duration
  const totalDuration = await getVideoDuration(videoPath);

  // Step 2: Run FFmpeg scene detection
  // Using select filter with scene score output
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scene-detect-"));
  const scoresPath = path.join(tmpDir, "scene_scores.txt");

  try {
    const args = [
      "-i", videoPath,
      "-vf", `select='gt(scene,${threshold})',showinfo`,
      "-vsync", "vfr",
      "-f", "null",
      "-"
    ];

    // FFmpeg writes to stderr — capture it regardless of exit code
    let stderr = "";
    try {
      const result = await execFileAsync("ffmpeg", args, { timeout: 120_000 });
      stderr = result.stderr ?? "";
    } catch (err: any) {
      // FFmpeg often exits non-zero when processing finishes or with -f null
      stderr = err.stderr ?? err.stdout ?? "";
      if (!stderr) throw err;
    }

    // Parse scene change timestamps from showinfo output
    const scenes = parseSceneScores(stderr, totalDuration);

    // Step 3: Calculate shot durations between cuts (merge short shots)
    const { durations: shotDurations, mergedScenes } = calculateShotDurations(scenes, totalDuration);
    const avgShotDuration = shotDurations.length > 0
      ? shotDurations.reduce((a, b) => a + b, 0) / shotDurations.length
      : totalDuration;

    return {
      scenes: mergedScenes,
      shotCount: mergedScenes.length + 1,
      avgShotDuration,
      shotDurations,
      totalDuration,
      cutFrequency: totalDuration > 0 ? mergedScenes.length / totalDuration : 0,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Detect scene changes from a buffer (for environments without file access).
 * Writes to a temp file, analyzes, then cleans up.
 */
export async function detectSceneChangesFromBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  threshold = 0.3
): Promise<SceneDetectionResult> {
  const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scene-buf-"));
  const tmpPath = path.join(tmpDir, `input${ext}`);

  try {
    await fs.writeFile(tmpPath, Buffer.from(buffer));
    return await detectSceneChanges(tmpPath, threshold);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Get video duration in seconds using ffprobe.
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ], { timeout: 30_000 });

    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch {
    return 0;
  }
}

/**
 * Parse FFmpeg showinfo output to extract scene change timestamps and scores.
 *
 * FFmpeg's scene detection outputs lines like:
 *   [Parsed_showinfo_1 ...] n:   0 pts:  1234 pts_time: 1.234 ...
 *   [Parsed_select_0 ...] scene:0.456
 *
 * We parse the scene scores from the select filter's print format.
 */
function parseSceneScores(ffmpegOutput: string, totalDuration: number): SceneChange[] {
  const scenes: SceneChange[] = [];

  // Method 1: Parse pts_time from showinfo lines
  const showinfoRegex = /pts_time:\s*([\d.]+)/g;
  const timestamps: number[] = [];
  let match;
  while ((match = showinfoRegex.exec(ffmpegOutput)) !== null) {
    const ts = parseFloat(match[1]);
    if (!isNaN(ts) && ts >= 0 && ts <= totalDuration + 1) {
      timestamps.push(ts);
    }
  }

  // Method 2: Also try to parse scene scores directly
  const sceneRegex = /scene:([\d.]+)/g;
  const scores: number[] = [];
  while ((match = sceneRegex.exec(ffmpegOutput)) !== null) {
    const score = parseFloat(match[1]);
    if (!isNaN(score)) {
      scores.push(score);
    }
  }

  // Combine timestamps with scores
  for (let i = 0; i < timestamps.length; i++) {
    scenes.push({
      timestamp: timestamps[i],
      score: scores[i] ?? 0.5, // default score if not parsed
    });
  }

  // Deduplicate timestamps within 50ms of each other (perception threshold)
  return deduplicateScenes(scenes);
}

/**
 * Remove scene changes that are too close together.
 * Two cuts within 50ms are likely the same cut or a flash frame.
 */
function deduplicateScenes(scenes: SceneChange[]): SceneChange[] {
  if (scenes.length === 0) return scenes;

  const sorted = [...scenes].sort((a, b) => a.timestamp - b.timestamp);
  const deduped: SceneChange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = deduped[deduped.length - 1];
    if (sorted[i].timestamp - last.timestamp >= 0.05) {
      deduped.push(sorted[i]);
    } else {
      // Keep the one with higher scene score
      if (sorted[i].score > last.score) {
        deduped[deduped.length - 1] = sorted[i];
      }
    }
  }

  return deduped;
}

/**
 * Calculate durations of each shot (time between consecutive cuts).
 * Merges shots shorter than minDuration into adjacent shots.
 */
function calculateShotDurations(
  scenes: SceneChange[],
  totalDuration: number,
  minDuration = 0.3
): { durations: number[]; mergedScenes: SceneChange[] } {
  // Build all segment durations
  const cuts = scenes.map(s => s.timestamp);
  const allTimestamps = [0, ...cuts, totalDuration];

  const durations: number[] = [];
  const mergedTimestamps: number[] = [0];

  for (let i = 1; i < allTimestamps.length; i++) {
    const dur = allTimestamps[i] - allTimestamps[i - 1];
    const lastDur = mergedTimestamps.length > 0
      ? allTimestamps[i] - mergedTimestamps[mergedTimestamps.length - 1]
      : dur;

    // Keep this cut if the accumulated shot since last kept cut is long enough
    if (lastDur >= minDuration) {
      mergedTimestamps.push(allTimestamps[i]);
    }
  }

  // If the last kept timestamp isn't the end, add it
  if (mergedTimestamps[mergedTimestamps.length - 1] !== totalDuration) {
    mergedTimestamps.push(totalDuration);
  }

  for (let i = 1; i < mergedTimestamps.length; i++) {
    durations.push(mergedTimestamps[i] - mergedTimestamps[i - 1]);
  }

  // Rebuild scenes from merged timestamps (exclude 0 and totalDuration)
  const mergedScenes: SceneChange[] = mergedTimestamps
    .slice(1, -1)
    .map((ts, i) => {
      // Find the original scene with highest score at or near this timestamp
      const original = scenes.find(s => Math.abs(s.timestamp - ts) < 0.01);
      return { timestamp: ts, score: original?.score ?? 0.5 };
    });

  return { durations, mergedScenes };
}

/**
 * Extract a thumbnail frame for each detected scene.
 * Returns base64-encoded JPEG thumbnails at shot midpoints.
 */
export async function extractSceneThumbnails(
  videoPath: string,
  scenes: SceneChange[],
  totalDuration: number,
  maxThumbnails = 20
): Promise<Array<{ timestamp: number; thumbnail: string }>> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scene-thumbs-"));
  const thumbsDir = path.join(tmpDir, "thumbs");
  await fs.mkdir(thumbsDir, { recursive: true });

  try {
    // Build list of shot midpoints
    const shots: number[] = [];
    let prev = 0;
    for (const scene of scenes) {
      shots.push((prev + scene.timestamp) / 2);
      prev = scene.timestamp;
    }
    shots.push((prev + totalDuration) / 2);

    // Limit thumbnails
    const step = Math.max(1, Math.floor(shots.length / maxThumbnails));
    const selected = shots.filter((_, i) => i % step === 0).slice(0, maxThumbnails);

    const thumbnails: Array<{ timestamp: number; thumbnail: string }> = [];
    for (let i = 0; i < selected.length; i++) {
      const ts = selected[i];
      const thumbPath = path.join(thumbsDir, `thumb_${i}.jpg`);
      try {
        await execFileAsync("ffmpeg", [
          "-ss", String(ts),
          "-i", videoPath,
          "-frames:v", "1",
          "-vf", "scale=160:-1",
          "-q:v", "5",
          thumbPath,
        ], { timeout: 10_000 });
        const data = await fs.readFile(thumbPath);
        const base64 = data.toString("base64");
        thumbnails.push({ timestamp: ts, thumbnail: `data:image/jpeg;base64,${base64}` });
      } catch { /* skip failed thumbnails */ }
    }

    return thumbnails;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
