#!/usr/bin/env node
/**
 * analyze-references.mjs — Deep reference video analysis pipeline.
 *
 * Runs FFmpeg scene detection + energy analysis on every video in
 * monet-reference-edits/ and reference-edits-2/, producing per-shot
 * timing, energy curves, effect vocabulary, and beat alignment data.
 *
 * Output: src/server/data/reference-training-data.json
 *
 * Usage: node scripts/analyze-references.mjs [--video <filename>]
 *   --video  Analyze a single video instead of all
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REFERENCE_DIRS = [
  path.join(ROOT, "monet-reference-edits"),
  path.join(ROOT, "reference-edits-2"),
];
const OUTPUT_PATH = path.join(ROOT, "src", "server", "data", "reference-training-data.json");

// ── CLI args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const singleVideo = args.includes("--video") ? args[args.indexOf("--video") + 1] : null;

// ── Helpers ───────────────────────────────────────────────────────

async function getVideoInfo(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=width,height,codec_name,r_frame_rate",
      "-of", "json",
      filePath,
    ], { timeout: 30_000 });
    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find(s => s.codec_type === "video");
    const duration = parseFloat(info.format?.duration ?? "0");
    const fps = videoStream?.r_frame_rate
      ? eval(videoStream.r_frame_rate)
      : 30;
    return {
      duration,
      width: videoStream?.width ?? 0,
      height: videoStream?.height ?? 0,
      codec: videoStream?.codec_name ?? "unknown",
      fps: Math.round(fps),
    };
  } catch {
    return { duration: 0, width: 0, height: 0, codec: "unknown", fps: 30 };
  }
}

async function detectSceneChanges(videoPath, threshold = 0.3) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scene-"));
  try {
    const args = [
      "-i", videoPath,
      "-vf", `select='gt(scene,${threshold})',showinfo`,
      "-vsync", "vfr",
      "-f", "null",
      "-",
    ];

    let stderr = "";
    try {
      const result = await execFileAsync("ffmpeg", args, { timeout: 180_000 });
      stderr = result.stderr ?? "";
    } catch (err) {
      stderr = err.stderr ?? err.stdout ?? "";
    }

    // Parse timestamps from showinfo
    const timestamps = [];
    const regex = /pts_time:\s*([\d.]+)/g;
    let match;
    while ((match = regex.exec(stderr)) !== null) {
      const ts = parseFloat(match[1]);
      if (!isNaN(ts) && ts >= 0) timestamps.push(ts);
    }

    // Deduplicate within 50ms
    const deduped = [timestamps[0]];
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] - deduped[deduped.length - 1] >= 0.05) {
        deduped.push(timestamps[i]);
      }
    }

    return deduped;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function analyzeEnergy(videoPath, sampleInterval = 0.5) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "energy-"));
  const framesDir = path.join(tmpDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  try {
    // Extract raw grayscale pixel data using FFmpeg rawvideo format
    // This gives us actual pixel bytes, not PNG-compressed data
    const rawPath = path.join(framesDir, "raw.rgb");
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vf", `fps=1/${sampleInterval},format=gray`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      rawPath,
    ], { timeout: 180_000 }).catch(() => {});

    // Get frame dimensions
    let frameW = 160, frameH = 120;
    try {
      const { stdout: probeOut } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        videoPath,
      ], { timeout: 10_000 });
      const dims = probeOut.trim().split(",").map(Number);
      if (dims.length === 2 && dims[0] > 0) {
        frameW = dims[0];
        frameH = dims[1];
      }
    } catch {}

    // Downscale for analysis — 160px wide is enough for energy
    const scaleW = 160;
    const scaleH = Math.round(frameH * (scaleW / frameW));
    const frameSize = scaleW * scaleH; // 1 byte per pixel (gray)

    // Re-extract at smaller size for speed
    const smallPath = path.join(framesDir, "small.rgb");
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vf", `fps=1/${sampleInterval},scale=${scaleW}:${scaleH}:flags=bilinear,format=gray`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      smallPath,
    ], { timeout: 180_000 }).catch(() => {});

    try {
      const rawBuffer = await fs.readFile(smallPath);
      const totalFrames = Math.floor(rawBuffer.length / frameSize);

      const frames = [];
      let prevData = null;

      for (let i = 0; i < totalFrames; i++) {
        const offset = i * frameSize;
        const frameData = rawBuffer.subarray(offset, offset + frameSize);

        // Brightness: mean pixel value
        let brightness = 0;
        let sum = 0;
        for (let j = 0; j < frameData.length; j += 4) {
          sum += frameData[j];
        }
        brightness = sum / (frameData.length / 4) / 255;

        // Motion: mean absolute difference from previous frame
        let motion = 0;
        if (prevData && prevData.length === frameData.length) {
          let diff = 0;
          let count = 0;
          for (let j = 0; j < frameData.length; j += 4) {
            diff += Math.abs(frameData[j] - prevData[j]);
            count++;
          }
          motion = count > 0 ? Math.min(1, (diff / count) / 64) : 0;
        }

        const combined = Math.min(1, motion * 0.65 + brightness * 0.35);
        frames.push({ timestamp: i * sampleInterval, motion, brightness, combined });
        prevData = frameData;
      }

      return frames;
    } catch {
      // Fallback: empty
      return [];
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildEnergyCurve(frames, totalDuration, buckets = 20) {
  if (frames.length === 0 || totalDuration <= 0) {
    return new Array(buckets).fill(0.5);
  }
  const bucketSize = totalDuration / buckets;
  const curve = [];
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSize;
    const end = start + bucketSize;
    const bucketFrames = frames.filter(f => f.timestamp >= start && f.timestamp < end);
    if (bucketFrames.length > 0) {
      curve.push(Math.round((bucketFrames.reduce((s, f) => s + f.combined, 0) / bucketFrames.length) * 100) / 100);
    } else {
      curve.push(curve.length > 0 ? curve[curve.length - 1] : 0.5);
    }
  }
  return curve;
}

function detectBeatPattern(cutTimestamps, totalDuration) {
  if (cutTimestamps.length < 3) return { bpm: 0, confidence: 0, grid: [] };

  // Build onset signal: 1 at each cut, 0 elsewhere
  const sampleRate = 10; // 10 samples per second
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const onset = new Float32Array(totalSamples);
  for (const t of cutTimestamps) {
    const idx = Math.round(t * sampleRate);
    if (idx < totalSamples) onset[idx] = 1;
  }

  // Autocorrelation for tempo detection
  const minBPM = 40;
  const maxBPM = 300;
  const minLag = Math.floor(60 / maxBPM * sampleRate);
  const maxLag = Math.floor(60 / minBPM * sampleRate);

  let bestLag = minLag;
  let bestCorr = -1;

  for (let lag = minLag; lag <= Math.min(maxLag, totalSamples / 2); lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < totalSamples - lag; i++) {
      corr += onset[i] * onset[i + lag];
      count++;
    }
    corr /= count;
    // Weight by lag to prefer faster tempos (more musical)
    const weight = 1 + (1 / lag) * 10;
    const weighted = corr * weight;
    if (weighted > bestCorr) {
      bestCorr = weighted;
      bestLag = lag;
    }
  }

  const bpm = bestLag > 0 ? Math.round(60 / (bestLag / sampleRate)) : 0;

  // Confidence: how periodic are the onsets at this lag
  let matchCount = 0;
  for (const t of cutTimestamps) {
    const nearestBeat = Math.round(t / (bestLag / sampleRate)) * (bestLag / sampleRate);
    if (Math.abs(t - nearestBeat) < 0.15) matchCount++;
  }
  const confidence = cutTimestamps.length > 0 ? matchCount / cutTimestamps.length : 0;

  // Generate beat grid
  const beatInterval = 60 / bpm;
  const grid = [];
  for (let t = 0; t < totalDuration; t += beatInterval) {
    grid.push(Math.round(t * 1000) / 1000);
  }

  return {
    bpm,
    confidence: Math.round(confidence * 100) / 100,
    avgInterval: Math.round(beatInterval * 1000) / 1000,
    grid,
  };
}

function classifyEffectVocabulary(energyFrames, cutTimestamps, totalDuration) {
  const effects = [];

  if (energyFrames.length < 3) return effects;

  // 1. Detect impact flashes: sharp energy spike within ±0.3s of a cut
  for (const cutTime of cutTimestamps) {
    const nearby = energyFrames.filter(f => Math.abs(f.timestamp - cutTime) < 0.3);
    const peakEnergy = nearby.reduce((max, f) => Math.max(max, f.combined), 0);
    if (peakEnergy > 0.6) {
      effects.push({ type: "impact_flash", timestamp: cutTime, intensity: Math.round(peakEnergy * 100) / 100 });
    }
  }

  // 2. Detect speed ramps: energy drops below 30% of surrounding average
  for (let i = 5; i < energyFrames.length - 5; i++) {
    const before = energyFrames.slice(i - 5, i).reduce((s, f) => s + f.combined, 0) / 5;
    const after = energyFrames.slice(i + 1, i + 6).reduce((s, f) => s + f.combined, 0) / 5;
    const current = energyFrames[i].combined;
    const surrounding = (before + after) / 2;
    if (current < surrounding * 0.35 && surrounding > 0.3) {
      effects.push({ type: "speed_ramp", timestamp: energyFrames[i].timestamp, intensity: Math.round((1 - current / surrounding) * 100) / 100 });
    }
  }

  // 3. Detect shake/vibration: rapid motion oscillations
  for (let i = 2; i < energyFrames.length - 2; i++) {
    const m = energyFrames[i].motion;
    const m1 = energyFrames[i - 1]?.motion ?? 0;
    const m2 = energyFrames[i + 1]?.motion ?? 0;
    // Motion spike followed by drop followed by spike = shake
    if (m > 0.5 && m1 < m * 0.6 && m2 < m * 0.6) {
      effects.push({ type: "context_shake", timestamp: energyFrames[i].timestamp, intensity: Math.round(m * 100) / 100 });
    }
  }

  // 4. Detect glow/bloom: sustained high brightness sections
  let glowStart = -1;
  for (let i = 0; i < energyFrames.length; i++) {
    if (energyFrames[i].brightness > 0.65) {
      if (glowStart === -1) glowStart = i;
    } else {
      if (glowStart !== -1 && i - glowStart >= 3) {
        effects.push({
          type: "bloom_highlights",
          timestamp: energyFrames[glowStart].timestamp,
          duration: (i - glowStart) * 0.5,
          intensity: 0.7,
        });
      }
      glowStart = -1;
    }
  }

  // 5. Detect chromatic burst: very high motion + high brightness simultaneously
  for (const frame of energyFrames) {
    if (frame.motion > 0.6 && frame.brightness > 0.5) {
      effects.push({
        type: "chromatic_burst",
        timestamp: frame.timestamp,
        intensity: Math.round(((frame.motion + frame.brightness) / 2) * 100) / 100,
      });
    }
  }

  // Deduplicate effects within 0.5s of each other (keep highest intensity)
  return deduplicateEffects(effects);
}

function deduplicateEffects(effects) {
  if (effects.length === 0) return effects;
  const sorted = [...effects].sort((a, b) => a.timestamp - b.timestamp);
  const result = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    if (sorted[i].type === last.type && sorted[i].timestamp - last.timestamp < 0.5) {
      if (sorted[i].intensity > last.intensity) {
        result[result.length - 1] = sorted[i];
      }
    } else {
      result.push(sorted[i]);
    }
  }
  return result;
}

function detectTransitionTypes(cutTimestamps, energyFrames) {
  const transitions = [];
  for (const cutTime of cutTimestamps) {
    const frame = energyFrames.find(f => Math.abs(f.timestamp - cutTime) < 0.5);
    const energy = frame?.combined ?? 0.5;

    if (energy > 0.7) {
      transitions.push({ type: "flash", timestamp: cutTime });
    } else if (energy > 0.4) {
      transitions.push({ type: "cut", timestamp: cutTime });
    } else {
      transitions.push({ type: "cut", timestamp: cutTime });
    }
  }
  return transitions;
}

function buildShotTimeline(cutTimestamps, totalDuration) {
  const shots = [];
  let startTime = 0;

  for (let i = 0; i <= cutTimestamps.length; i++) {
    const endTime = i < cutTimestamps.length ? cutTimestamps[i] : totalDuration;
    const duration = endTime - startTime;
    if (duration > 0.05) {
      shots.push({
        index: i,
        startTime: Math.round(startTime * 1000) / 1000,
        endTime: Math.round(endTime * 1000) / 1000,
        duration: Math.round(duration * 1000) / 1000,
      });
    }
    startTime = endTime;
  }

  return shots;
}

function computePacingMetrics(shots) {
  if (shots.length === 0) return { avg: 0, median: 0, min: 0, max: 0, variance: 0 };

  const durations = shots.map(s => s.duration);
  const sorted = [...durations].sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = durations.reduce((s, d) => s + (d - avg) ** 2, 0) / durations.length;

  return {
    avg: Math.round(avg * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    variance: Math.round(variance * 10000) / 10000,
  };
}

// ── Main ──────────────────────────────────────────────────────────

async function analyzeVideo(filePath, relativePath) {
  const name = path.basename(filePath, path.extname(filePath));
  console.log(`\n  Analyzing: ${relativePath}`);

  const info = await getVideoInfo(filePath);
  console.log(`    Duration: ${info.duration.toFixed(1)}s, ${info.width}x${info.height}, ${info.fps}fps`);

  // Scene detection with multiple thresholds
  const cuts_02 = await detectSceneChanges(filePath, 0.2);
  const cuts_03 = await detectSceneChanges(filePath, 0.3);
  const cuts_04 = await detectSceneChanges(filePath, 0.4);

  // Use the threshold that gives the most reasonable cut count
  // For fast edits (< 1s avg), use 0.2. For normal, use 0.3.
  const expectedCuts = info.duration * 2; // rough estimate
  let cuts = cuts_03;
  if (cuts_02.length > expectedCuts * 1.5) cuts = cuts_03;
  if (cuts_03.length < expectedCuts * 0.3) cuts = cuts_02;

  console.log(`    Cuts: ${cuts.length} (threshold 0.2: ${cuts_02.length}, 0.3: ${cuts_03.length}, 0.4: ${cuts_04.length})`);

  // Energy analysis
  const energyFrames = await analyzeEnergy(filePath);
  const energyCurve = buildEnergyCurve(energyFrames, info.duration);
  console.log(`    Energy frames: ${energyFrames.length}`);

  // Build shot timeline
  const shots = buildShotTimeline(cuts, info.duration);
  const pacing = computePacingMetrics(shots);
  console.log(`    Avg shot: ${pacing.avg}s, median: ${pacing.median}s, range: ${pacing.min}-${pacing.max}s`);

  // Beat pattern
  const beat = detectBeatPattern(cuts, info.duration);
  console.log(`    Beat: ~${beat.bpm} BPM (confidence: ${(beat.confidence * 100).toFixed(0)}%)`);

  // Effect vocabulary
  const effects = classifyEffectVocabulary(energyFrames, cuts, info.duration);
  const effectCounts = {};
  for (const e of effects) {
    effectCounts[e.type] = (effectCounts[e.type] || 0) + 1;
  }
  console.log(`    Effects: ${JSON.stringify(effectCounts)}`);

  // Transition types
  const transitions = detectTransitionTypes(cuts, energyFrames);
  const transCounts = {};
  for (const t of transitions) {
    transCounts[t.type] = (transCounts[t.type] || 0) + 1;
  }
  console.log(`    Transitions: ${JSON.stringify(transCounts)}`);

  // Peak energy
  const peakFrame = energyFrames.reduce((max, f) => f.combined > max.combined ? f : max, energyFrames[0] || { combined: 0, timestamp: 0 });
  const climaxPosition = info.duration > 0 ? peakFrame.timestamp / info.duration : 0.5;

  // Breathing moments
  const breathing = [];
  for (let i = 3; i < energyFrames.length - 3; i++) {
    const before = energyFrames.slice(i - 3, i).reduce((s, f) => s + f.combined, 0) / 3;
    const after = energyFrames.slice(i + 1, i + 4).reduce((s, f) => s + f.combined, 0) / 3;
    const current = energyFrames[i].combined;
    if (current < before * 0.7 && current < after * 0.7 && current < 0.4) {
      breathing.push(Math.round(energyFrames[i].timestamp * 1000) / 1000);
    }
  }

  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    file: relativePath,
    name,
    info,
    shots: {
      count: shots.length,
      timeline: shots,
      pacing,
    },
    cuts: {
      timestamps: cuts,
      count: cuts.length,
      cutRate: info.duration > 0 ? Math.round((cuts.length / info.duration) * 100) / 100 : 0,
      thresholds: { t02: cuts_02.length, t03: cuts_03.length, t04: cuts_04.length },
    },
    energy: {
      curve: energyCurve,
      avgBrightness: energyFrames.length > 0
        ? Math.round((energyFrames.reduce((s, f) => s + f.brightness, 0) / energyFrames.length) * 100) / 100
        : 0,
      avgMotion: energyFrames.length > 0
        ? Math.round((energyFrames.reduce((s, f) => s + f.motion, 0) / energyFrames.length) * 100) / 100
        : 0,
      peakMoment: Math.round(peakFrame.timestamp * 1000) / 1000,
      peakIntensity: Math.round(peakFrame.combined * 100) / 100,
      climaxPosition: Math.round(climaxPosition * 100) / 100,
      breathingMoments: breathing,
      frameCount: energyFrames.length,
    },
    beat,
    effects: {
      detected: effects,
      vocabulary: effectCounts,
      total: effects.length,
    },
    transitions: {
      timeline: transitions,
      vocabulary: transCounts,
    },
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Monet Reference Video Deep Analysis Pipeline");
  console.log("═══════════════════════════════════════════════════\n");

  // Find all videos
  const allVideos = [];
  for (const dir of REFERENCE_DIRS) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (/\.mp4$/i.test(file)) {
          const fullPath = path.join(dir, file);
          const relativePath = path.relative(ROOT, fullPath);
          allVideos.push({ fullPath, relativePath });
        }
      }
    } catch {
      console.warn(`  Directory not found: ${dir}`);
    }
  }

  if (singleVideo) {
    const match = allVideos.find(v => v.relativePath.includes(singleVideo));
    if (!match) {
      console.error(`  Video not found: ${singleVideo}`);
      process.exit(1);
    }
    allVideos.length = 0;
    allVideos.push(match);
  }

  console.log(`  Found ${allVideos.length} reference videos\n`);

  const results = [];
  for (const video of allVideos) {
    try {
      const result = await analyzeVideo(video.fullPath, video.relativePath);
      results.push(result);
    } catch (err) {
      console.error(`  FAILED: ${video.relativePath} — ${err.message}`);
    }
  }

  // Build summary
  const summary = {
    totalVideos: results.length,
    analyzedAt: new Date().toISOString(),
    styleGroups: {},
  };

  for (const r of results) {
    const avgShot = r.shots.pacing.avg;
    let group = "unknown";
    if (avgShot < 0.3) group = "extreme_fast";
    else if (avgShot < 0.6) group = "very_fast";
    else if (avgShot < 1.0) group = "fast";
    else if (avgShot < 1.5) group = "moderate";
    else if (avgShot < 2.5) group = "moderate_slow";
    else group = "slow";

    if (!summary.styleGroups[group]) {
      summary.styleGroups[group] = { count: 0, avgCutRate: 0, avgShotDuration: 0, videos: [] };
    }
    summary.styleGroups[group].count++;
    summary.styleGroups[group].avgCutRate += r.cuts.cutRate;
    summary.styleGroups[group].avgShotDuration += r.shots.pacing.avg;
    summary.styleGroups[group].videos.push(r.id);
  }

  // Average the group stats
  for (const group of Object.values(summary.styleGroups)) {
    group.avgCutRate = Math.round((group.avgCutRate / group.count) * 100) / 100;
    group.avgShotDuration = Math.round((group.avgShotDuration / group.count) * 1000) / 1000;
  }

  const output = { summary, videos: results };

  // Write output
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Done! ${results.length} videos analyzed.`);
  console.log(`  Output: ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(`  Style groups: ${Object.keys(summary.styleGroups).join(", ")}`);
  console.log(`═══════════════════════════════════════════════════`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
