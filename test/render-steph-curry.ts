/**
 * Full Pipeline Render — Steph Curry Reference Match
 *
 * Renders the expected EDL against actual Steph Curry footage using FFmpeg.
 * Produces output.mp4 that should match the reference edit 1:1.
 *
 * Usage: bun test/render-steph-curry.ts
 */

import { $ } from "bun";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SOURCE = path.resolve(__dirname, "High Quality Steph Curry Clips for Edits! (2024-25).mp4");
const EDL_PATH = path.resolve(__dirname, "steph-curry-expected-edl.json");
const OUTPUT = path.resolve(__dirname, "steph-curry-rendered.mp4");
const FILTER_PATH = path.resolve(__dirname, "steph-curry-filter.txt");

interface EDLShot {
  id: string;
  source: { clipId: string; inPoint: number; outPoint: number };
  timing: {
    startTime: number;
    duration: number;
    speed?: number;
    speedRamp?: { startSpeed: number; endSpeed: number; easing: string };
  };
  effects: Array<{
    id: string;
    type: string;
    intensity: number;
    startTime?: number;
    duration?: number;
    params?: Record<string, number>;
  }>;
  transition?: { type: string; duration: number };
  beatLock?: { beatIndex: number; lockMode: string };
}

interface EDL {
  version: string;
  metadata: { title: string; prompt: string };
  timeline: { resolution: { width: number; height: number }; fps: number; duration: number };
  music?: { sourceId: string; bpm: number; volume: number };
  shots: EDLShot[];
  globalEffects?: { colorGrade?: string; vignette?: number };
}

async function checkFFmpeg() {
  try {
    await $`ffmpeg -version`.quiet();
    console.log("✅ FFmpeg available");
    return true;
  } catch {
    console.error("❌ FFmpeg not found. Install: brew install ffmpeg");
    return false;
  }
}

function buildFilterGraph(edl: EDL): string {
  const { width, height } = edl.timeline.resolution;
  const fps = edl.timeline.fps;
  const lines: string[] = [];

  // Input: [0:v] is the source footage
  for (let i = 0; i < edl.shots.length; i++) {
    const shot = edl.shots[i];
    const inPt = shot.source.inPoint;
    const outPt = shot.source.outPoint;
    const dur = shot.timing.duration;
    const speed = shot.timing.speed ?? 1.0;

    // Build per-shot filter chain
    const filters: string[] = [];

    // 1. Trim to source segment
    filters.push(`trim=${inPt}:${outPt}`);
    filters.push("setpts=PTS-STARTPTS");

    // 2. Speed control
    if (shot.timing.speedRamp) {
      const { startSpeed, endSpeed } = shot.timing.speedRamp;
      // Speed ramp: variable speed using setpts with expression
      // Approximate as average speed for FFmpeg
      const avgSpeed = (startSpeed + endSpeed) / 2;
      const ptsFactor = 1 / avgSpeed;
      filters.push(`setpts=${ptsFactor}*PTS`);
    } else if (speed !== 1.0) {
      filters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
    }

    // 3. Scale and pad to target resolution
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`);
    filters.push("setsar=1");
    filters.push(`fps=${fps}`);

    // 4. Apply effects
    for (const fx of shot.effects) {
      const intensity = fx.intensity;
      switch (fx.type) {
        case "impact_flash":
        case "flash_white": {
          // White flash at start of shot
          const flashDur = fx.duration ?? 0.08;
          const flashFrames = Math.ceil(flashDur * fps);
          filters.push(`fade=t=in:st=0:d=${flashDur}:color=white`);
          filters.push(`fade=t=out:st=${flashDur}:d=${flashDur}`);
          break;
        }
        case "context_shake":
        case "shake": {
          // Simulated shake via crop offset — subtle
          const amp = Math.round(intensity * 8);
          filters.push(`crop=${width - amp * 2}:${height - amp * 2}:${amp}:${amp}`);
          filters.push(`scale=${width}:${height}`);
          break;
        }
        case "speed_ramp": {
          // Already handled by speed control above
          // Add slight zoom punch for visual emphasis
          const zoom = 1 + intensity * 0.04;
          filters.push(`scale=${Math.round(width * zoom)}:${Math.round(height * zoom)}`);
          filters.push(`crop=${width}:${height}`);
          break;
        }
        case "chromatic_burst": {
          // RGB channel split via rotation + blend
          const offset = Math.round(intensity * 6);
          filters.push(`rgbashift=rh=${offset}:bh=-${offset}`);
          break;
        }
        case "vignette_punch": {
          filters.push(`vignette=PI/4`);
          break;
        }
        case "color_pulse": {
          const color = fx.params?.color === 1 ? "red" : "orange";
          filters.push(`colorbalance=rs=${intensity * 0.3}:gs=${-intensity * 0.1}`);
          break;
        }
        case "push_in": {
          // Gradual zoom
          const scaleEnd = 1 + intensity * 0.08;
          const frames = Math.ceil(dur * fps);
          filters.push(`zoompan=z='min(${scaleEnd},1+on/${frames}*${scaleEnd - 1})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`);
          break;
        }
        case "bloom":
        case "bloom_highlights": {
          filters.push(`gblur=sigma=${intensity * 15}`);
          filters.push(`blend=all_mode=screen:all_opacity=${intensity * 0.3}`);
          break;
        }
        case "glow": {
          filters.push(`gblur=sigma=${intensity * 10}`);
          filters.push(`blend=all_mode=screen:all_opacity=${intensity * 0.2}`);
          break;
        }
      }
    }

    // 5. Global color grade
    if (edl.globalEffects?.colorGrade === "cool_dark" || edl.globalEffects?.colorGrade === "raw") {
      // Cool dark: desaturate slightly, push blue
      filters.push(`colorbalance=rs=-0.05:gs=-0.02:bs=0.08:rm=-0.03:gm=-0.01:bm=0.05`);
      filters.push(`eq=contrast=1.1:brightness=-0.03:saturation=0.85`);
    }

    // 6. Vignette
    if (edl.globalEffects?.vignette) {
      const vStrength = edl.globalEffects.vignette;
      filters.push(`vignette=PI/${Math.round(4 / vStrength)}`);
    }

    // 7. Force output format for concat compatibility
    filters.push(`format=yuv420p`);

    const filterStr = filters.join(",");
    lines.push(`[0:v]${filterStr}[v${i}]`);
  }

  // Concat all shots
  const concatInputs = edl.shots.map((_, i) => `[v${i}]`).join("");
  lines.push(`${concatInputs}concat=n=${edl.shots.length}:v=1:a=0[outv]`);

  return lines.join(";\n");
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Steph Curry Full Pipeline Render                   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log();

  // Check FFmpeg
  if (!await checkFFmpeg()) process.exit(1);

  // Check source footage
  try {
    const stat = await fs.stat(SOURCE);
    console.log(`✅ Source footage: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
  } catch {
    console.error(`❌ Source footage not found: ${SOURCE}`);
    process.exit(1);
  }

  // Load EDL
  const edl: EDL = JSON.parse(await Bun.file(EDL_PATH).text());
  console.log(`✅ EDL loaded: ${edl.shots.length} shots, ${edl.timeline.duration}s`);
  console.log(`   Resolution: ${edl.timeline.resolution.width}x${edl.timeline.resolution.height}`);
  console.log(`   FPS: ${edl.timeline.fps}`);
  console.log();

  // Get source video info
  console.log("Probing source footage...");
  const probe = await $`ffprobe -v quiet -print_format json -show_format -show_streams "${SOURCE}"`.json();
  const videoStream = probe.streams.find((s: any) => s.codec_type === "video");
  const sourceDuration = parseFloat(probe.format.duration);
  const sourceFps = eval(videoStream.r_frame_rate);
  console.log(`   Source: ${videoStream.width}x${videoStream.height}, ${sourceFps.toFixed(0)}fps, ${sourceDuration.toFixed(1)}s`);
  console.log();

  // Check if EDL references fit within source duration
  const maxOutPoint = Math.max(...edl.shots.map(s => s.source.outPoint));
  if (maxOutPoint > sourceDuration) {
    console.error(`❌ EDL references source time ${maxOutPoint.toFixed(1)}s but footage is only ${sourceDuration.toFixed(1)}s`);
    process.exit(1);
  }
  console.log(`✅ All shots fit within source footage (max: ${maxOutPoint.toFixed(1)}s / ${sourceDuration.toFixed(1)}s)`);

  // Build filter graph
  console.log("Building FFmpeg filter graph...");
  const filterGraph = buildFilterGraph(edl);
  await fs.writeFile(FILTER_PATH, filterGraph, "utf-8");
  console.log(`   Filter graph: ${filterGraph.length} chars`);
  console.log();

  // Run FFmpeg
  console.log("Rendering with FFmpeg...");
  const startTime = Date.now();

  try {
    const result = await $`ffmpeg -y -i "${SOURCE}" -filter_complex_script "${FILTER_PATH}" -map "[outv]" -c:v libx264 -preset fast -pix_fmt yuv420p -b:v 4M -r ${edl.timeline.fps} -movflags +faststart "${OUTPUT}"`.quiet();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outputStat = await fs.stat(OUTPUT);

    console.log(`✅ Render complete in ${elapsed}s`);
    console.log(`   Output: ${OUTPUT}`);
    console.log(`   Size: ${(outputStat.size / 1024 / 1024).toFixed(1)}MB`);
    console.log();

    // Verify output
    const outputProbe = await $`ffprobe -v quiet -print_format json -show_format "${OUTPUT}"`.json();
    const outputDuration = parseFloat(outputProbe.format.duration);
    const durationDiff = Math.abs(outputDuration - edl.timeline.duration);

    console.log("Output Verification:");
    console.log(`   Duration: ${outputDuration.toFixed(2)}s (target: ${edl.timeline.duration}s, diff: ${durationDiff.toFixed(2)}s)`);
    console.log(`   Duration match: ${durationDiff < 2 ? "✅ PASS" : "❌ FAIL"}`);

    // Open the video
    console.log();
    console.log("Opening video...");
    await $`open "${OUTPUT}"`;

  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Render failed after ${elapsed}s`);
    console.error(err.stderr?.toString()?.slice(-2000) || err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
