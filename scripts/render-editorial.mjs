#!/usr/bin/env node
/**
 * render-editorial.mjs — Render the editorial EDL with WHY reasoning.
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
const EDL_PATH = path.join(ROOT, "test-renders", "curry-editorial-edl.json");
const OUTPUT_DIR = path.join(ROOT, "test-renders");

async function getDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

function effectFilter(type, intensity) {
  switch (type) {
    case "flash_white": return "eq=brightness=0.25:contrast=1.12";
    case "shake": return "crop=iw-8:ih-8:4+random(1)*4:4+random(2)*4,scale=trunc(iw/2)*2:trunc(ih/2)*2";
    case "chromatic": return `rgbashift=rh=${-Math.round(intensity*4)}:bh=${Math.round(intensity*4)}`;
    default: return null;
  }
}

function gradeFilter(preset) {
  if (preset === "neon") return "eq=contrast=1.25:saturation=1.3:brightness=0.05";
  if (preset === "desaturated") return "eq=contrast=1.05:saturation=0.8:brightness=0.02";
  return "eq=contrast=1.15:saturation=1.1:brightness=0.05";
}

async function render() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Editorial Cut — WHY Behind Every Shot");
  console.log("═══════════════════════════════════════════════════\n");

  const edl = JSON.parse(await fs.readFile(EDL_PATH, "utf8"));
  const shots = edl.shots;
  const musicStart = edl.music.inPoint;
  const totalDur = edl.timeline.duration;

  console.log(`Shots: ${shots.length} | Duration: ${totalDur}s`);
  console.log(`Music: ${musicStart}s → ${musicStart + totalDur}s`);
  console.log(`Philosophy: ${edl.metadata.editorialPhilosophy}\n`);

  // Print editorial breakdown
  for (const s of shots) {
    const fx = s.effects?.map(e => e.type).join(", ") || "none";
    const spd = s.timing?.speed ? ` [${s.timing.speed}×]` : "";
    console.log(`  ${s.id}: ${s.timing.startTime.toFixed(1)}-${(s.timing.startTime + s.timing.duration).toFixed(1)}s${spd}`);
    console.log(`    Effects: ${fx} | Transition: ${s.transition?.type || "cut"}`);
    console.log(`    WHY: ${s.editorialNote}`);
    console.log("");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-editorial-"));

  try {
    // ── Pass 1: Extract shots ──
    console.log("Pass 1: Extracting...");
    const shotFiles = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const outFile = path.join(tmpDir, `shot_${String(i).padStart(3, "0")}.mp4`);

      const filters = [];
      if (shot.timing?.speed && shot.timing.speed !== 1.0) {
        filters.push(`setpts=PTS/${shot.timing.speed.toFixed(3)}`);
      }
      filters.push(gradeFilter(edl.globalEffects.colorGrade));
      for (const fx of (shot.effects || [])) {
        const f = effectFilter(fx.type, fx.intensity);
        if (f) filters.push(f);
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
        console.log(`  ${shot.id}: ✓`);
      } catch { console.error(`  ${shot.id}: ✗`); }
    }

    // ── Pass 2: Transitions ──
    console.log("\nPass 2: Transitions...");
    const finalFiles = [];
    for (let i = 0; i < shotFiles.length; i++) {
      const shot = shots[i];
      const trFile = path.join(tmpDir, `tr_${String(i).padStart(3, "0")}.mp4`);
      const vf = [];
      if (shot.transition?.type === "flash") vf.push("fade=t=in:st=0:d=0.08:c=white");
      else if (shot.transition?.type === "fade") {
        vf.push(`fade=t=in:st=0:d=${shot.transition.duration || 0.3}`);
        vf.push(`fade=t=out:st=${Math.max(0, shot.timing.duration - (shot.transition.duration || 0.3))}:d=${shot.transition.duration || 0.3}`);
      }
      if (vf.length > 0) {
        try {
          await execFileAsync("ffmpeg", ["-y", "-i", shotFiles[i], "-vf", vf.join(","), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-pix_fmt", "yuv420p", trFile], { timeout: 15_000 });
          finalFiles.push(trFile);
        } catch { finalFiles.push(shotFiles[i]); }
      } else { finalFiles.push(shotFiles[i]); }
    }

    // ── Pass 3: Concat ──
    console.log("\nPass 3: Concatenating...");
    const vList = path.join(tmpDir, "vlist.txt");
    await fs.writeFile(vList, finalFiles.map(f => `file '${f}'`).join("\n"));
    const videoOut = path.join(tmpDir, "video.mp4");
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", vList, "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", videoOut], { timeout: 120_000 });

    // ── Pass 4: Music ──
    console.log("Pass 4: Music...");
    const outputPath = path.join(OUTPUT_DIR, "curry-editorial.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-i", videoOut, "-i", MUSIC,
      "-filter_complex", `[1:a]atrim=start=${musicStart}:end=${musicStart + totalDur},asetpts=PTS-STARTPTS,volume=0.85,afade=t=in:st=0:d=0.3,afade=t=out:st=${totalDur - 0.8}:d=0.8,atrim=0:${totalDur},asetpts=PTS-STARTPTS[outa]`,
      "-map", "0:v", "-map", "[outa]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-t", String(totalDur), "-movflags", "+faststart", outputPath,
    ], { timeout: 60_000 });

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const outDur = await getDuration(outputPath);
    console.log(`\n  ✓ test-renders/curry-editorial.mp4`);
    console.log(`  ✓ ${sizeMB} MB | ${outDur.toFixed(1)}s`);
    console.log(`  ✓ ${shots.length} shots with editorial reasoning`);
    console.log(`  ✓ ${shots.filter(s => s.effects?.length > 0).length} shots with effects`);
    console.log(`  ✓ ${shots.filter(s => !s.effects?.length).length} clean shots (breathing room)`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  console.log("\n═══════════════════════════════════════════════════");
}

render().catch(err => { console.error("Fatal:", err); process.exit(1); });
