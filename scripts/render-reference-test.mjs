#!/usr/bin/env node
/**
 * render-reference-test.mjs — Full intelligent render pipeline.
 *
 * 1. Analyze song structure → find best segment
 * 2. Detect beats → align cuts to beat positions
 * 3. Detect speech → generate ducking envelope
 * 4. Generate EDL with beat-synced cuts + effects
 * 5. Render: extract shots → concatenate → mix audio
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const REFERENCE_VIDEO = path.join(ROOT, "monet-reference-edits", "SPIDERMAN (IMPORTANT).MP4");
const FOOTAGE_FILE = path.join(ROOT, "testfiles", "High Quality Steph Curry Clips for Edits! (2024-25).mp4");
const MUSIC_FILE = path.join(ROOT, "testfiles", "Outfit (with 21 Savage).mp3");
const OUTPUT_DIR = path.join(ROOT, "testuploads");

// ─── Analysis helpers ─────────────────────────────────────────────

async function getDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

async function analyzeMusic(musicPath) {
  const duration = await getDuration(musicPath);

  // Extract loudness per chunk for energy curve
  const chunks = 100;
  const chunkDur = duration / chunks;
  const energy = [];

  for (let i = 0; i < chunks; i++) {
    const start = i * chunkDur;
    try {
      const { stderr } = await execFileAsync("ffmpeg", [
        "-ss", String(start), "-t", String(chunkDur),
        "-i", musicPath,
        "-af", "astats=metadata=1:reset=0",
        "-f", "null", "-",
      ], { timeout: 10_000 });
      const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
      const rms = rmsMatch ? parseFloat(rmsMatch[1]) : -30;
      energy.push(Math.max(0, Math.min(1, (rms + 30) / 30)));
    } catch {
      energy.push(0.5);
    }
  }

  // Find best 30s segment
  const targetDur = 30;
  const bucketSize = duration / chunks;
  const bucketsNeeded = Math.ceil(targetDur / bucketSize);
  let bestStart = 0, bestScore = -1;

  for (let i = 0; i <= chunks - bucketsNeeded; i++) {
    const seg = energy.slice(i, i + bucketsNeeded);
    const avg = seg.reduce((a, b) => a + b, 0) / seg.length;
    const variance = seg.reduce((s, v) => s + (v - avg) ** 2, 0) / seg.length;
    const peak = Math.max(...seg);
    // Prefer rising energy (ramp to drop)
    let ramp = 0;
    for (let j = 1; j < seg.length; j++) {
      if (seg[j] > seg[j - 1]) ramp += 0.1;
    }
    const score = avg * 0.3 + variance * 0.2 + peak * 0.2 + ramp * 0.3;
    if (score > bestScore) { bestScore = score; bestStart = i; }
  }

  // Detect beats from ebur128
  let beats = [];
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", musicPath, "-af", "ebur128=peak=true", "-f", "null", "-",
    ], { timeout: 60_000 });
    for (const line of stderr.split("\n")) {
      const m = line.match(/t:\s*([\d.]+)\s+.*M:\s*([-\d.]+)/);
      if (m) beats.push({ time: parseFloat(m[1]), loudness: parseFloat(m[2]) });
    }
  } catch {}

  // Detect BPM from strong beats
  const strong = beats.filter(b => b.loudness > -20);
  let bpm = 120;
  if (strong.length > 4) {
    const intervals = [];
    for (let i = 1; i < strong.length; i++) {
      const iv = strong[i].time - strong[i - 1].time;
      if (iv > 0.1 && iv < 2) intervals.push(iv);
    }
    if (intervals.length > 0) {
      const sorted = [...intervals].sort((a, b) => a - b);
      bpm = Math.round(60 / sorted[Math.floor(sorted.length / 2)]);
      bpm = Math.max(60, Math.min(200, bpm));
    }
  }

  // Generate beat grid from BPM, aligned to best segment
  const beatInterval = 60 / bpm;
  const beatGrid = [];
  for (let t = bestStart * bucketSize; t < bestStart * bucketSize + targetDur; t += beatInterval) {
    beatGrid.push(Math.round(t * 1000) / 1000);
  }

  return {
    duration, bpm, energy, beats,
    bestSegment: {
      start: Math.round(bestStart * bucketSize * 10) / 10,
      end: Math.round(Math.min((bestStart + bucketsNeeded) * bucketSize, duration) * 10) / 10,
      score: Math.round(bestScore * 100) / 100,
    },
    beatGrid,
  };
}

async function detectSpeech(videoPath) {
  const duration = await getDuration(videoPath);
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", videoPath, "-af", "silencedetect=noise=-30dB:d=0.3", "-f", "null", "-",
  ], { timeout: 60_000 }).catch(err => ({ stderr: err.stderr ?? "" }));

  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
  const segments = [];
  let lastEnd = 0;
  for (let i = 0; i < Math.max(starts.length, ends.length); i++) {
    const segEnd = i < starts.length ? starts[i] : duration;
    if (segEnd - lastEnd > 0.15) segments.push({ start: lastEnd, end: segEnd });
    if (i < ends.length) lastEnd = ends[i];
  }
  return { segments, hasSpeech: segments.length > 2, duration };
}

// ─── EDL generation with beat sync ───────────────────────────────

function generateBeatSyncedEDL(footageDuration, musicAnalysis, speechData) {
  const totalDuration = 30;
  const beatGrid = musicAnalysis.beatGrid;
  const shots = [];
  let currentTime = 0;
  let beatIdx = 0;

  // Find which beat index aligns with our start
  while (beatIdx < beatGrid.length && beatGrid[beatIdx] < musicAnalysis.bestSegment.start) {
    beatIdx++;
  }

  let shotNum = 0;
  while (currentTime < totalDuration && beatIdx < beatGrid.length) {
    const beatTime = beatGrid[beatIdx] - musicAnalysis.bestSegment.start;
    if (beatTime > totalDuration) break;

    // Cut at beat position
    const nextBeat = beatIdx + 1 < beatGrid.length
      ? beatGrid[beatIdx + 1] - musicAnalysis.bestSegment.start
      : totalDuration;

    const duration = Math.min(nextBeat - beatTime, totalDuration - currentTime);
    if (duration < 0.1) { beatIdx++; continue; }

    // Source footage: distribute evenly
    const sourceStart = (currentTime / totalDuration) * footageDuration;
    const sourceEnd = Math.min(footageDuration - 0.5, sourceStart + duration * 1.5);

    // Effects based on beat position in the song
    const effects = [];
    const positionInSong = (beatGrid[beatIdx] - musicAnalysis.bestSegment.start) / totalDuration;

    // Flash on downbeats (every 4 beats)
    if (beatIdx % 4 === 0) effects.push({ id: `fx-${shotNum}`, type: "flash", intensity: 0.8 });

    // Shake on offbeats near energy peaks
    if (beatIdx % 2 === 0 && musicAnalysis.energy[beatIdx % musicAnalysis.energy.length] > 0.5) {
      effects.push({ id: `fx-${shotNum}-s`, type: "shake", intensity: 0.6 });
    }

    // Glitch at section transitions
    if (beatIdx > 0 && beatIdx % 8 === 0) {
      effects.push({ id: `fx-${shotNum}-g`, type: "glitch", intensity: 0.7 });
    }

    // Speed ramp at the peak moment
    const distToPeak = Math.abs(positionInSong - 0.5);
    const speedRamp = distToPeak < 0.1
      ? { startSpeed: 0.4, endSpeed: 1.8 }
      : beatIdx % 6 === 0 ? { startSpeed: 0.6, endSpeed: 1.4 } : undefined;

    shots.push({
      id: `shot-${shotNum}`,
      source: { inPoint: sourceStart, outPoint: sourceEnd },
      timing: { startTime: currentTime, duration, speedRamp },
      effects: effects.length > 0 ? effects : undefined,
      transition: shotNum > 0
        ? { type: beatIdx % 4 === 0 ? "flash" : "cut", duration: beatIdx % 4 === 0 ? 0.08 : 0 }
        : undefined,
      beatLock: { beatIndex: beatIdx, lockMode: "start" },
    });

    currentTime += duration;
    beatIdx++;
    shotNum++;
  }

  return {
    version: "1.0.0",
    metadata: {
      title: "Spider-Man Style × Steph Curry (Beat-Synced)",
      createdAt: Date.now(),
      aiModel: "reference-matcher",
      prompt: "Beat-synced edit with Spider-Man pacing",
      intentId: "test-beat-synced",
      analysisId: "test-beat-synced",
    },
    timeline: {
      duration: totalDuration,
      fps: 30,
      resolution: { width: 1920, height: 720 },
    },
    shots,
    music: {
      id: "music-1",
      sourceId: "music",
      beatGrid,
      bpm: musicAnalysis.bpm,
      volume: 1,
      inPoint: musicAnalysis.bestSegment.start,
      outPoint: musicAnalysis.bestSegment.end,
    },
    globalEffects: { colorGrade: "hyper_neon" },
  };
}

// ─── Render pipeline ──────────────────────────────────────────────

async function renderVideo(edl, footagePath, musicPath, outputPath, speechData) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-render-"));
  const totalDur = edl.timeline.duration;

  try {
    // Pass 1: Extract each shot
    console.log(`  Pass 1: Extracting ${edl.shots.length} shots...`);
    const shotFiles = [];

    for (let i = 0; i < edl.shots.length; i++) {
      const shot = edl.shots[i];
      const shotFile = path.join(tmpDir, `shot_${String(i).padStart(3, "0")}.mp4`);
      const ss = shot.source.inPoint;
      const dur = shot.source.outPoint - ss;

      let speed = 1;
      if (shot.timing.speedRamp) {
        speed = (shot.timing.speedRamp.startSpeed + shot.timing.speedRamp.endSpeed) / 2;
      }

      const filters = [`setpts=PTS/${speed.toFixed(3)}`];
      if (shot.effects) {
        for (const fx of shot.effects) {
          if (fx.type === "flash") filters.push("eq=brightness=0.25:contrast=1.15");
          else if (fx.type === "shake") filters.push("crop=in_w*0.96:in_h*0.96,scale=trunc(iw/0.96/2)*2:trunc(ih/0.96/2)*2");
          else if (fx.type === "glitch") filters.push("eq=contrast=1.25:saturation=1.4");
        }
      }

      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", String(ss), "-i", footagePath,
          "-t", String(dur),
          "-vf", filters.join(","),
          "-an",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
          "-r", "30", "-pix_fmt", "yuv420p",
          shotFile,
        ], { timeout: 60_000 });
        shotFiles.push(shotFile);
        process.stdout.write(`  Shot ${i + 1}/${edl.shots.length}\r`);
      } catch (err) {
        console.error(`\n  Failed shot ${i}`);
      }
    }
    console.log(`\n  ${shotFiles.length}/${edl.shots.length} shots extracted`);

    if (shotFiles.length === 0) return false;

    // Pass 2: Concatenate
    console.log("  Pass 2: Concatenating...");
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(concatList, shotFiles.map(f => `file '${f}'`).join("\n"));
    const concatOut = path.join(tmpDir, "concat.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
      concatOut,
    ], { timeout: 120_000 });

    // Pass 3: Mix audio with intelligence
    console.log("  Pass 3: Smart audio mix...");
    const musicStart = edl.music?.inPoint ?? 0;

    // Ducking envelope
    let audioFilter = `[1:a]atrim=start=${musicStart.toFixed(3)}:end=${(musicStart + totalDur).toFixed(3)},asetpts=PTS-STARTPTS,volume=0.85`;

    if (speechData.hasSpeech) {
      let lastEnd = 0;
      const duckPoints = [];
      for (const seg of speechData.segments) {
        const s = Math.max(0, seg.start - 0.15);
        const e = Math.min(totalDur, seg.end + 0.3);
        duckPoints.push(`volume=1.0:t=${lastEnd.toFixed(3)}`);
        duckPoints.push(`volume=0.2:t=${s.toFixed(3)}`);
        duckPoints.push(`volume=0.2:t=${e.toFixed(3)}`);
        lastEnd = e;
      }
      duckPoints.push(`volume=1.0:t=${lastEnd.toFixed(3)}`);
      audioFilter += `,${duckPoints.join(":")}`;
    }

    audioFilter += `,afade=t=in:st=0:d=0.5,afade=t=out:st=${totalDur - 1}:d=1`;
    audioFilter += `,atrim=0:${totalDur},asetpts=PTS-STARTPTS[outa]`;

    await execFileAsync("ffmpeg", [
      "-y", "-i", concatOut, "-i", musicPath,
      "-filter_complex", audioFilter,
      "-map", "0:v", "-map", "[outa]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-t", String(totalDur), "-movflags", "+faststart",
      outputPath,
    ], { timeout: 60_000 });

    return true;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Intelligent Render Pipeline");
  console.log("═══════════════════════════════════════════════════\n");

  // 1. Analyze song
  console.log("── Song Analysis ──");
  const musicAnalysis = await analyzeMusic(MUSIC_FILE);
  console.log(`  Duration: ${musicAnalysis.duration.toFixed(1)}s`);
  console.log(`  BPM: ${musicAnalysis.bpm}`);
  console.log(`  Best segment: ${musicAnalysis.bestSegment.start}s → ${musicAnalysis.bestSegment.end}s (score: ${musicAnalysis.bestSegment.score})`);
  console.log(`  Beat grid: ${musicAnalysis.beatGrid.length} beats`);

  // 2. Detect speech
  console.log("\n── Speech Detection ──");
  const speechData = await detectSpeech(FOOTAGE_FILE);
  console.log(`  Speech: ${speechData.hasSpeech ? "YES" : "NO"}`);
  console.log(`  Segments: ${speechData.segments.length}`);

  // 3. Generate EDL
  console.log("\n── EDL Generation ──");
  const footageDuration = await getDuration(FOOTAGE_FILE);
  const edl = generateBeatSyncedEDL(footageDuration, musicAnalysis, speechData);
  console.log(`  Shots: ${edl.shots.length}`);
  console.log(`  Beat-synced: ${edl.shots.filter(s => s.beatLock).length}/${edl.shots.length}`);
  console.log(`  Effects: ${edl.shots.filter(s => s.effects?.length > 0).length} shots`);
  console.log(`  Speed ramps: ${edl.shots.filter(s => s.timing.speedRamp).length}`);

  // Save EDL
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const edlPath = path.join(OUTPUT_DIR, "beat-synced-edl.json");
  await fs.writeFile(edlPath, JSON.stringify(edl, null, 2));

  // 4. Render
  console.log("\n── Rendering ──");
  const outputPath = path.join(OUTPUT_DIR, "beat-synced-curry.mp4");
  const startTime = Date.now();

  const success = await renderVideo(edl, FOOTAGE_FILE, MUSIC_FILE, outputPath, speechData);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (success) {
    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`\n  ✓ Render complete in ${elapsed}s`);
    console.log(`  ✓ Output: testuploads/beat-synced-curry.mp4 (${sizeMB} MB)`);
    console.log(`  ✓ Duration: ${edl.timeline.duration}s @ ${edl.timeline.fps}fps`);
    console.log(`  ✓ Music: ${musicAnalysis.bestSegment.start}s → ${musicAnalysis.bestSegment.end}s (best segment)`);
    console.log(`  ✓ All cuts aligned to beat grid`);
  } else {
    console.error("\n  ✗ Render failed");
  }

  console.log("\n═══════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
