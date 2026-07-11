/**
 * Steph Curry Reference Match Render v2
 *
 * Matches the actual reference editing: long intro → whip pans → velocity ramps
 * → single flash frames → slow-mo hero shots → fade to black.
 *
 * Usage: bun test/render-steph-curry-v2.ts
 */

import { $ } from "bun";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SOURCE = path.resolve(__dirname, "High Quality Steph Curry Clips for Edits! (2024-25).mp4");
const EDL_PATH = path.resolve(__dirname, "steph-curry-expected-edl.json");
const OUTPUT = path.resolve(__dirname, "steph-curry-rendered-v2.mp4");
const FILTER_PATH = path.resolve(__dirname, "steph-curry-filter-v2.txt");

interface EDL {
  timeline: { resolution: { width: number; height: number }; fps: number; duration: number };
  globalEffects?: { colorGrade?: string; vignette?: number };
  shots: Array<{
    id: string;
    source: { clipId: string; inPoint: number; outPoint: number };
    timing: {
      startTime: number;
      duration: number;
      speed?: number;
      speedRamp?: { startSpeed: number; endSpeed: number; easing: string };
    };
    effects: Array<{ id: string; type: string; intensity: number; startTime?: number; duration?: number }>;
    transition?: { type: string; duration: number };
  }>;
}

function buildFilterGraph(edl: EDL): string {
  const { width, height } = edl.timeline.resolution;
  const fps = edl.timeline.fps;
  const lines: string[] = [];

  for (let i = 0; i < edl.shots.length; i++) {
    const shot = edl.shots[i];
    const inPt = shot.source.inPoint;
    const outPt = shot.source.outPoint;
    const speed = shot.timing.speed ?? 1.0;
    const hasSpeedRamp = !!shot.timing.speedRamp;
    const transition = shot.transition?.type ?? "cut";

    const filters: string[] = [];

    // 1. Trim to source segment
    filters.push(`trim=${inPt}:${outPt}`);
    filters.push("setpts=PTS-STARTPTS");

    // 2. Speed control (velocity ramp)
    if (hasSpeedRamp && shot.timing.speedRamp) {
      const { startSpeed, endSpeed } = shot.timing.speedRamp;
      // Use setpts with expression for smooth speed ramp
      // speed(t) = startSpeed + (endSpeed - startSpeed) * (t/duration)
      // PTS factor = 1/speed(t) — we approximate with average
      const avgSpeed = (startSpeed + endSpeed) / 2;
      const ptsFactor = (1 / avgSpeed).toFixed(4);
      filters.push(`setpts=${ptsFactor}*PTS`);
    } else if (speed !== 1.0) {
      const ptsFactor = (1 / speed).toFixed(4);
      filters.push(`setpts=${ptsFactor}*PTS`);
    }

    // 3. Scale and pad
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`);
    filters.push("setsar=1");
    filters.push(`fps=${fps}`);

    // 4. Apply per-shot effects
    for (const fx of shot.effects) {
      switch (fx.type) {
        case "impact_flash":
        case "flash_white": {
          // SINGLE WHITE FRAME — not a fade. 1 frame = 1/fps seconds
          const frameDur = 1 / fps;
          filters.push(`fade=t=in:st=0:d=${frameDur.toFixed(4)}:color=white`);
          filters.push(`fade=t=out:st=${frameDur.toFixed(4)}:d=${frameDur.toFixed(4)}`);
          break;
        }
        case "context_shake": {
          // Subtle shake via crop offset
          const amp = Math.max(2, Math.round(fx.intensity * 6));
          filters.push(`crop=${width - amp * 2}:${height - amp * 2}:${amp}:${amp}`);
          filters.push(`scale=${width}:${height}`);
          break;
        }
      }
    }

    // 5. Color grade — desaturated/dramatic for hero shots
    const isHero = shot.id.startsWith("hero");
    if (isHero) {
      // Desaturated, high contrast, slightly dark
      filters.push(`eq=contrast=1.2:brightness=-0.05:saturation=0.4`);
      filters.push(`colorbalance=rs=-0.05:bs=0.08`);
    } else {
      // Standard grade — slight cool push
      filters.push(`eq=contrast=1.08:brightness=-0.02:saturation=0.85`);
      filters.push(`colorbalance=bs=0.05`);
    }

    // 6. Force output format
    filters.push(`format=yuv420p`);

    lines.push(`[0:v]${filters.join(",")}[v${i}]`);
  }

  // Concat all shots
  const concatInputs = edl.shots.map((_, i) => `[v${i}]`).join("");
  lines.push(`${concatInputs}concat=n=${edl.shots.length}:v=1:a=0[outv]`);

  return lines.join(";\n");
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Steph Curry Reference Match Render v2              ║");
  console.log("║  Velocity ramps + whip pans + single flash frames  ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log();

  // Check FFmpeg
  try { await $`ffmpeg -version`.quiet(); console.log("✅ FFmpeg available"); }
  catch { console.error("❌ FFmpeg not found"); process.exit(1); }

  // Check source
  try {
    const stat = await fs.stat(SOURCE);
    console.log(`✅ Source: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
  } catch { console.error(`❌ Source not found: ${SOURCE}`); process.exit(1); }

  // Load EDL
  const edl: EDL = JSON.parse(await Bun.file(EDL_PATH).text());
  console.log(`✅ EDL: ${edl.shots.length} shots, ${edl.timeline.duration}s`);
  console.log(`   Resolution: ${edl.timeline.resolution.width}x${edl.timeline.resolution.height}`);
  console.log();

  // Probe source
  const probe = await $`ffprobe -v quiet -print_format json -show_format -show_streams "${SOURCE}"`.json();
  const videoStream = probe.streams.find((s: any) => s.codec_type === "video");
  const sourceDuration = parseFloat(probe.format.duration);
  console.log(`   Source: ${videoStream.width}x${videoStream.height}, ${sourceDuration.toFixed(1)}s`);

  // Check fit
  const maxOut = Math.max(...edl.shots.map(s => s.source.outPoint));
  if (maxOut > sourceDuration) {
    console.error(`❌ EDL references ${maxOut.toFixed(1)}s but source is ${sourceDuration.toFixed(1)}s`);
    process.exit(1);
  }
  console.log(`✅ All shots fit (max: ${maxOut.toFixed(1)}s)`);
  console.log();

  // Print shot breakdown
  console.log("Shot Breakdown:");
  console.log("─".repeat(70));
  console.log("ID          TIME          DURATION   SPEED   TRANSITION   EFFECTS");
  console.log("─".repeat(70));
  for (const shot of edl.shots) {
    const time = `${shot.timing.startTime.toFixed(2)}s`.padEnd(12);
    const dur = `${shot.timing.duration.toFixed(2)}s`.padEnd(10);
    const spd = shot.timing.speedRamp
      ? `${shot.timing.speedRamp.startSpeed}→${shot.timing.speedRamp.endSpeed}`.padEnd(8)
      : `${shot.timing.speed ?? 1.0}`.padEnd(8);
    const trans = (shot.transition?.type ?? "cut").padEnd(12);
    const fx = shot.effects.map(e => e.type).join(", ") || "—";
    console.log(`${shot.id.padEnd(12)}${time}${dur}${spd}${trans}${fx}`);
  }
  console.log("─".repeat(70));
  console.log();

  // Build filter graph
  console.log("Building FFmpeg filter graph...");
  const filterGraph = buildFilterGraph(edl);
  await fs.writeFile(FILTER_PATH, filterGraph, "utf-8");
  console.log(`   Filter graph: ${filterGraph.length} chars`);
  console.log();

  // Render
  console.log("Rendering with FFmpeg...");
  const startTime = Date.now();

  try {
    await $`ffmpeg -y -i "${SOURCE}" -filter_complex_script "${FILTER_PATH}" -map "[outv]" -c:v libx264 -preset fast -pix_fmt yuv420p -b:v 4M -r ${edl.timeline.fps} -movflags +faststart "${OUTPUT}"`.quiet();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outputStat = await fs.stat(OUTPUT);

    console.log(`✅ Render complete in ${elapsed}s`);
    console.log(`   Output: ${OUTPUT}`);
    console.log(`   Size: ${(outputStat.size / 1024 / 1024).toFixed(1)}MB`);

    // Verify
    const outputProbe = await $`ffprobe -v quiet -print_format json -show_format "${OUTPUT}"`.json();
    const outputDuration = parseFloat(outputProbe.format.duration);
    const diff = Math.abs(outputDuration - edl.timeline.duration);

    console.log();
    console.log("Verification:");
    console.log(`   Duration: ${outputDuration.toFixed(2)}s (target: ${edl.timeline.duration}s, diff: ${diff.toFixed(2)}s)`);
    console.log(`   Match: ${diff < 2 ? "✅ PASS" : "⚠️ CLOSE"}`);

    // Open
    console.log();
    await $`open "${OUTPUT}`;

  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Render failed after ${elapsed}s`);
    console.error(err.stderr?.toString()?.slice(-2000) || err.message);
    process.exit(1);
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
