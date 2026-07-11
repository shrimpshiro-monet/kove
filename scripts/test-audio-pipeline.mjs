#!/usr/bin/env node
/**
 * test-audio-pipeline.mjs — Test song structure + speech detection + ducking.
 *
 * Analyzes the test music and footage, then renders a mixed audio track.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const MUSIC = path.join(ROOT, "testfiles", "Outfit (with 21 Savage).mp3");
const FOOTAGE = path.join(ROOT, "testfiles", "High Quality Steph Curry Clips for Edits! (2024-25).mp4");
const OUTPUT_DIR = path.join(ROOT, "testuploads");

async function getDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

async function analyzeLoudness(file) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-",
    ], { timeout: 60_000 });

    const integrated = stderr.match(/Integrated loudness:\s*([-\d.]+)/);
    const range = stderr.match(/Loudness range:\s*([-\d.]+)/);
    const peak = stderr.match(/True peak:\s*([-\d.]+)/);

    return {
      integrated: integrated ? parseFloat(integrated[1]) : null,
      range: range ? parseFloat(range[1]) : null,
      peak: peak ? parseFloat(peak[1]) : null,
    };
  } catch {
    return { integrated: null, range: null, peak: null };
  }
}

async function detectSpeech(videoPath) {
  const duration = await getDuration(videoPath);
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-af", "silencedetect=noise=-30dB:d=0.3",
    "-f", "null", "-",
  ], { timeout: 60_000 }).catch(err => ({ stderr: err.stderr ?? "" }));

  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));

  const segments = [];
  let lastEnd = 0;
  for (let i = 0; i < Math.max(starts.length, ends.length); i++) {
    const segEnd = i < starts.length ? starts[i] : duration;
    if (segEnd - lastEnd > 0.15) {
      segments.push({ start: lastEnd, end: segEnd });
    }
    if (i < ends.length) lastEnd = ends[i];
  }

  const speechDuration = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
  return { segments, duration, speechRatio: speechDuration / duration, hasSpeech: segments.length > 0 };
}

async function detectBeats(audioPath) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", audioPath, "-af", "ebur128=peak=true", "-f", "null", "-",
    ], { timeout: 60_000 });

    const lines = stderr.split("\n");
    const beats = [];
    for (const line of lines) {
      const m = line.match(/t:\s*([\d.]+)\s+.*M:\s*([-\d.]+)/);
      if (m) {
        beats.push({ time: parseFloat(m[1]), loudness: parseFloat(m[2]) });
      }
    }
    return beats;
  } catch {
    return [];
  }
}

function detectBPM(beats) {
  if (beats.length < 4) return 120;
  const strong = beats.filter(b => b.loudness > -20);
  if (strong.length < 4) return 120;

  const intervals = [];
  for (let i = 1; i < strong.length; i++) {
    const interval = strong[i].time - strong[i - 1].time;
    if (interval > 0.1 && interval < 2) intervals.push(interval);
  }
  if (intervals.length === 0) return 120;

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.round(60 / median);
}

function findBestSegment(energyData, duration, targetDuration) {
  const bucketSize = duration / energyData.length;
  const bucketsNeeded = Math.ceil(targetDuration / bucketSize);

  let bestStart = 0;
  let bestScore = -1;

  for (let i = 0; i <= energyData.length - bucketsNeeded; i++) {
    const segment = energyData.slice(i, i + bucketsNeeded);
    const avg = segment.reduce((a, b) => a + b, 0) / segment.length;
    const variance = segment.reduce((s, v) => s + (v - avg) ** 2, 0) / segment.length;
    const peak = Math.max(...segment);
    const score = avg * 0.4 + variance * 0.2 + peak * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  return {
    start: Math.round(bestStart * bucketSize * 10) / 10,
    end: Math.round(Math.min((bestStart + bucketsNeeded) * bucketSize, duration) * 10) / 10,
    score: Math.round(bestScore * 100) / 100,
  };
}

function buildDuckFilter(segments, musicStart, duckLevel) {
  const points = [];
  const attack = 0.15;
  const release = 0.3;

  for (const seg of segments) {
    const s = Math.max(0, seg.start - musicStart);
    const e = Math.min(30, seg.end - musicStart);
    if (e < 0 || s > 30) continue;

    points.push(`volume=1.0:t=${Math.max(0, s - attack).toFixed(3)}`);
    points.push(`volume=${duckLevel}:t=${s.toFixed(3)}`);
    points.push(`volume=${duckLevel}:t=${e.toFixed(3)}`);
    points.push(`volume=1.0:t=${(e + release).toFixed(3)}`);
  }

  return points.length > 0 ? points.join(":") : null;
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Audio Intelligence Pipeline Test");
  console.log("═══════════════════════════════════════════════════\n");

  // 1. Analyze music
  console.log("── Song Analysis ──");
  const musicDuration = await getDuration(MUSIC);
  const musicLoudness = await analyzeLoudness(MUSIC);
  const beats = await detectBeats(MUSIC);
  const bpm = detectBPM(beats);

  console.log(`  Duration: ${musicDuration.toFixed(1)}s`);
  console.log(`  BPM: ${bpm}`);
  console.log(`  Loudness: ${musicLoudness.integrated?.toFixed(1)} LUFS (range: ${musicLoudness.range?.toFixed(1)}, peak: ${musicLoudness.peak?.toFixed(1)} dBTP)`);
  console.log(`  Beats detected: ${beats.length}`);

  // Energy curve from beats
  const chunks = 100;
  const chunkDur = musicDuration / chunks;
  const energyData = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkDur;
    const end = start + chunkDur;
    const chunkBeats = beats.filter(b => b.time >= start && b.time < end);
    const avgLoudness = chunkBeats.length > 0
      ? chunkBeats.reduce((s, b) => s + b.loudness, 0) / chunkBeats.length
      : -30;
    energyData.push(Math.max(0, Math.min(1, (avgLoudness + 30) / 30)));
  }

  const bestSegment = findBestSegment(energyData, musicDuration, 30);
  console.log(`\n  Best 30s segment: ${bestSegment.start}s → ${bestSegment.end}s (score: ${bestSegment.score})`);
  console.log(`  Energy at peak: ${energyData[Math.round(bestSegment.start / musicDuration * 100)]?.toFixed(2)}`);

  // 2. Analyze footage for speech
  console.log("\n── Speech Detection ──");
  const speech = await detectSpeech(FOOTAGE);
  console.log(`  Duration: ${speech.duration.toFixed(1)}s`);
  console.log(`  Speech detected: ${speech.hasSpeech ? "YES" : "NO"}`);
  console.log(`  Speech segments: ${speech.segments.length}`);
  console.log(`  Speech ratio: ${(speech.speechRatio * 100).toFixed(1)}%`);

  if (speech.segments.length > 0) {
    console.log("  Segments:");
    for (const seg of speech.segments.slice(0, 5)) {
      console.log(`    ${seg.start.toFixed(1)}s → ${seg.end.toFixed(1)}s (${(seg.end - seg.start).toFixed(1)}s)`);
    }
    if (speech.segments.length > 5) {
      console.log(`    ... and ${speech.segments.length - 5} more`);
    }
  }

  // 3. Mix audio with ducking
  console.log("\n── Audio Mix ──");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "mixed-audio.m4a");

  const duckLevel = 0.2;
  const musicStart = bestSegment.start;
  const targetDuration = 30;

  // Build filter: trim music to best segment, apply ducking, fades
  let filter = `[0:a]atrim=start=${musicStart.toFixed(3)}:end=${(musicStart + targetDuration).toFixed(3)},asetpts=PTS-STARTPTS`;
  filter += `,volume=0.85`;

  if (speech.hasSpeech) {
    const duckFilter = buildDuckFilter(speech.segments, musicStart, duckLevel);
    if (duckFilter) {
      filter += `,${duckFilter}`;
      console.log(`  Ducking: ON (level: ${duckLevel})`);
    }
  } else {
    console.log("  Ducking: OFF (no speech detected)");
  }

  filter += `,afade=t=in:st=0:d=0.5,afade=t=out:st=29:d=1`;
  filter += `,atrim=0:${targetDuration},asetpts=PTS-STARTPTS[out]`;

  try {
    await execFileAsync("ffmpeg", [
      "-y", "-i", MUSIC,
      "-filter_complex", filter,
      "-map", "[out]",
      "-c:a", "aac", "-b:a", "192k",
      "-t", String(targetDuration),
      outputPath,
    ], { timeout: 60_000 });

    const outDuration = await getDuration(outputPath);
    const outLoudness = await analyzeLoudness(outputPath);

    console.log(`  Output: testuploads/mixed-audio.m4a`);
    console.log(`  Duration: ${outDuration.toFixed(1)}s`);
    console.log(`  Loudness: ${outLoudness.integrated?.toFixed(1)} LUFS`);
    console.log(`  Segment used: ${musicStart.toFixed(1)}s → ${(musicStart + targetDuration).toFixed(1)}s`);
    console.log("  ✓ Mix complete!");
  } catch (err) {
    console.error(`  ✗ Mix failed: ${err.message}`);
  }

  console.log("\n═══════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
