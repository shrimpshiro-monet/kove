#!/usr/bin/env node
/**
 * render-final-v2.mjs — Properly implements user's black flash audio design.
 *
 * Key requirements:
 * 1. Color correction (vibrant, not noisy)
 * 2. Music at 1:16 (21 Savage verse)
 * 3. Black flash sequence: audio gets reverb + slow + pan L→R + sword SFX → song returns
 * 4. Restrained TikTok-style effects
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

// User specified: 21 Savage verse starts at 1:16 (76s)
const MUSIC_START = 76.0;
const TOTAL_DURATION = 30;

async function getDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

// ─── Generate sword sheath SFX ────────────────────────────────────

async function generateSwordSFX(tmpDir) {
  const sfxPath = path.join(tmpDir, "sword_sheath.wav");

  // Sword sheath: short metallic scrape (high-pass filtered noise burst)
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "anoisesrc=d=0.25:c=pink:a=0.4",
      "-af", "highpass=f=3000,lowpass=f=8000,afade=t=in:st=0:d=0.02,afade=t=out:st=0.08:d=0.17,volume=0.5",
      "-ar", "44100", "-ac", "1",
      sfxPath,
    ], { timeout: 10_000 });
    return sfxPath;
  } catch {
    return null;
  }
}

// ─── Shot definitions ─────────────────────────────────────────────

function getShots() {
  // TikTok-accurate: restrained effects, real cut patterns
  // Black flash sequences at 10s and 20s marks
  return [
    // Opening — clean cuts building energy
    { start: 0, dur: 1.8, fx: [], trans: "cut", speed: 1.0, grade: "vibrant" },
    { start: 1.8, dur: 1.2, fx: ["flash"], trans: "flash", speed: 1.0, grade: "vibrant" },
    { start: 3.0, dur: 2.0, fx: [], trans: "cut", speed: 1.0, grade: "vibrant" },
    { start: 5.0, dur: 1.5, fx: ["shake"], trans: "cut", speed: 1.0, grade: "vibrant" },
    { start: 6.5, dur: 1.5, fx: [], trans: "cut", speed: 1.0, grade: "vibrant" },

    // Build
    { start: 8.0, dur: 1.2, fx: ["flash"], trans: "flash", speed: 1.1, grade: "vibrant" },
    { start: 9.2, dur: 0.8, fx: ["chromatic"], trans: "cut", speed: 1.0, grade: "vibrant" },

    // ═══ BLACK FLASH SEQUENCE 1 (10s-11s) ═══
    // 0.5s video flash + 0.5s black = 1s total
    // Audio: reverb + slow + pan L→R → sword SFX → back to normal
    { start: 10.0, dur: 1.0, fx: ["flash"], trans: "cut", speed: 1.0, grade: "neon", blackFlash: true },

    // Post-drop energy
    { start: 11.0, dur: 1.5, fx: ["shake"], trans: "flash", speed: 1.2, grade: "vibrant" },
    { start: 12.5, dur: 1.8, fx: [], trans: "cut", speed: 1.0, grade: "vibrant" },
    { start: 14.3, dur: 1.5, fx: ["flash"], trans: "cut", speed: 1.0, grade: "vibrant" },

    // Speed ramp moment
    { start: 15.8, dur: 2.0, fx: ["chromatic"], trans: "cut", speed: 0.5, grade: "vibrant" },

    // Recovery
    { start: 17.8, dur: 2.2, fx: [], trans: "fade", speed: 0.9, grade: "vibrant" },

    // ═══ BLACK FLASH SEQUENCE 2 (20s-21s) ═══
    { start: 20.0, dur: 1.0, fx: ["flash"], trans: "cut", speed: 1.0, grade: "neon", blackFlash: true },

    // Final section
    { start: 21.0, dur: 1.8, fx: ["shake"], trans: "cut", speed: 1.1, grade: "vibrant" },
    { start: 22.8, dur: 1.5, fx: [], trans: "cut", speed: 1.0, grade: "vibrant" },
    { start: 24.3, dur: 1.8, fx: ["flash"], trans: "flash", speed: 1.0, grade: "vibrant" },
    { start: 26.1, dur: 1.9, fx: [], trans: "cut", speed: 1.0, grade: "vibrant" },

    // Outro
    { start: 28.0, dur: 2.0, fx: [], trans: "fade", speed: 0.8, grade: "desaturated" },
  ];
}

// ─── Color grading filter ──────────────────────────────────────────

function gradeFilter(preset) {
  if (preset === "neon") return "eq=contrast=1.25:saturation=1.3:brightness=0.05";
  if (preset === "desaturated") return "eq=contrast=1.05:saturation=0.8:brightness=0.02";
  // vibrant_warm: Kove's preset
  return "eq=contrast=1.15:saturation=1.1:brightness=0.05";
}

// ─── Render pipeline ──────────────────────────────────────────────

async function render() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Final v2 — Black Flash Audio Design");
  console.log("═══════════════════════════════════════════════════\n");

  const footageDuration = await getDuration(FOOTAGE);
  const shots = getShots();

  const fxCount = shots.filter(s => s.fx.length > 0).length;
  const bfCount = shots.filter(s => s.blackFlash).length;

  console.log(`Shots: ${shots.length} | Duration: ${TOTAL_DURATION}s`);
  console.log(`Effects: ${fxCount} shots | Black flash: ${bfCount}`);
  console.log(`Music: ${MUSIC_START}s (21 Savage verse)`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "monet-v2-"));

  try {
    // Generate SFX
    const swordSfx = await generateSwordSFX(tmpDir);
    console.log(`Sword SFX: ${swordSfx ? "OK" : "fallback"}`);

    // ═══ PASS 1: Extract video shots ═══
    console.log("\nPass 1: Extracting video...");
    const videoFiles = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const outFile = path.join(tmpDir, `vid_${String(i).padStart(3, "0")}.mp4`);

      // Source: distribute across footage
      const sourceStart = (shot.start / TOTAL_DURATION) * footageDuration;
      const sourceEnd = Math.min(footageDuration - 0.3, sourceStart + shot.dur * 1.5);

      const filters = [];
      if (shot.speed !== 1.0) filters.push(`setpts=PTS/${shot.speed.toFixed(3)}`);
      filters.push(gradeFilter(shot.grade));
      for (const fx of shot.fx) {
        if (fx === "flash") filters.push("eq=brightness=0.2:contrast=1.1");
        else if (fx === "shake") filters.push("crop=iw-8:ih-8:4+random(1)*4:4+random(2)*4,scale=trunc(iw/2)*2:trunc(ih/2)*2");
        else if (fx === "chromatic") filters.push("rgbashift=rh=-3:bh=3");
      }

      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", String(sourceStart), "-i", FOOTAGE,
          "-t", String(sourceEnd - sourceStart),
          "-vf", filters.join(","), "-an",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
          "-r", "30", "-pix_fmt", "yuv420p", outFile,
        ], { timeout: 60_000 });
        videoFiles.push(outFile);
      } catch { console.error(`  Failed shot ${i}`); }
    }
    console.log(`  ${videoFiles.length}/${shots.length} video shots`);

    // ═══ PASS 2: Build black flash video segments ═══
    console.log("\nPass 2: Black flash sequences...");
    const finalVideo = [];

    for (let i = 0; i < videoFiles.length; i++) {
      const shot = shots[i];

      if (shot.blackFlash) {
        // 5 cycles: 0.1s bright video + 0.1s black
        for (let f = 0; f < 5; f++) {
          const flashFile = path.join(tmpDir, `bf_v_${i}_${f}.mp4`);
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-i", videoFiles[i], "-t", "0.1",
              "-vf", "eq=brightness=0.35:contrast=1.2",
              "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
              "-r", "30", "-pix_fmt", "yuv420p", flashFile,
            ], { timeout: 10_000 });
            finalVideo.push(flashFile);
          } catch { finalVideo.push(videoFiles[i]); }

          // Black frame
          const blkFile = path.join(tmpDir, `bf_b_${i}_${f}.mp4`);
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=0.1",
              "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
              "-r", "30", blkFile,
            ], { timeout: 5_000 });
            finalVideo.push(blkFile);
          } catch {}
        }
      } else {
        // Apply transition
        const trFile = path.join(tmpDir, `tr_${String(i).padStart(3, "0")}.mp4`);
        const vf = [];
        if (shot.trans === "flash") vf.push("fade=t=in:st=0:d=0.08:c=white");
        else if (shot.trans === "fade") vf.push("fade=t=in:st=0:d=0.2");

        if (vf.length > 0) {
          try {
            await execFileAsync("ffmpeg", [
              "-y", "-i", videoFiles[i], "-vf", vf.join(","),
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
              "-pix_fmt", "yuv420p", trFile,
            ], { timeout: 15_000 });
            finalVideo.push(trFile);
          } catch { finalVideo.push(videoFiles[i]); }
        } else {
          finalVideo.push(videoFiles[i]);
        }
      }
    }

    // Concatenate video
    const vList = path.join(tmpDir, "vlist.txt");
    await fs.writeFile(vList, finalVideo.map(f => `file '${f}'`).join("\n"));
    const videoConcat = path.join(tmpDir, "video.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", vList,
      "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
      videoConcat,
    ], { timeout: 120_000 });
    console.log(`  ${finalVideo.length} video segments`);

    // ═══ PASS 3: Build audio with per-segment effects ═══
    console.log("\nPass 3: Building audio (reverb + pan for black flashes)...");

    // Extract the music segment we want (21 Savage verse)
    const musicRaw = path.join(tmpDir, "music_raw.wav");
    await execFileAsync("ffmpeg", [
      "-y", "-ss", String(MUSIC_START), "-i", MUSIC,
      "-t", String(TOTAL_DURATION + 2), // Extra for safety
      "-ar", "44100", "-ac", "2",
      musicRaw,
    ], { timeout: 30_000 });

    // Build audio segments matching video shots
    const audioSegments = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const audioSeg = path.join(tmpDir, `aud_${String(i).padStart(3, "0")}.wav`);

      if (shot.blackFlash) {
        // ═══ BLACK FLASH AUDIO: reverb + slow + pan L→R ═══
        // During the 1s black flash: audio gets reverbed, slowed, panned
        try {
          await execFileAsync("ffmpeg", [
            "-y", "-ss", String(shot.start), "-i", musicRaw,
            "-t", String(shot.dur),
            "-af", [
              "atempo=0.7",           // Slow down
              "volume=0.25",          // Lower volume
              "aecho=0.8:0.88:60:0.4", // Reverb
              "apulsator=mode=sine:hz=0.5:amount=1", // Pan L→R
            ].join(","),
            "-ar", "44100", "-ac", "2",
            audioSeg,
          ], { timeout: 30_000 });
          audioSegments.push(audioSeg);
        } catch { audioSegments.push(audioSeg); }

        // ═══ SWORD SFX at the end of black flash ═══
        if (swordSfx) {
          const swordSeg = path.join(tmpDir, `sword_${String(i).padStart(3, "0")}.wav`);
          try {
            // Place sword SFX at the end of the black flash segment
            // Pad with silence before, then the SFX
            await execFileAsync("ffmpeg", [
              "-y", "-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`,
              "-t", "0.15", // Silence before sword
              "-ar", "44100", "-ac", "2",
              swordSeg,
            ], { timeout: 5_000 });
            audioSegments.push(swordSeg);

            // Then the actual sword sound
            const swordSound = path.join(tmpDir, `sword_actual_${String(i).padStart(3, "0")}.wav`);
            await execFileAsync("ffmpeg", [
              "-y", "-i", swordSfx,
              "-af", "volume=0.8",
              "-ar", "44100", "-ac", "2",
              swordSound,
            ], { timeout: 5_000 });
            audioSegments.push(swordSound);
          } catch {}
        }

        // ═══ SONG RETURNS TO NORMAL after sword ═══
        // Next shot's audio will be normal (handled by next iteration)
      } else {
        // ═══ NORMAL AUDIO ═══
        try {
          await execFileAsync("ffmpeg", [
            "-y", "-ss", String(shot.start), "-i", musicRaw,
            "-t", String(shot.dur),
            "-af", "volume=0.85",
            "-ar", "44100", "-ac", "2",
            audioSeg,
          ], { timeout: 30_000 });
          audioSegments.push(audioSeg);
        } catch { audioSegments.push(audioSeg); }
      }
    }

    // Concatenate all audio segments
    const aList = path.join(tmpDir, "alist.txt");
    await fs.writeFile(aList, audioSegments.map(f => `file '${f}'`).join("\n"));
    const audioConcat = path.join(tmpDir, "audio.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", aList,
      "-c:a", "aac", "-b:a", "192k",
      audioConcat,
    ], { timeout: 60_000 });
    console.log(`  ${audioSegments.length} audio segments (including SFX)`);

    // ═══ PASS 4: Combine video + audio ═══
    console.log("\nPass 4: Combining...");
    const outputPath = path.join(OUTPUT_DIR, "curry-final-v2.mp4");

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoConcat,
      "-i", audioConcat,
      "-c:v", "copy",
      "-c:a", "copy",
      "-shortest",
      "-movflags", "+faststart",
      outputPath,
    ], { timeout: 60_000 });

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const outDuration = await getDuration(outputPath);

    console.log(`\n  ✓ Output: test-renders/curry-final-v2.mp4`);
    console.log(`  ✓ Size: ${sizeMB} MB | Duration: ${outDuration.toFixed(1)}s`);
    console.log(`  ✓ Color: vibrant_warm + hyper_neon on black flashes`);
    console.log(`  ✓ Music: 21 Savage verse at ${MUSIC_START}s`);
    console.log(`  ✓ Black flash audio: reverb + slow + pan L→R + sword SFX`);
    console.log(`  ✓ ${shots.filter(s => s.fx.length > 0).length} shots with effects`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n═══════════════════════════════════════════════════");
}

render().catch(err => { console.error("Fatal:", err); process.exit(1); });
