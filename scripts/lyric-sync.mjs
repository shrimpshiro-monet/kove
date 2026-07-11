#!/usr/bin/env node
/**
 * lyric-sync.mjs — Extract word-level timestamps from music using Whisper.
 *
 * This gives us the exact timing of every word in the song,
 * which we use for:
 * - Lyrics popping up as transitions
 * - Text behind subjects (matched to lyrics)
 * - Swish SFX on specific words
 * - Editorial reasoning tied to lyrical content
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const MUSIC = path.join(ROOT, "testfiles", "Outfit (with 21 Savage).mp3");
const OUTPUT_DIR = path.join(ROOT, "test-renders");

async function extractLyricsSegment(musicPath, startSec, durationSec, tmpDir) {
  const segmentPath = path.join(tmpDir, "segment.wav");
  await execFileAsync("ffmpeg", [
    "-y", "-ss", String(startSec), "-i", musicPath,
    "-t", String(durationSec),
    "-ar", "16000", "-ac", "1",
    segmentPath,
  ], { timeout: 30_000 });
  return segmentPath;
}

async function transcribeWithWhisper(wavPath) {
  // Use whisper with word-level timestamps
  const { stdout } = await execFileAsync("whisper", [
    wavPath,
    "--model", "base",
    "--language", "en",
    "--output_format", "json",
    "--word_timestamps", "True",
    "--output_dir", path.dirname(wavPath),
  ], { timeout: 120_000 });

  // Read the JSON output
  const jsonPath = wavPath.replace(".wav", ".json");
  const raw = await fs.readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

function extractWordTimestamps(whisperOutput, offsetSec) {
  const words = [];

  if (whisperOutput.segments) {
    for (const segment of whisperOutput.segments) {
      if (segment.words) {
        for (const word of segment.words) {
          words.push({
            word: word.word.trim(),
            start: word.start + offsetSec,
            end: word.end + offsetSec,
            confidence: word.probability || 0.8,
          });
        }
      }
    }
  }

  return words;
}

function findKeyLyrics(words) {
  // Find impactful words for visual sync
  const impactWords = [];
  const hypeWords = ["rich", "ice", "icey", "drip", "cold", "fire", "heat", "swag", "fly", "ball", "shoot", "three", "curry", "steph", "splash", "bucket"];
  const actionWords = ["go", "hit", "swish", "bounce", "dunk", "cross", "step", "pull", "drain", "net"];

  for (const w of words) {
    const lower = w.word.toLowerCase();
    if (hypeWords.some(hw => lower.includes(hw))) {
      impactWords.push({ ...w, type: "hype" });
    } else if (actionWords.some(aw => lower.includes(aw))) {
      impactWords.push({ ...w, type: "action" });
    }
  }

  return impactWords;
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Lyric Sync — Word-Level Timestamps");
  console.log("═══════════════════════════════════════════════════\n");

  const tmpDir = path.join(ROOT, "test-renders", "lyric-tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Extract the 21 Savage verse segment (1:16 - 2:16)
    const musicStart = 76;
    const duration = 30;

    console.log(`Extracting segment: ${musicStart}s → ${musicStart + duration}s`);
    const wavPath = await extractLyricsSegment(MUSIC, musicStart, duration, tmpDir);

    console.log("Running Whisper transcription...");
    const whisperOutput = await transcribeWithWhisper(wavPath);

    const words = extractWordTimestamps(whisperOutput, musicStart);
    console.log(`\nWords detected: ${words.length}`);

    // Find key lyrics for visual sync
    const keyLyrics = findKeyLyrics(words);
    console.log(`Impact words: ${keyLyrics.length}`);
    for (const w of keyLyrics) {
      console.log(`  ${w.start.toFixed(2)}s: "${w.word}" [${w.type}]`);
    }

    // Save full word timestamps
    const outputPath = path.join(OUTPUT_DIR, "lyric-timestamps.json");
    await fs.writeFile(outputPath, JSON.stringify({
      musicStart,
      duration,
      totalWords: words.length,
      words,
      keyLyrics,
      fullText: words.map(w => w.word).join(" "),
    }, null, 2));

    console.log(`\n✓ Output: test-renders/lyric-timestamps.json`);
    console.log(`✓ ${words.length} words with timestamps`);
    console.log(`✓ ${keyLyrics.length} impact words for visual sync`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n═══════════════════════════════════════════════════");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
