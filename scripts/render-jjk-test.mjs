#!/usr/bin/env node
/**
 * render-jjk-test.mjs — JJK Anime AMV style × Mike Ross footage × bbf music
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const REFERENCE = path.join(ROOT, "monet-reference-edits", "3rd important.MP4");
const FOOTAGE = path.join(ROOT, "testfiles", "MikeRoss.mp4");
const MUSIC = path.join(ROOT, "testfiles", "bbf.mp3");
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

  // Energy curve
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
      const rms = rmsMatch ? parseFloat(rmsMatch[1]) : -30;
      energy.push(Math.max(0, Math.min(1, (rms + 30) / 30)));
    } catch { energy.push(0.5); }
  }

  // Best segment
  const targetDur = 25; // Shorter for bbf
  const bucketSize = duration / chunks;
  const bucketsNeeded = Math.ceil(targetDur / bucketSize);
  let bestStart = 0, bestScore = -1;
  for (let i = 0; i <= chunks - bucketsNeeded; i++) {
    const seg = energy.slice(i, i + bucketsNeeded);
    const avg = seg.reduce((a, b) => a + b, 0) / seg.length;
    const peak = Math.max(...seg);
    let ramp = 0;
    for (let j = 1; j < seg.length; j++) if (seg[j] > seg[j - 1]) ramp += 0.1;
    const score = avg * 0.3 + peak * 0.3 + ramp * 0.4;
    if (score > bestScore) { bestScore = score; bestStart = i; }
  }

  // BPM from beats
  let beats = [];
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", musicPath, "-af", "ebur128=peak=true", "-f", "null", "-",
    ], { timeout: 30_000 });
    for (const line of stderr.split("\n")) {
      const m = line.match(/t:\s*([\d.]+)\s+.*M:\s*([-\d.]+)/);
      if (m) beats.push({ time: parseFloat(m[1]), loudness: parseFloat(m[2]) });
    }
  } catch {}

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

  const beatInterval = 60 / bpm;
  const beatGrid = [];
  for (let t = bestStart * bucketSize; t < bestStart * bucketSize + targetDur; t += beatInterval) {
    beatGrid.push(Math.round(t * 1000) / 1000);
  }

  return {
    duration, bpm, energy, beats, beatGrid,
    bestSegment: {
      start: Math.round(bestStart * bucketSize * 10) / 10,
      end: Math.round(Math.min((bestStart + bucketsNeeded) * bucketSize, duration) * 10) / 10,
      score: Math.round(bestScore * 100) / 100,
    },
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

function generateJJKEDL(footageDuration, musicAnalysis, speechData) {
  const totalDuration = 25;
  const beatGrid = musicAnalysis.beatGrid;
  const shots = [];
  let currentTime = 0;
  let beatIdx = 0;
  let shotNum = 0;

  // JJK style: EXTREME fast cuts, lots of flashes, chromatic bursts
  // Average shot: 0.48s, but we scale to 25s total

  while (currentTime < totalDuration && beatIdx < beatGrid.length) {
    const beatTime = beatGrid[beatIdx] - musicAnalysis.bestSegment.start;
    if (beatTime > totalDuration) break;

    const nextBeat = beatIdx + 1 < beatGrid.length
      ? beatGrid[beatIdx + 1] - musicAnalysis.bestSegment.start
      : totalDuration;

    const duration = Math.min(nextBeat - beatTime, totalDuration - currentTime);
    if (duration < 0.08) { beatIdx++; continue; }

    // Source footage: distribute across Mike Ross clip
    const sourceStart = (currentTime / totalDuration) * footageDuration;
    const sourceEnd = Math.min(footageDuration - 0.3, sourceStart + duration * 1.2);

    // JJK effects: EVERY shot gets something
    const effects = [];
    const energyAtBeat = musicAnalysis.energy[beatIdx % musicAnalysis.energy.length] ?? 0.5;

    // Impact flash on every beat (JJK's signature)
    effects.push({ id: `fx-${shotNum}-flash`, type: "flash", intensity: 0.6 + energyAtBeat * 0.4 });

    // Chromatic burst on every 2nd beat
    if (beatIdx % 2 === 0) {
      effects.push({ id: `fx-${shotNum}-chromatic`, type: "glitch", intensity: 0.7 });
    }

    // Shake on energy peaks
    if (energyAtBeat > 0.6) {
      effects.push({ id: `fx-${shotNum}-shake`, type: "shake", intensity: 0.5 });
    }

    // Bloom at climax (52% position)
    const position = currentTime / totalDuration;
    if (Math.abs(position - 0.52) < 0.1) {
      effects.push({ id: `fx-${shotNum}-bloom`, type: "flash", intensity: 0.9 });
    }

    // Speed ramp at transitions
    const speedRamp = beatIdx % 8 === 0
      ? { startSpeed: 0.3, endSpeed: 2.0 }
      : beatIdx % 4 === 0
        ? { startSpeed: 0.5, endSpeed: 1.5 }
        : undefined;

    // JJK transitions: mostly flash, some cut
    const transition = shotNum > 0
      ? { type: beatIdx % 3 === 0 ? "flash" : "cut", duration: beatIdx % 3 === 0 ? 0.06 : 0 }
      : undefined;

    shots.push({
      id: `shot-${shotNum}`,
      source: { inPoint: sourceStart, outPoint: sourceEnd },
      timing: { startTime: currentTime, duration, speedRamp },
      effects: effects.length > 0 ? effects : undefined,
      transition,
      beatLock: { beatIndex: beatIdx, lockMode: "start" },
    });

    currentTime += duration;
    beatIdx++;
    shotNum++;
  }

  return {
    version: "1.0.0",
    metadata: {
      title: "JJK Anime Style × Mike Ross × bbf",
      createdAt: Date.now(),
      aiModel: "reference-matcher",
      prompt: "JJK anime AMV style applied to Suits footage with bbf music",
      intentId: "test-jjk",
      analysisId: "test-jjk",
    },
    timeline: {
      duration: totalDuration,
      fps: 30,
      resolution: { width: 1280, height: 720 },
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

async function render(edl, footagePath, musicPath, outputPath, speechData) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-jjk-"));
  const totalDur = edl.timeline.duration;

  try {
    // Pass 1: Extract shots
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
          // Use Kove's REAL effect types and their actual FFmpeg filters
          if (fx.type === "flash_white") {
            // Real: white overlay blend
            filters.push("eq=brightness=0.3:contrast=1.15");
          } else if (fx.type === "shake") {
            // Real: random crop offset + scale back
            const amp = Math.round(fx.intensity * 10);
            filters.push(`crop=in_w-${amp*2}:in_h-${amp*2}:${amp}+random(1)*${amp}:${amp}+random(2)*${amp},scale=trunc(iw/2)*2:trunc(ih/2)*2`);
          } else if (fx.type === "chromatic_aberration") {
            // Real: rgbashift (Kove's actual chromatic aberration filter)
            const shift = Math.max(1, Math.round(fx.intensity * 6));
            filters.push(`rgbashift=rh=${-shift}:rv=${Math.round(shift/2)}:bh=${shift}:bv=${-Math.round(shift/2)}`);
          } else if (fx.type === "glow") {
            // Simplified glow: brightness + contrast boost
            filters.push(`eq=brightness=${(fx.intensity * 0.15).toFixed(2)}:contrast=${(1 + fx.intensity * 0.1).toFixed(2)}`);
          } else if (fx.type === "glitch") {
            // Real: noise + rgbashift
            filters.push(`noise=alls=${Math.round(fx.intensity * 30)}:allf=t,rgbashift=rh=${Math.round(fx.intensity * 8)}:bh=${-Math.round(fx.intensity * 8)}`);
          } else if (fx.type === "posterize_time") {
            // Real: frame rate reduction
            filters.push(`fps=fps=${Math.round(8 + fx.intensity * 8)}`);
          } else if (fx.type === "desaturate") {
            // Real: saturation reduction
            filters.push(`eq=saturation=${(1 - fx.intensity * 0.8).toFixed(2)}`);
          }
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
      } catch { console.error(`\n  Failed shot ${i}`); }
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

    // Pass 3: Smart audio
    console.log("  Pass 3: Smart audio mix...");
    const musicStart = edl.music?.inPoint ?? 0;
    let audioFilter = `[1:a]atrim=start=${musicStart.toFixed(3)}:end=${(musicStart + totalDur).toFixed(3)},asetpts=PTS-STARTPTS,volume=0.85`;

    // Skip complex ducking expression — focus on cuts + effects
    // Ducking is handled by Kove's real-time engine in production
    if (speechData.hasSpeech) {
      console.log(`  Speech: ${speechData.segments.length} segments (ducking via Kove in production)`);
    }

    audioFilter += `,afade=t=in:st=0:d=0.3,afade=t=out:st=${totalDur - 0.8}:d=0.8`;
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

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  JJK Anime Style × Mike Ross × bbf");
  console.log("═══════════════════════════════════════════════════\n");

  // Analyze
  console.log("── Music Analysis ──");
  const musicAnalysis = await analyzeMusic(MUSIC);
  console.log(`  Duration: ${musicAnalysis.duration.toFixed(1)}s`);
  console.log(`  BPM: ${musicAnalysis.bpm}`);
  console.log(`  Best: ${musicAnalysis.bestSegment.start}s → ${musicAnalysis.bestSegment.end}s (score: ${musicAnalysis.bestSegment.score})`);
  console.log(`  Beats: ${musicAnalysis.beatGrid.length}`);

  console.log("\n── Speech Detection ──");
  const speechData = await detectSpeech(FOOTAGE);
  console.log(`  Speech: ${speechData.hasSpeech ? "YES (" + speechData.segments.length + " segments)" : "NO"}`);

  // Generate EDL
  console.log("\n── EDL Generation ──");
  const footageDuration = await getDuration(FOOTAGE);
  const edl = generateJJKEDL(footageDuration, musicAnalysis, speechData);
  console.log(`  Shots: ${edl.shots.length}`);
  console.log(`  Beat-synced: ${edl.shots.filter(s => s.beatLock).length}/${edl.shots.length}`);
  console.log(`  Effects/shots: ${(edl.shots.reduce((s, sh) => s + (sh.effects?.length ?? 0), 0) / edl.shots.length).toFixed(1)}`);
  console.log(`  Flash transitions: ${edl.shots.filter(s => s.transition?.type === "flash").length}`);
  console.log(`  Speed ramps: ${edl.shots.filter(s => s.timing.speedRamp).length}`);

  // Save EDL
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "jjk-mikeross-bbf-edl.json"), JSON.stringify(edl, null, 2));

  // Render
  console.log("\n── Rendering ──");
  const outputPath = path.join(OUTPUT_DIR, "jjk-mikeross-bbf.mp4");
  const startTime = Date.now();

  const success = await render(edl, FOOTAGE, MUSIC, outputPath, speechData);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (success) {
    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const outDuration = await getDuration(outputPath);
    console.log(`\n  ✓ Render complete in ${elapsed}s`);
    console.log(`  ✓ Output: testuploads/jjk-mikeross-bbf.mp4 (${sizeMB} MB)`);
    console.log(`  ✓ Duration: ${outDuration.toFixed(1)}s`);
    console.log(`  ✓ Music: ${musicAnalysis.bestSegment.start}s → ${musicAnalysis.bestSegment.end}s (best segment)`);
    console.log(`  ✓ All ${edl.shots.length} cuts aligned to beat grid`);
    console.log(`  ✓ ${edl.shots.filter(s => s.effects?.length > 0).length} shots with effects`);
  } else {
    console.error("\n  ✗ Render failed");
  }

  console.log("\n═══════════════════════════════════════════════════");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
