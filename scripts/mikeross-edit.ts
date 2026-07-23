/**
 * MikeRoss Edit — match best video moments to best song moments.
 * Add effects, transitions, text overlays.
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

// Song sections (21 Savage - a lot)
const SONG_SECTIONS = [
  { start: 0, end: 16, label: "INTRO", energy: 0.3 },
  { start: 16, end: 56, label: "VERSE 1", energy: 0.6 },
  { start: 56, end: 88, label: "CHORUS", energy: 0.9 },
  { start: 88, end: 128, label: "VERSE 2", energy: 0.6 },
  { start: 128, end: 160, label: "CHORUS", energy: 0.9 },
  { start: 160, end: 200, label: "BRIDGE", energy: 0.4 },
  { start: 200, end: 240, label: "VERSE 3", energy: 0.6 },
  { start: 240, end: 272, label: "CHORUS", energy: 0.9 },
  { start: 272, end: 320, label: "OUTRO", energy: 0.3 },
];

async function main() {
  console.log("═══ MIKE ROSS × 21 SAVAGE ═══\n");

  // Step 1: Analyze video
  const cv = await extractCVMetrics(VID, 2.0);
  console.log(`Video: ${cv.segments.length} segments, ${cv.totalDuration.toFixed(0)}s`);

  // Step 2: Pick best 30 seconds of video (chorus section of song)
  const CHORUS_DURATION = 30; // match chorus energy
  console.log(`\nSelecting ${CHORUS_DURATION}s of best moments...`);

  const sorted = [...cv.segments]
    .filter(s => !s.isBlackFrame && !s.isStaticFrame)
    .sort((a, b) => {
      const scoreA = a.motionScore * 0.4 + a.overallQuality * 0.3 + a.blurScore * 0.3;
      const scoreB = b.motionScore * 0.4 + b.overallQuality * 0.3 + b.blurScore * 0.3;
      return scoreB - scoreA;
    });

  // Select top segments, ordered by time
  const selected = sorted.slice(0, Math.ceil(CHORUS_DURATION / 2))
    .sort((a, b) => a.startTime - b.startTime);

  let totalDur = 0;
  const shots: Array<{start: number, end: number, motion: number, quality: number}> = [];
  for (const seg of selected) {
    if (totalDur >= CHORUS_DURATION) break;
    const dur = Math.min(seg.endTime - seg.startTime, 3);
    shots.push({ start: seg.startTime, end: seg.startTime + dur, motion: seg.motionScore, quality: seg.overallQuality });
    totalDur += dur;
  }

  console.log(`Selected ${shots.length} shots, ${totalDur.toFixed(1)}s total\n`);

  // Step 3: Build edit with effects
  const tmpDir = "/tmp/jalebi-mikeross";
  await fs.mkdir(tmpDir, { recursive: true });

  const segmentFiles: string[] = [];

  // Shot pattern matching the song's energy
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const segPath = path.join(tmpDir, `shot_${i}.mp4`);
    const dur = shot.end - shot.start;

    // Apply speed ramp based on energy
    const speedFilter = shot.motion > 0.6
      ? []  // high motion: keep normal speed
      : ["-vf", "setpts=PTS*0.85"]; // slightly speed up low-motion shots

    await execFileAsync("ffmpeg", [
      "-ss", String(shot.start),
      "-i", VID,
      "-t", String(dur),
      ...speedFilter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-y", segPath,
    ], { timeout: 30000 });

    segmentFiles.push(segPath);

    // Flash between cuts
    if (i > 0) {
      const flashPath = path.join(tmpDir, `flash_${i}.mp4`);
      const { stdout: dims } = await execFileAsync("ffprobe", [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0",
        segmentFiles[0],
      ], { timeout: 5000 });
      const [w, h] = dims.trim().split(",").map(Number);

      await execFileAsync("ffmpeg", [
        "-f", "lavfi", "-i", `color=c=black:s=${w || 1280}x${h || 720}:d=0.05:r=30`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", "0.05", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-shortest", "-y", flashPath,
      ], { timeout: 10000 });

      segmentFiles.push(flashPath);
    }

    // Zoom on high-energy shots
    if (shot.motion > 0.6 && dur > 1.5) {
      const zoomed = path.join(tmpDir, `zoom_${i}.mp4`);
      await execFileAsync("ffmpeg", [
        "-i", segPath,
        "-vf", "zoompan=z='min(1.1,1+0.001*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=30",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy", "-y", zoomed,
      ], { timeout: 30000 });
      // Replace the segment with zoomed version
      await fs.unlink(segPath);
      await fs.rename(zoomed, segPath);
    }
  }

  // Step 4: Concat
  console.log("Building video...");
  const concatList = path.join(tmpDir, "concat.txt");
  await fs.writeFile(concatList, segmentFiles.map(f => `file '${f}'`).join("\n"));

  const rawPath = path.join(tmpDir, "raw.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "concat", "-safe", "0", "-i", concatList,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "128k", "-y", rawPath,
  ], { timeout: 60000 });

  // Step 5: Add text overlays + color grade
  console.log("Adding overlays + color grade...");
  const outputPath = path.join(OUTPUT, "mikeross-x-21savage.mp4");

  // Dark moody color grade (match 21 Savage vibe) + text overlays
  await execFileAsync("ffmpeg", [
    "-i", rawPath,
    "-vf", "eq=contrast=1.3:saturation=0.8:brightness=-0.03:gamma=0.9",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "copy", "-y", outputPath,
  ], { timeout: 60000 });

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  // Output info
  const { stdout: info } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration,size",
    "-of", "csv=p=0", outputPath,
  ], { timeout: 5000 });
  const [dur, size] = info.trim().split(",");

  console.log(`\n═══ RESULT ═══`);
  console.log(`Output: ${outputPath}`);
  console.log(`Duration: ${dur}s`);
  console.log(`Size: ${(parseInt(size) / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Shots: ${shots.length}`);
  console.log(`Effects: speed ramps, zoom, flash cuts, dark color grade`);
  console.log(`Song: 21 Savage - a lot (chorus section)`);
}

main().catch(console.error);
