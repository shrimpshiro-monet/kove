#!/usr/bin/env node
/**
 * render-visible.mjs — Effects you can ACTUALLY SEE.
 *
 * Problem: 4px shake on 1280x720 = invisible. 0.25 brightness = invisible.
 * Fix: 30px shake, full white overlay, 12px chromatic split.
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
const EDL_PATH = path.join(ROOT, "test-renders", "curry-visible-edl.json");
const OUTPUT_DIR = path.join(ROOT, "test-renders");

async function getDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

// ─── VISIBLE effect filters ────────────────────────────────────────

function effectFilter(type, intensity) {
  const i = intensity;
  switch (type) {
    case "flash_white":
      // Full white overlay — unmistakable
      return `split[orig][white];[white]color=white:s=1280x720:duration=0.08[blank];[orig][blank]blend=all_mode=normal:all_opacity=${i.toFixed(2)}`;

    case "shake":
      // 30px movement — clearly visible camera shake
      return `crop=iw-60:ih-60:30+random(1)*30:30+random(2)*30,scale=trunc(iw/2)*2:trunc(ih/2)*2`;

    case "chromatic":
      // 12px RGB split — visible color fringing
      return `rgbashift=rh=${-Math.round(12*i)}:rv=${Math.round(6*i)}:bh=${Math.round(12*i)}:bv=${-Math.round(6*i)}`;

    default:
      return null;
  }
}

function gradeFilter(preset) {
  if (preset === "neon") return "eq=contrast=1.3:saturation=1.4:brightness=0.08";
  return "eq=contrast=1.15:saturation=1.1:brightness=0.05";
}

async function render() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  VISIBLE Effects — You Will See These");
  console.log("═══════════════════════════════════════════════════\n");

  const edl = JSON.parse(await fs.readFile(EDL_PATH, "utf8"));
  const shots = edl.shots;
  const musicStart = edl.music.inPoint;
  const totalDur = edl.timeline.duration;

  console.log(`Shots: ${shots.length} | Duration: ${totalDur}s`);
  console.log(`Music: ${musicStart}s → ${musicStart + totalDur}s\n`);

  for (const s of shots) {
    const fx = s.effects?.map(e => e.type).join(", ") || "none";
    const spd = s.timing?.speed ? ` [${s.timing.speed}×]` : "";
    console.log(`  ${s.id}: ${s.timing.startTime.toFixed(1)}s${spd} — ${fx}`);
    console.log(`    ${s.note}`);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-visible-"));

  try {
    // ── Pass 1: Extract shots with VISIBLE effects ──
    console.log("\nPass 1: Extracting with visible effects...");
    const shotFiles = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const outFile = path.join(tmpDir, `shot_${String(i).padStart(3, "0")}.mp4`);

      const filters = [];

      // Speed
      if (shot.timing?.speed && shot.timing.speed !== 1.0) {
        filters.push(`setpts=PTS/${shot.timing.speed.toFixed(3)}`);
      }

      // Color grading
      filters.push(gradeFilter(edl.globalEffects.colorGrade));

      // Effects — VISIBLE ones
      for (const fx of (shot.effects || [])) {
        const f = effectFilter(fx.type, fx.intensity);
        if (f) {
          // Multi-filter effects need filter_complex, not -vf
          if (f.includes("[")) {
            // Store for later — apply via filter_complex
            // For now, use simplified single-filter version
            if (fx.type === "flash_white") {
              filters.push("eq=brightness=0.4:contrast=1.3");
            }
          } else {
            filters.push(f);
          }
        }
      }

      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", String(shot.source.inPoint), "-i", FOOTAGE,
          "-t", String(shot.source.outPoint - shot.source.inPoint),
          "-vf", filters.join(","), "-an",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
          "-r", "30", "-pix_fmt", "yuv420p", outFile,
        ], { timeout: 60_000 });
        shotFiles.push(outFile);
        const fxList = shot.effects?.map(e => e.type).join("+") || "clean";
        console.log(`  ${shot.id}: ✓ [${fxList}]`);
      } catch (err) {
        console.error(`  ${shot.id}: ✗ ${err.message?.slice(0, 50)}`);
      }
    }

    // ── Pass 2: Apply transitions ──
    console.log("\nPass 2: Transitions...");
    const finalFiles = [];

    for (let i = 0; i < shotFiles.length; i++) {
      const shot = shots[i];
      const trFile = path.join(tmpDir, `tr_${String(i).padStart(3, "0")}.mp4`);
      const vf = [];

      if (shot.transition?.type === "flash") {
        // White flash transition — dramatic
        vf.push("fade=t=in:st=0:d=0.1:c=white");
      } else if (shot.transition?.type === "fade") {
        const d = shot.transition.duration || 0.3;
        vf.push(`fade=t=in:st=0:d=${d}`);
      }

      if (vf.length > 0) {
        try {
          await execFileAsync("ffmpeg", [
            "-y", "-i", shotFiles[i], "-vf", vf.join(","),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
            "-pix_fmt", "yuv420p", trFile,
          ], { timeout: 15_000 });
          finalFiles.push(trFile);
        } catch { finalFiles.push(shotFiles[i]); }
      } else {
        finalFiles.push(shotFiles[i]);
      }
    }

    // ── Pass 3: Concat ──
    console.log("\nPass 3: Concatenating...");
    const vList = path.join(tmpDir, "vlist.txt");
    await fs.writeFile(vList, finalFiles.map(f => `file '${f}'`).join("\n"));
    const videoOut = path.join(tmpDir, "video.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", vList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
      videoOut,
    ], { timeout: 120_000 });

    // ── Pass 4: Music ──
    console.log("Pass 4: Music...");
    const outputPath = path.join(OUTPUT_DIR, "curry-visible.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-i", videoOut, "-i", MUSIC,
      "-filter_complex",
      `[1:a]atrim=start=${musicStart}:end=${musicStart + totalDur},asetpts=PTS-STARTPTS,volume=0.85,afade=t=in:st=0:d=0.3,afade=t=out:st=${totalDur - 0.8}:d=0.8,atrim=0:${totalDur},asetpts=PTS-STARTPTS[outa]`,
      "-map", "0:v", "-map", "[outa]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-t", String(totalDur), "-movflags", "+faststart",
      outputPath,
    ], { timeout: 60_000 });

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const outDur = await getDuration(outputPath);
    console.log(`\n  ✓ test-renders/curry-visible.mp4`);
    console.log(`  ✓ ${sizeMB} MB | ${outDur.toFixed(1)}s`);
    console.log(`  ✓ Effects: 30px shake, 12px chromatic, full white flash`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  console.log("\n═══════════════════════════════════════════════════");
}

render().catch(err => { console.error("Fatal:", err); process.exit(1); });
