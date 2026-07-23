/**
 * MikeRoss x 21 Savage — PROPER EDIT
 * 15s max, song audio, text overlays, effects, dark grade
 */
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const VID = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/MikeRoss.mp4";
const SONG = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/audio/21 Savage - a lot ft. J. Cole.mp3";
const OUTPUT = "/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output";

async function main() {
  console.log("═══ MIKE ROSS × 21 SAVAGE — PROPER ═══\n");

  // 1. Analyze video
  const cv = await extractCVMetrics(VID, 2.0);
  console.log(`Video: ${cv.totalDuration.toFixed(0)}s, ${cv.segments.length} segments`);

  // 2. Pick TOP 8 best moments (for 15s edit)
  const sorted = [...cv.segments]
    .filter(s => !s.isBlackFrame && !s.isStaticFrame)
    .sort((a, b) => {
      const sA = a.motionScore * 0.5 + a.overallQuality * 0.3 + a.blurScore * 0.2;
      const sB = b.motionScore * 0.5 + b.overallQuality * 0.3 + b.blurScore * 0.2;
      return sB - sA;
    });

  const BEST_COUNT = 8;
  const selected = sorted.slice(0, BEST_COUNT)
    .sort((a, b) => a.startTime - b.startTime);

  console.log(`\nSelected ${selected.length} moments:`);
  for (const seg of selected) {
    console.log(`  ${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s (motion=${seg.motionScore.toFixed(2)})`);
  }

  // 3. Build segments (1.5-2s each for 15s total)
  const TARGET = 15;
  const SHOT_DUR = TARGET / selected.length;

  const tmpDir = "/tmp/jalebi-proper";
  await fs.mkdir(tmpDir, { recursive: true });

  const segFiles: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const seg = selected[i];
    const inPt = seg.startTime;
    const segPath = path.join(tmpDir, `s${i}.mp4`);

    // Speed ramp: fast in, normal, fast out
    const speedFilter = i % 2 === 0
      ? ["-vf", "setpts=PTS*0.7"]  // speed up 30%
      : []; // normal speed on alternate shots

    await execFileAsync("ffmpeg", [
      "-ss", String(inPt), "-i", VID, "-t", String(SHOT_DUR),
      ...speedFilter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-y", segPath,
    ], { timeout: 30000 });

    segFiles.push(segPath);

    // Flash cut between shots
    if (i > 0) {
      const flashPath = path.join(tmpDir, `f${i}.mp4`);
      const { stdout: dims } = await execFileAsync("ffprobe", [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0",
        segFiles[0],
      ], { timeout: 5000 });
      const [w, h] = dims.trim().split(",").map(Number);

      await execFileAsync("ffmpeg", [
        "-f", "lavfi", "-i", `color=c=0x111111:s=${w||1280}x${h||720}:d=0.06:r=30`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", "0.06", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-shortest", "-y", flashPath,
      ], { timeout: 10000 });

      segFiles.push(flashPath);
    }
  }

  // 4. Concat video (no audio yet)
  console.log("\nConcatenating...");
  const concatList = path.join(tmpDir, "concat.txt");
  await fs.writeFile(concatList, segFiles.map(f => `file '${f}'`).join("\n"));

  const vidOnlyPath = path.join(tmpDir, "vid_only.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "concat", "-safe", "0", "-i", concatList,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-an",  // NO audio from video
    "-y", vidOnlyPath,
  ], { timeout: 60000 });

  // 5. Mix with SONG audio (take 15s from the chorus section ~56s in)
  console.log("Mixing with song audio...");
  const SONG_START = 56; // chorus start in the song
  const audioMixPath = path.join(tmpDir, "with_audio.mp4");
  await execFileAsync("ffmpeg", [
    "-i", vidOnlyPath,
    "-ss", String(SONG_START), "-t", String(TARGET), "-i", SONG,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    "-y", audioMixPath,
  ], { timeout: 30000 });

  // 6. Dark moody color grade
  console.log("Color grading...");
  const gradedPath = path.join(tmpDir, "graded.mp4");
  await execFileAsync("ffmpeg", [
    "-i", audioMixPath,
    "-vf", "eq=contrast=1.4:saturation=0.7:brightness=-0.05:gamma=0.85",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "copy",
    "-y", gradedPath,
  ], { timeout: 60000 });

  // 7. Add text overlays (song lyrics / theme)
  // Since drawtext isn't available, use overlay approach with generated frames
  // Instead: export the final with a title card at the beginning
  console.log("Adding title card + final export...");

  // Create 1s black intro with song building up
  const introPath = path.join(tmpDir, "intro.mp4");
  const { stdout: dims } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0",
    gradedPath,
  ], { timeout: 5000 });
  const [vw, vh] = dims.trim().split(",").map(Number);

  // 1s of dark intro with song
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", `color=c=0x0a0a0a:s=${vw||1280}x${vh||720}:d=1:r=30`,
    "-ss", String(SONG_START - 1), "-t", "1", "-i", SONG,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest", "-y", introPath,
  ], { timeout: 10000 });

  // Final concat: intro + main edit
  const finalList = path.join(tmpDir, "final.txt");
  await fs.writeFile(finalList, `file '${introPath}'\nfile '${gradedPath}'`);

  const outputPath = path.join(OUTPUT, "mikeross-x-21savage-v2.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "concat", "-safe", "0", "-i", finalList,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-y", outputPath,
  ], { timeout: 60000 });

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const { stdout: info } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration,size",
    "-of", "csv=p=0", outputPath,
  ], { timeout: 5000 });
  const [dur, size] = info.trim().split(",");

  console.log(`\n═══ RESULT ═══`);
  console.log(`Output: ${outputPath}`);
  console.log(`Duration: ${dur}s`);
  console.log(`Size: ${(parseInt(size)/1024/1024).toFixed(1)}MB`);
  console.log(`Song: 21 Savage (chorus section, ${SONG_START}s in)`);
}

main().catch(console.error);
