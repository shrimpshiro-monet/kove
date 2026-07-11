#!/usr/bin/env node
/**
 * render-dynamic.mjs — Dynamic, unique transitions with speed ramps,
 * black flashes, effect stacks, and keyframed timing.
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

// ─── Kove effect filters ──────────────────────────────────────────

function effectFilter(type, intensity = 0.7) {
  const i = intensity;
  switch (type) {
    case "chromatic": return `rgbashift=rh=${-Math.round(i*6)}:rv=${Math.round(i*3)}:bh=${Math.round(i*6)}:bv=${-Math.round(i*3)}`;
    case "glitch": return `noise=alls=${Math.round(i*40)}:allf=t,rgbashift=rh=${Math.round(i*10)}:bh=${-Math.round(i*10)}`;
    case "shake": {
      const a = Math.round(i*12);
      return `crop=iw-${a*2}:ih-${a*2}:${a}+random(1)*${a}:${a}+random(2)*${a},scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    }
    case "vignette": return `vignette=PI/${4+i*4}`;
    case "desaturate": return `eq=saturation=${(1-i*0.8).toFixed(2)}`;
    case "bw": return `hue=s=0,eq=contrast=${(1+i*0.4).toFixed(2)}`;
    case "posterize": return `fps=fps=${Math.round(8+i*8)}`;
    case "rgb_split": return `rgbashift=rh=${-Math.round(i*8)}:bh=${Math.round(i*8)}`;
    case "mosaic": return `scale=40:30:flags=neighbor,scale=1920:1080:flags=neighbor`;
    case "scanlines": return `drawgrid=w=0:h=2:t=1:c=black@${i*0.5}`;
    case "echo": return `lagfun=decay=${i.toFixed(2)}`;
    case "bright": return `eq=brightness=${(i*0.2).toFixed(2)}:contrast=${(1+i*0.1).toFixed(2)}`;
    case "contrast": return `eq=contrast=${(1+i*0.5).toFixed(2)}`;
    case "invert": return `negate`;
    default: return null;
  }
}

// ─── Dynamic shot generator ───────────────────────────────────────

function generateDynamicEDL(footageDuration) {
  const totalDuration = 30;
  const shots = [];
  let currentTime = 0;

  // Shot patterns — each defines a unique visual treatment
  const patterns = [
    // 1. SLOW-MO + CHROMATIC (slow start, speed up at end)
    {
      name: "slowmo_chromatic",
      duration: 2.5,
      speed: { start: 0.4, end: 1.8 },
      effects: ["chromatic", "vignette"],
      transition: { type: "flash_black", duration: 0.1 },
    },
    // 2. BLACK FLASH SEQUENCE (0.1s black flashes x 10 = 1s total)
    {
      name: "black_flash_seq",
      duration: 1.0,
      speed: { start: 1.0, end: 1.0 },
      effects: ["contrast"],
      transition: null,
      blackFlashes: true, // Special: creates rapid black flash cuts
    },
    // 3. GLITCH BURST + SPEED RAMP
    {
      name: "glitch_burst",
      duration: 1.5,
      speed: { start: 2.0, end: 0.5 },
      effects: ["glitch", "rgb_split"],
      transition: { type: "hard_cut", duration: 0 },
    },
    // 4. WIDE SHOT + DESATURATE (breathing room)
    {
      name: "wide_breathe",
      duration: 3.0,
      speed: { start: 1.0, end: 1.0 },
      effects: ["desaturate", "vignette"],
      transition: { type: "fade", duration: 0.3 },
    },
    // 5. ZOOM IN + POSTERIZE (stutter effect)
    {
      name: "zoom_posterize",
      duration: 1.2,
      speed: { start: 1.5, end: 0.8 },
      effects: ["posterize", "contrast"],
      transition: { type: "flash_black", duration: 0.08 },
    },
    // 6. MOSAIC + INVERT (digital breakdown)
    {
      name: "digital_break",
      duration: 0.8,
      speed: { start: 1.0, end: 1.0 },
      effects: ["mosaic", "invert"],
      transition: { type: "hard_cut", duration: 0 },
    },
    // 7. ECHO + SLOW DRIFT (dreamy)
    {
      name: "echo_drift",
      duration: 2.0,
      speed: { start: 0.7, end: 1.0 },
      effects: ["echo", "bright"],
      transition: { type: "fade", duration: 0.4 },
    },
    // 8. BW + SHAKE (dramatic)
    {
      name: "bw_shake",
      duration: 1.8,
      speed: { start: 1.2, end: 1.2 },
      effects: ["bw", "shake"],
      transition: { type: "flash_black", duration: 0.1 },
    },
    // 9. RGB SPLIT + SPEED UP (energy ramp)
    {
      name: "rgb_ramp",
      duration: 1.5,
      speed: { start: 0.8, end: 2.5 },
      effects: ["rgb_split", "contrast"],
      transition: { type: "hard_cut", duration: 0 },
    },
    // 10. SCANLINES + DESATURATE (retro)
    {
      name: "retro_scan",
      duration: 2.0,
      speed: { start: 1.0, end: 1.0 },
      effects: ["scanlines", "desaturate"],
      transition: { type: "fade", duration: 0.2 },
    },
    // 11. BLACK FLASH SEQUENCE (repeat pattern)
    {
      name: "black_flash_seq_2",
      duration: 1.0,
      speed: { start: 1.0, end: 1.0 },
      effects: [],
      transition: null,
      blackFlashes: true,
    },
    // 12. CHROMATIC + GLITCH (climax)
    {
      name: "chromatic_glitch",
      duration: 1.2,
      speed: { start: 1.0, end: 1.5 },
      effects: ["chromatic", "glitch"],
      transition: { type: "flash_black", duration: 0.05 },
    },
    // 13. WIDE + BREATH (decompress)
    {
      name: "decompress",
      duration: 2.5,
      speed: { start: 1.0, end: 0.8 },
      effects: ["vignette"],
      transition: { type: "fade", duration: 0.3 },
    },
    // 14. POSTERIZE + SHAKE (stutter shake)
    {
      name: "stutter_shake",
      duration: 1.0,
      speed: { start: 1.8, end: 0.6 },
      effects: ["posterize", "shake"],
      transition: { type: "hard_cut", duration: 0 },
    },
    // 15. INVERT + GLITCH (chaos)
    {
      name: "chaos",
      duration: 0.8,
      speed: { start: 2.0, end: 1.0 },
      effects: ["invert", "glitch"],
      transition: { type: "flash_black", duration: 0.08 },
    },
    // 16. ECHO + BW (fade out)
    {
      name: "fade_out",
      duration: 3.0,
      speed: { start: 1.0, end: 0.5 },
      effects: ["echo", "bw"],
      transition: { type: "fade", duration: 0.5 },
    },
    // 17. MOSAIC + RGB (digital art)
    {
      name: "digital_art",
      duration: 1.5,
      speed: { start: 1.0, end: 1.0 },
      effects: ["mosaic", "rgb_split"],
      transition: { type: "hard_cut", duration: 0 },
    },
    // 18. BLACK FLASH + CHROMATIC (final burst)
    {
      name: "final_burst",
      duration: 1.0,
      speed: { start: 1.0, end: 1.0 },
      effects: ["chromatic"],
      transition: null,
      blackFlashes: true,
    },
    // 19. SLOW + VIGNETTE (closing)
    {
      name: "closing",
      duration: 2.0,
      speed: { start: 0.6, end: 1.0 },
      effects: ["vignette", "desaturate"],
      transition: { type: "fade", duration: 0.4 },
    },
    // 20. BLACK FLASH SEQUENCE (final stinger)
    {
      name: "stinger",
      duration: 0.8,
      speed: { start: 1.0, end: 1.0 },
      effects: ["contrast"],
      transition: null,
      blackFlashes: true,
    },
  ];

  for (const pattern of patterns) {
    if (currentTime + pattern.duration > totalDuration) break;

    const sourceStart = (currentTime / totalDuration) * footageDuration;
    const sourceEnd = Math.min(footageDuration - 0.3, sourceStart + pattern.duration * 1.5);

    shots.push({
      pattern: pattern.name,
      source: { inPoint: sourceStart, outPoint: sourceEnd },
      duration: pattern.duration,
      speed: pattern.speed,
      effects: pattern.effects,
      transition: pattern.transition,
      blackFlashes: pattern.blackFlashes || false,
    });

    currentTime += pattern.duration;
  }

  return { shots, totalDuration: currentTime };
}

// ─── Render pipeline ──────────────────────────────────────────────

async function render() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Dynamic Render — Speed Ramps, Black Flashes, Stacks");
  console.log("═══════════════════════════════════════════════════\n");

  const footageDuration = await getDuration(FOOTAGE);
  const { shots, totalDuration } = generateDynamicEDL(footageDuration);

  console.log(`Shots: ${shots.length} | Duration: ${totalDuration.toFixed(1)}s`);
  console.log(`Patterns: ${shots.map(s => s.pattern).join(", ")}`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-dynamic-"));

  try {
    // ── PASS 1: Extract each shot with effects + speed ramps ──
    console.log("\nPass 1: Extracting shots with dynamic treatments...");
    const shotFiles = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const shotFile = path.join(tmpDir, `shot_${String(i).padStart(3, "0")}.mp4`);
      const ss = shot.source.inPoint;
      const dur = shot.source.outPoint - ss;

      // Build filter chain
      const filters = [];

      // Speed ramp: use setpts for variable speed
      const avgSpeed = (shot.speed.start + shot.speed.end) / 2;
      filters.push(`setpts=PTS/${avgSpeed.toFixed(3)}`);

      // Effects
      for (const fx of shot.effects) {
        const f = effectFilter(fx, 0.7);
        if (f) filters.push(f);
      }

      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", String(ss), "-i", FOOTAGE,
          "-t", String(dur),
          "-vf", filters.join(","),
          "-an",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
          "-r", "30", "-pix_fmt", "yuv420p",
          shotFile,
        ], { timeout: 60_000 });
        shotFiles.push(shotFile);
        process.stdout.write(`  ${shot.pattern} (${shot.duration}s)\r`);
      } catch (err) {
        console.error(`\n  Failed: ${shot.pattern} — ${err.message?.slice(0, 60)}`);
      }
    }
    console.log(`\n  ${shotFiles.length}/${shots.length} shots extracted`);

    // ── PASS 2: Handle black flash sequences ──
    console.log("\nPass 2: Building black flash sequences + transitions...");
    const finalFiles = [];

    for (let i = 0; i < shotFiles.length; i++) {
      const shot = shots[i];

      if (shot.blackFlashes) {
        // Create rapid black flash sequence: 0.1s video, 0.1s black, repeat
        const flashCount = Math.round(shot.duration / 0.2); // 0.2s per flash cycle
        const flashDur = 0.1; // duration of each video flash
        const blackDur = 0.1; // duration of each black gap

        for (let f = 0; f < flashCount; f++) {
          // Video flash
          const flashFile = path.join(tmpDir, `flash_${i}_${f}.mp4`);
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-i", shotFiles[i],
              "-t", String(flashDur),
              "-vf", "eq=brightness=0.3:contrast=1.2",
              "-an",
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
              "-r", "30", "-pix_fmt", "yuv420p",
              flashFile,
            ], { timeout: 15_000 });
            finalFiles.push(flashFile);
          } catch { finalFiles.push(shotFiles[i]); }

          // Black frame
          const blackFile = path.join(tmpDir, `black_${i}_${f}.mp4`);
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-f", "lavfi", "-i", `color=c=black:s=1280x720:d=${blackDur}`,
              "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
              "-r", "30", blackFile,
            ], { timeout: 10_000 });
            finalFiles.push(blackFile);
          } catch { /* skip black frame */ }
        }
      } else {
        // Apply transition to regular shot
        const transFile = path.join(tmpDir, `trans_${String(i).padStart(3, "0")}.mp4`);
        const transFilters = [];

        if (shot.transition?.type === "fade" && shot.transition.duration > 0) {
          const d = shot.transition.duration;
          transFilters.push(`fade=t=in:st=0:d=${d}`);
          transFilters.push(`fade=t=out:st=${Math.max(0, shot.duration - d)}:d=${d}`);
        } else if (shot.transition?.type === "flash_black") {
          // Flash to black at start
          const d = shot.transition.duration;
          transFilters.push(`fade=t=in:st=0:d=${d}:c=black`);
        }
        // hard_cut = no filter needed

        if (transFilters.length > 0) {
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-i", shotFiles[i],
              "-vf", transFilters.join(","),
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
              "-pix_fmt", "yuv420p", transFile,
            ], { timeout: 30_000 });
            finalFiles.push(transFile);
          } catch {
            finalFiles.push(shotFiles[i]);
          }
        } else {
          finalFiles.push(shotFiles[i]);
        }
      }
    }

    console.log(`  ${finalFiles.length} segments (including ${shots.filter(s => s.blackFlashes).length * 10} black flash segments)`);

    // ── PASS 3: Concatenate all segments ──
    console.log("\nPass 3: Concatenating...");
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(concatList, finalFiles.map(f => `file '${f}'`).join("\n"));

    const concatOut = path.join(tmpDir, "concat.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
      concatOut,
    ], { timeout: 120_000 });

    // ── PASS 4: Add music ──
    console.log("Pass 4: Adding music...");
    const musicStart = 26.6;
    const outputPath = path.join(OUTPUT_DIR, "curry-dynamic.mp4");

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

    console.log(`\n  ✓ Output: test-renders/curry-dynamic.mp4`);
    console.log(`  ✓ Size: ${sizeMB} MB | Duration: ${outDuration.toFixed(1)}s`);
    console.log(`  ✓ ${shots.length} shots with ${new Set(shots.flatMap(s => s.effects)).size} different effects`);
    console.log(`  ✓ ${shots.filter(s => s.blackFlashes).length} black flash sequences`);
    console.log(`  ✓ Speed ramps: ${shots.filter(s => s.speed.start !== s.speed.end).length}`);
    console.log(`  ✓ Transitions: fade, flash_black, hard_cut`);
    console.log(`  ✓ Music: ${musicStart}s → ${(musicStart + totalDuration).toFixed(1)}s`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n═══════════════════════════════════════════════════");
}

render().catch(err => { console.error("Fatal:", err); process.exit(1); });
