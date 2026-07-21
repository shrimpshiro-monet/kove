/**
 * Replication-focused edit — match the reference's structure exactly.
 *
 * Reference structure (14s, 11 shots):
 *   0.50s → 2.27s → 0.43s → 0.67s → 1.60s → 0.43s → 2.27s → 0.43s → 0.67s → 1.53s → 3.07s
 *
 * Transitions: flash frames between cuts (white flash)
 * Color: contrast +1.2, saturation +1.15
 */
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";
const OUTPUT = "/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output";

// Reference shot durations (exact match)
const REF_SHOTS = [0.50, 2.27, 0.43, 0.67, 1.60, 0.43, 2.27, 0.43, 0.67, 1.53, 3.07];

async function main() {
  console.log("═══ Replicating Reference Edit ═══\n");

  // Step 1: Analyze raw footage for best segments
  console.log("Analyzing footage...");
  const cv = await extractCVMetrics(RAW, 2.0);

  // Step 2: Pick best segments for each reference shot duration
  console.log("Selecting segments...\n");

  const usedRanges: Array<[number, number]> = [];
  const selectedShots: Array<{
    inPoint: number;
    duration: number;
    score: number;
    refIndex: number;
  }> = [];

  for (let i = 0; i < REF_SHOTS.length; i++) {
    const targetDur = REF_SHOTS[i];

    // Find best unused segment with matching duration
    let bestSeg = null;
    let bestScore = -1;

    for (const seg of cv.segments) {
      const segDur = seg.endTime - seg.startTime;
      if (segDur < targetDur * 0.5) continue;

      // Check not overlapping with used segments
      const overlaps = usedRanges.some(([s, e]) =>
        seg.startTime < e && seg.endTime > s
      );
      if (overlaps) continue;

      // Score based on motion + quality
      const score = seg.motionScore * 0.5 + seg.overallQuality * 0.3 + seg.blurScore * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestSeg = seg;
      }
    }

    if (bestSeg) {
      const inPoint = bestSeg.startTime;
      usedRanges.push([inPoint, inPoint + targetDur]);
      selectedShots.push({
        inPoint,
        duration: targetDur,
        score: bestScore,
        refIndex: i,
      });
      console.log(`  Shot ${i + 1}: ${inPoint.toFixed(1)}s (${targetDur.toFixed(2)}s) score=${bestScore.toFixed(2)}`);
    }
  }

  // Step 3: Build video with flash transitions
  console.log("\nBuilding video...");

  const tmpDir = "/tmp/jalebi-replicate";
  await fs.mkdir(tmpDir, { recursive: true });

  const segmentFiles: string[] = [];
  const FLASH_DURATION = 0.05; // 50ms white flash

  for (let i = 0; i < selectedShots.length; i++) {
    const shot = selectedShots[i];

    // Extract the segment
    const segPath = path.join(tmpDir, `shot_${i}.mp4`);
    await execFileAsync("ffmpeg", [
      "-ss", String(shot.inPoint),
      "-i", RAW,
      "-t", String(shot.duration),
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-ac", "2",
      "-y", segPath,
    ], { timeout: 30000 });

    segmentFiles.push(segPath);

    // Add white flash frame before each cut (except first)
    if (i > 0) {
      const flashPath = path.join(tmpDir, `flash_${i}.mp4`);
      // Get video dimensions from first frame
      const { stdout: dims } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        segmentFiles[0],
      ], { timeout: 5000 });
      const [w, h] = dims.trim().split(",").map(Number);

      // Create white flash frame
      await execFileAsync("ffmpeg", [
        "-f", "lavfi",
        "-i", `color=c=white:s=${w || 1280}x${h || 720}:d=${FLASH_DURATION}:r=30`,
        "-f", "lavfi",
        "-i", `anullsrc=r=44100:cl=stereo`,
        "-t", String(FLASH_DURATION),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-y", flashPath,
      ], { timeout: 10000 });

      segmentFiles.push(flashPath);
    }
  }

  // Step 4: Concat all segments + flashes
  console.log("Concatenating...");
  const concatList = path.join(tmpDir, "concat.txt");
  await fs.writeFile(concatList, segmentFiles.map(f => `file '${f}'`).join("\n"));

  const rawConcatPath = path.join(tmpDir, "raw_concat.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "concat",
    "-safe", "0",
    "-i", concatList,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y", rawConcatPath,
  ], { timeout: 60000 });

  // Step 5: Apply color grading (match reference)
  console.log("Applying color grade...");
  const outputPath = path.join(OUTPUT, "steph-curry-replicate.mp4");
  await execFileAsync("ffmpeg", [
    "-i", rawConcatPath,
    "-vf", "eq=contrast=1.2:saturation=1.15:brightness=0.02",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "copy",
    "-y", outputPath,
  ], { timeout: 60000 });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  // Get output info
  const { stdout: info } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size",
    "-of", "csv=p=0",
    outputPath,
  ], { timeout: 5000 });
  const [dur, size] = info.trim().split(",");

  console.log(`\n═══ RESULT ═══`);
  console.log(`Output: ${outputPath}`);
  console.log(`Duration: ${dur}s`);
  console.log(`Size: ${(parseInt(size) / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Shots: ${selectedShots.length}`);
  console.log(`Flash frames: ${selectedShots.length - 1}`);
  console.log(`Color: contrast=1.2 saturation=1.15`);
}

main().catch(console.error);
