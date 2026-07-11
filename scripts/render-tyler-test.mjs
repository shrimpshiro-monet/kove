#!/usr/bin/env node
/**
 * render-tyler-test.mjs — Tyler The Creator vibrant warm style × Steph Curry × Outfit
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const FOOTAGE = path.join(ROOT, "testfiles", "High Quality Steph Curry Clips for Edits! (2024-25).mp4");
const MUSIC = path.join(ROOT, "testfiles", "Outfit (with 21 Savage).mp3");
const OUTPUT_DIR = path.join(ROOT, "testuploads");

async function getDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

async function analyzeMusic(musicPath) {
  const duration = await getDuration(musicPath);
  const chunks = 100;
  const chunkDur = duration / chunks;
  const energy = [];
  for (let i = 0; i < chunks; i++) {
    try {
      const { stderr } = await execFileAsync("ffmpeg", [
        "-ss", String(i * chunkDur), "-t", String(chunkDur),
        "-i", musicPath, "-af", "astats=metadata=1:reset=0", "-f", "null", "-",
      ], { timeout: 10_000 });
      const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
      energy.push(Math.max(0, Math.min(1, (parseFloat(rmsMatch?.[1] ?? "-30") + 30) / 30)));
    } catch { energy.push(0.5); }
  }

  const targetDur = 30;
  const bucketSize = duration / chunks;
  const bucketsNeeded = Math.ceil(targetDur / bucketSize);
  let bestStart = 0, bestScore = -1;
  for (let i = 0; i <= chunks - bucketsNeeded; i++) {
    const seg = energy.slice(i, i + bucketsNeeded);
    const avg = seg.reduce((a, b) => a + b, 0) / seg.length;
    const peak = Math.max(...seg);
    const score = avg * 0.4 + peak * 0.3;
    if (score > bestScore) { bestScore = score; bestStart = i; }
  }

  let bpm = 120;
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", musicPath, "-af", "ebur128=peak=true", "-f", "null", "-",
    ], { timeout: 30_000 });
    const beats = [];
    for (const line of stderr.split("\n")) {
      const m = line.match(/t:\s*([\d.]+)\s+.*M:\s*([-\d.]+)/);
      if (m) beats.push({ time: parseFloat(m[1]), loudness: parseFloat(m[2]) });
    }
    const strong = beats.filter(b => b.loudness > -20);
    if (strong.length > 4) {
      const intervals = [];
      for (let i = 1; i < strong.length; i++) {
        const iv = strong[i].time - strong[i - 1].time;
        if (iv > 0.1 && iv < 2) intervals.push(iv);
      }
      if (intervals.length > 0) {
        const sorted = [...intervals].sort((a, b) => a - b);
        bpm = Math.max(60, Math.min(200, Math.round(60 / sorted[Math.floor(sorted.length / 2)])));
      }
    }
  } catch {}

  const beatInterval = 60 / bpm;
  const beatGrid = [];
  for (let t = bestStart * bucketSize; t < bestStart * bucketSize + targetDur; t += beatInterval) {
    beatGrid.push(Math.round(t * 1000) / 1000);
  }

  return { duration, bpm, energy, beatGrid, bestSegment: { start: Math.round(bestStart * bucketSize * 10) / 10, end: Math.round(Math.min((bestStart + bucketsNeeded) * bucketSize, duration) * 10) / 10 } };
}

function generateTylerEDL(footageDuration, musicAnalysis) {
  const totalDuration = 30;
  const beatGrid = musicAnalysis.beatGrid;
  const shots = [];
  let currentTime = 0;
  let beatIdx = 0;
  let shotNum = 0;

  // Tyler style: moderate pacing, warm, vibrant
  // 1.3s avg shot, mostly cuts, some flashes at transitions
  // Low energy overall — chill vibes

  while (currentTime < totalDuration && beatIdx < beatGrid.length) {
    const beatTime = beatGrid[beatIdx] - musicAnalysis.bestSegment.start;
    if (beatTime > totalDuration) break;

    // Tyler uses longer shots — skip every other beat for moderate pacing
    const skipBeats = beatIdx % 2 === 0 ? 1 : 2;
    const nextBeatIdx = beatIdx + skipBeats;
    const nextBeat = nextBeatIdx < beatGrid.length
      ? beatGrid[nextBeatIdx] - musicAnalysis.bestSegment.start
      : totalDuration;

    const duration = Math.min(nextBeat - beatTime, totalDuration - currentTime);
    if (duration < 0.3) { beatIdx += skipBeats; continue; }

    const sourceStart = (currentTime / totalDuration) * footageDuration;
    const sourceEnd = Math.min(footageDuration - 0.5, sourceStart + duration * 1.3);

    // Tyler effects: subtle — impact flash on transitions, occasional shake
    const effects = [];
    const energyAtBeat = musicAnalysis.energy[beatIdx % musicAnalysis.energy.length] ?? 0.5;

    // Flash only on every 4th shot (Tyler is chill)
    if (shotNum % 4 === 0) {
      effects.push({ id: `fx-${shotNum}-flash`, type: "flash", intensity: 0.5 });
    }

    // Shake on energy peaks
    if (energyAtBeat > 0.6 && shotNum % 3 === 0) {
      effects.push({ id: `fx-${shotNum}-shake`, type: "shake", intensity: 0.4 });
    }

    // Speed ramp at section changes (every 8 shots)
    const speedRamp = shotNum % 8 === 0
      ? { startSpeed: 0.7, endSpeed: 1.3 }
      : undefined;

    // Tyler: mostly cuts, occasional flash
    const transition = shotNum > 0 && shotNum % 4 === 0
      ? { type: "flash", duration: 0.1 }
      : shotNum > 0 ? { type: "cut", duration: 0 } : undefined;

    shots.push({
      id: `shot-${shotNum}`,
      source: { inPoint: sourceStart, outPoint: sourceEnd },
      timing: { startTime: currentTime, duration, speedRamp },
      effects: effects.length > 0 ? effects : undefined,
      transition,
      beatLock: { beatIndex: beatIdx, lockMode: "start" },
    });

    currentTime += duration;
    beatIdx += skipBeats;
    shotNum++;
  }

  return {
    version: "1.0.0",
    metadata: {
      title: "Tyler The Creator Style × Steph Curry × Outfit",
      createdAt: Date.now(),
      aiModel: "reference-matcher",
      prompt: "Tyler The Creator vibrant warm style applied to Steph Curry highlights",
      intentId: "test-tyler",
      analysisId: "test-tyler",
    },
    timeline: { duration: totalDuration, fps: 30, resolution: { width: 1920, height: 720 } },
    shots,
    music: {
      id: "music-1", sourceId: "music", beatGrid, bpm: musicAnalysis.bpm, volume: 1,
      inPoint: musicAnalysis.bestSegment.start, outPoint: musicAnalysis.bestSegment.end,
    },
    globalEffects: { colorGrade: "vibrant_warm" },
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Tyler The Creator Style × Steph Curry × Outfit");
  console.log("═══════════════════════════════════════════════════\n");

  console.log("── Music Analysis ──");
  const musicAnalysis = await analyzeMusic(MUSIC);
  console.log(`  Duration: ${musicAnalysis.duration.toFixed(1)}s | BPM: ${musicAnalysis.bpm}`);
  console.log(`  Best: ${musicAnalysis.bestSegment.start}s → ${musicAnalysis.bestSegment.end}s`);

  const footageDuration = await getDuration(FOOTAGE);
  const edl = generateTylerEDL(footageDuration, musicAnalysis);
  console.log(`\n── EDL ──`);
  console.log(`  Shots: ${edl.shots.length} | Beat-synced: ${edl.shots.filter(s => s.beatLock).length}/${edl.shots.length}`);
  console.log(`  Effects: ${edl.shots.filter(s => s.effects?.length > 0).length}/${edl.shots.length}`);
  console.log(`  Speed ramps: ${edl.shots.filter(s => s.timing.speedRamp).length}`);
  console.log(`  Flash transitions: ${edl.shots.filter(s => s.transition?.type === "flash").length}`);

  // Render
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const edlPath = path.join(OUTPUT_DIR, "tyler-curry-outfit-edl.json");
  await fs.writeFile(edlPath, JSON.stringify(edl, null, 2));

  console.log("\n── Rendering ──");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-tyler-"));
  const totalDur = edl.timeline.duration;
  const startTime = Date.now();

  try {
    // Extract shots
    const shotFiles = [];
    for (let i = 0; i < edl.shots.length; i++) {
      const shot = edl.shots[i];
      const shotFile = path.join(tmpDir, `shot_${String(i).padStart(3, "0")}.mp4`);
      let speed = 1;
      if (shot.timing.speedRamp) speed = (shot.timing.speedRamp.startSpeed + shot.timing.speedRamp.endSpeed) / 2;

      const filters = [`setpts=PTS/${speed.toFixed(3)}`];
      if (shot.effects) {
        for (const fx of shot.effects) {
          if (fx.type === "flash") filters.push("eq=brightness=0.15:contrast=1.08");
          else if (fx.type === "shake") filters.push("crop=in_w*0.97:in_h*0.97,scale=trunc(iw/0.97/2)*2:trunc(ih/0.97/2)*2");
        }
      }

      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", String(shot.source.inPoint), "-i", FOOTAGE,
          "-t", String(shot.source.outPoint - shot.source.inPoint),
          "-vf", filters.join(","), "-an",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
          "-r", "30", "-pix_fmt", "yuv420p", shotFile,
        ], { timeout: 60_000 });
        shotFiles.push(shotFile);
        process.stdout.write(`  Shot ${i + 1}/${edl.shots.length}\r`);
      } catch { console.error(`\n  Failed shot ${i}`); }
    }
    console.log(`\n  ${shotFiles.length}/${edl.shots.length} shots`);

    // Concatenate
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(concatList, shotFiles.map(f => `file '${f}'`).join("\n"));
    const concatOut = path.join(tmpDir, "concat.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", concatOut,
    ], { timeout: 120_000 });

    // Add music
    const musicStart = edl.music?.inPoint ?? 0;
    const outputPath = path.join(OUTPUT_DIR, "tyler-curry-outfit.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-i", concatOut, "-i", MUSIC,
      "-filter_complex",
      `[1:a]atrim=start=${musicStart.toFixed(3)}:end=${(musicStart + totalDur).toFixed(3)},asetpts=PTS-STARTPTS,volume=0.85,afade=t=in:st=0:d=1,afade=t=out:st=${totalDur - 1.5}:d=1.5,atrim=0:${totalDur},asetpts=PTS-STARTPTS[outa]`,
      "-map", "0:v", "-map", "[outa]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-t", String(totalDur), "-movflags", "+faststart", outputPath,
    ], { timeout: 60_000 });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`\n  ✓ Render complete in ${elapsed}s`);
    console.log(`  ✓ Output: testuploads/tyler-curry-outfit.mp4 (${sizeMB} MB)`);
    console.log(`  ✓ Duration: ${totalDur}s | Shots: ${edl.shots.length}`);
    console.log(`  ✓ Music: ${musicStart}s → ${(musicStart + totalDur).toFixed(1)}s (best segment)`);
    console.log(`  ✓ Style: Tyler The Creator — vibrant warm, moderate pacing`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n═══════════════════════════════════════════════════");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
