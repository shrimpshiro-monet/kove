#!/usr/bin/env node
/**
 * render-tiktok.mjs — Render that actually matches real TikTok editing patterns.
 *
 * Based on analysis of 16 reference videos:
 * - 60% hard cuts, 30% flash transitions, 10% other
 * - 0.7 effects per shot (most shots have NO effects)
 * - impact_flash (59%) is the dominant effect — white flash at beat drops
 * - shake (17%) and chromatic (17%) used sparingly
 * - speed_ramp (6%) — maybe 1-2 per edit
 * - No mosaic, scanlines, invert, echo, posterize — those aren't TikTok style
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
const OUTPUT_DIR = path.join(ROOT, "test-renders");

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

  // Best 30s segment
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

  // BPM
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

// ─── TikTok-accurate EDL generator ────────────────────────────────

function generateTikTokEDL(footageDuration, musicAnalysis) {
  const totalDuration = 30;
  const beatGrid = musicAnalysis.beatGrid;
  const shots = [];
  let currentTime = 0;
  let beatIdx = 0;
  let shotNum = 0;

  // Real TikTok formula:
  // - 60% shots: hard cut, NO effects
  // - 20% shots: hard cut + impact_flash (white flash)
  // - 10% shots: hard cut + shake (at energy peaks)
  // - 5% shots: hard cut + chromatic (at key moments)
  // - 5% shots: speed ramp (rare, at climax)
  // - Transitions: 60% cut, 30% flash, 10% other

  while (currentTime < totalDuration && beatIdx < beatGrid.length) {
    const beatTime = beatGrid[beatIdx] - musicAnalysis.bestSegment.start;
    if (beatTime > totalDuration) break;

    // Cut at beat position — variable shot length
    // Shorter shots on high energy, longer on low energy
    const energyAtBeat = musicAnalysis.energy[beatIdx % musicAnalysis.energy.length] ?? 0.5;
    const nextBeat = beatIdx + 1 < beatGrid.length
      ? beatGrid[beatIdx + 1] - musicAnalysis.bestSegment.start
      : totalDuration;

    const duration = Math.min(nextBeat - beatTime, totalDuration - currentTime);
    if (duration < 0.15) { beatIdx++; continue; }

    const sourceStart = (currentTime / totalDuration) * footageDuration;
    const sourceEnd = Math.min(footageDuration - 0.3, sourceStart + duration * 1.3);

    // ── EFFECTS: restrained, like real TikTok edits ──
    const effects = [];
    const roll = Math.random();

    if (roll < 0.20) {
      // 20%: impact_flash (the dominant effect)
      effects.push({ type: "flash_white", intensity: 0.6 + energyAtBeat * 0.3 });
    } else if (roll < 0.30 && energyAtBeat > 0.6) {
      // 10%: shake (only on high energy beats)
      effects.push({ type: "shake", intensity: 0.4 + energyAtBeat * 0.3 });
    } else if (roll < 0.35 && shotNum % 8 === 0) {
      // 5%: chromatic (rare, at key moments)
      effects.push({ type: "chromatic", intensity: 0.5 });
    }
    // 65%: NO effects (just a clean cut)

    // ── SPEED RAMP: very rare, only 1-2 per edit ──
    const speedRamp = shotNum === Math.floor(shotCount(musicAnalysis) * 0.6)
      ? { start: 0.4, end: 1.8 } // One ramp at ~60% position (climax approach)
      : null;

    // ── TRANSITION: 60% cut, 30% flash, 10% other ──
    let transition = null;
    if (shotNum > 0) {
      const transRoll = Math.random();
      if (transRoll < 0.30) {
        // Flash transition on beat drops
        transition = { type: "flash", duration: 0.08 };
      } else if (transRoll < 0.40 && energyAtBeat > 0.5) {
        // Occasional fade on energy peaks
        transition = { type: "fade", duration: 0.15 };
      }
      // 60%: hard cut (no transition object)
    }

    shots.push({
      source: { inPoint: sourceStart, outPoint: sourceEnd },
      duration,
      effects,
      transition,
      speedRamp,
      beatIdx,
      energyAtBeat,
    });

    currentTime += duration;
    beatIdx++;
    shotNum++;
  }

  return { shots, totalDuration: currentTime };
}

function shotCount(musicAnalysis) {
  return musicAnalysis.beatGrid.length;
}

// ─── Render ───────────────────────────────────────────────────────

async function render() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  TikTok-Accurate Render");
  console.log("  (restrained effects, real cut patterns)");
  console.log("═══════════════════════════════════════════════════\n");

  const footageDuration = await getDuration(FOOTAGE);
  const musicAnalysis = await analyzeMusic(MUSIC);
  const { shots, totalDuration } = generateTikTokEDL(footageDuration, musicAnalysis);

  const effectsCount = shots.filter(s => s.effects.length > 0).length;
  const flashTransCount = shots.filter(s => s.transition?.type === "flash").length;
  const fadeTransCount = shots.filter(s => s.transition?.type === "fade").length;
  const cutCount = shots.filter(s => !s.transition).length;
  const speedRampCount = shots.filter(s => s.speedRamp).length;

  console.log(`Shots: ${shots.length} | Duration: ${totalDuration.toFixed(1)}s`);
  console.log(`Effects: ${effectsCount}/${shots.length} shots (${(effectsCount/shots.length*100).toFixed(0)}%)`);
  console.log(`Transitions: ${cutCount} cut, ${flashTransCount} flash, ${fadeTransCount} fade`);
  console.log(`Speed ramps: ${speedRampCount}`);
  console.log(`Music: ${musicAnalysis.bestSegment.start}s → ${musicAnalysis.bestSegment.end}s`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-tiktok-"));

  try {
    // ── PASS 1: Extract shots ──
    console.log("\nPass 1: Extracting...");
    const shotFiles = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const shotFile = path.join(tmpDir, `shot_${String(i).padStart(3, "0")}.mp4`);

      // Speed
      let speed = 1;
      if (shot.speedRamp) speed = (shot.speedRamp.start + shot.speedRamp.end) / 2;

      const filters = [`setpts=PTS/${speed.toFixed(3)}`];

      // Effects (restrained — only when present)
      for (const fx of shot.effects) {
        if (fx.type === "flash_white") {
          filters.push("eq=brightness=0.2:contrast=1.1");
        } else if (fx.type === "shake") {
          const a = Math.round(fx.intensity * 8);
          filters.push(`crop=iw-${a*2}:ih-${a*2}:${a}+random(1)*${a}:${a}+random(2)*${a},scale=trunc(iw/2)*2:trunc(ih/2)*2`);
        } else if (fx.type === "chromatic") {
          const s = Math.round(fx.intensity * 4);
          filters.push(`rgbashift=rh=${-s}:bh=${s}`);
        }
      }

      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", String(shot.source.inPoint), "-i", FOOTAGE,
          "-t", String(shot.source.outPoint - shot.source.inPoint),
          "-vf", filters.join(","),
          "-an",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
          "-r", "30", "-pix_fmt", "yuv420p",
          shotFile,
        ], { timeout: 60_000 });
        shotFiles.push(shotFile);
      } catch { /* skip */ }
    }
    console.log(`  ${shotFiles.length}/${shots.length} shots`);

    // ── PASS 2: Apply transitions ──
    console.log("\nPass 2: Applying transitions...");
    const finalFiles = [];

    for (let i = 0; i < shotFiles.length; i++) {
      const shot = shots[i];
      const transFile = path.join(tmpDir, `trans_${String(i).padStart(3, "0")}.mp4`);
      const filters = [];

      if (shot.transition?.type === "flash") {
        // White flash: bright at start, fade to normal
        filters.push("fade=t=in:st=0:d=0.08:c=white");
      } else if (shot.transition?.type === "fade") {
        // Subtle fade
        filters.push(`fade=t=in:st=0:d=${shot.transition.duration}`);
      }
      // hard_cut: no filter

      if (filters.length > 0) {
        try {
          await execFileAsync("ffmpeg", [
            "-y", "-i", shotFiles[i],
            "-vf", filters.join(","),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-pix_fmt", "yuv420p", transFile,
          ], { timeout: 15_000 });
          finalFiles.push(transFile);
        } catch { finalFiles.push(shotFiles[i]); }
      } else {
        finalFiles.push(shotFiles[i]);
      }
    }

    // ── PASS 3: Concatenate ──
    console.log("\nPass 3: Concatenating...");
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(concatList, finalFiles.map(f => `file '${f}'`).join("\n"));

    const concatOut = path.join(tmpDir, "concat.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
      concatOut,
    ], { timeout: 120_000 });

    // ── PASS 4: Music ──
    console.log("Pass 4: Adding music...");
    const musicStart = musicAnalysis.bestSegment.start;
    const outputPath = path.join(OUTPUT_DIR, "curry-tiktok.mp4");

    await execFileAsync("ffmpeg", [
      "-y", "-i", concatOut, "-i", MUSIC,
      "-filter_complex",
      `[1:a]atrim=start=${musicStart}:end=${musicStart + totalDuration},asetpts=PTS-STARTPTS,volume=0.85,afade=t=in:st=0:d=0.3,afade=t=out:st=${totalDuration - 1}:d=1,atrim=0:${totalDuration},asetpts=PTS-STARTPTS[outa]`,
      "-map", "0:v", "-map", "[outa]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-t", String(totalDuration), "-movflags", "+faststart",
      outputPath,
    ], { timeout: 60_000 });

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const outDuration = await getDuration(outputPath);

    console.log(`\n  ✓ Output: test-renders/curry-tiktok.mp4`);
    console.log(`  ✓ Size: ${sizeMB} MB | Duration: ${outDuration.toFixed(1)}s`);
    console.log(`  ✓ ${effectsCount} shots with effects (${(effectsCount/shots.length*100).toFixed(0)}%)`);
    console.log(`  ✓ ${flashTransCount} flash transitions, ${cutCount} hard cuts`);
    console.log(`  ✓ ${speedRampCount} speed ramp(s)`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n═══════════════════════════════════════════════════");
}

render().catch(err => { console.error("Fatal:", err); process.exit(1); });
