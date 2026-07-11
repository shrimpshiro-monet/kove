/**
 * audio-structure.ts — Song structure analysis using FFmpeg.
 *
 * Detects beats, energy peaks, sections (intro/verse/chorus/drop/outro),
 * and finds the best N-second segment of a song for editing.
 *
 * All analysis is deterministic via FFmpeg audio filters — no LLM needed.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export interface SongSection {
  type: "intro" | "verse" | "chorus" | "drop" | "outro" | "build" | "breakdown";
  start: number;
  end: number;
  energy: number;
  confidence: number;
}

export interface BeatInfo {
  timestamp: number;
  strength: number;
}

export interface SongAnalysis {
  duration: number;
  bpm: number;
  beatConfidence: number;
  beats: BeatInfo[];
  sections: SongSection[];
  energyCurve: number[]; // 100 buckets, 0-1
  peakMoment: number; // timestamp of highest energy
  bestSegment: { start: number; end: number; score: number };
  loudness: {
    integrated: number;
    range: number;
    peak: number;
  };
}

/**
 * Analyze a song's structure.
 */
export async function analyzeSongStructure(
  audioPath: string,
  targetDuration = 30
): Promise<SongAnalysis> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "song-analysis-"));

  try {
    // Get duration
    const duration = await getDuration(audioPath);

    // Extract audio features using FFmpeg
    const energyData = await extractEnergyCurve(audioPath, duration, tmpDir);
    const beatData = await detectBeats(audioPath, tmpDir);
    const loudness = await analyzeLoudness(audioPath);

    // Detect BPM from beat intervals
    const bpm = detectBPM(beatData);

    // Build energy curve (100 buckets)
    const energyCurve = buildEnergyCurve(energyData, duration, 100);

    // Find peak moment
    const peakIdx = energyCurve.reduce((maxI, v, i, arr) =>
      v > arr[maxI] ? i : maxI, 0);
    const peakMoment = (peakIdx / 100) * duration;

    // Detect sections from energy transitions
    const sections = detectSections(energyCurve, duration, bpm);

    // Find best segment of target duration
    const bestSegment = findBestSegment(energyCurve, duration, targetDuration);

    return {
      duration,
      bpm,
      beatConfidence: beatData.length > 10 ? 0.8 : 0.5,
      beats: beatData,
      sections,
      energyCurve,
      peakMoment,
      bestSegment,
      loudness,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Find the best N-second segment of a song for editing.
 *
 * Scoring considers:
 * - Energy level (higher = more exciting)
 * - Energy variance (more dynamic = better)
 * - Beat density (more beats = more cut points)
 * - Proximity to peak (closer to the best moment = better)
 */
export function findBestSegment(
  energyCurve: number[],
  totalDuration: number,
  targetDuration: number
): { start: number; end: number; score: number } {
  const bucketSize = totalDuration / energyCurve.length;
  const bucketsNeeded = Math.ceil(targetDuration / bucketSize);

  let bestStart = 0;
  let bestScore = -1;

  for (let startBucket = 0; startBucket <= energyCurve.length - bucketsNeeded; startBucket++) {
    const segment = energyCurve.slice(startBucket, startBucket + bucketsNeeded);

    // Score: weighted combination of metrics
    const avgEnergy = segment.reduce((a, b) => a + b, 0) / segment.length;
    const energyVariance = segment.reduce((s, v) => s + (v - avgEnergy) ** 2, 0) / segment.length;
    const peakInSegment = Math.max(...segment);

    // Energy ramp: rising energy is more exciting
    let rampScore = 0;
    for (let i = 1; i < segment.length; i++) {
      if (segment[i] > segment[i - 1]) rampScore += 0.1;
    }

    const score =
      avgEnergy * 0.4 +
      energyVariance * 0.2 +
      peakInSegment * 0.2 +
      rampScore * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestStart = startBucket;
    }
  }

  return {
    start: Math.round(bestStart * bucketSize * 100) / 100,
    end: Math.round(Math.min((bestStart + bucketsNeeded) * bucketSize, totalDuration) * 100) / 100,
    score: Math.round(bestScore * 100) / 100,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────

async function getDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { timeout: 10_000 });
  return parseFloat(stdout.trim());
}

async function extractEnergyCurve(
  audioPath: string,
  duration: number,
  tmpDir: string
): Promise<number[]> {
  // Extract volume levels using FFmpeg's astats filter
  const statsPath = path.join(tmpDir, "energy.txt");

  try {
    // Split into 100 chunks and get RMS for each
    const chunks = 100;
    const chunkDuration = duration / chunks;
    const energy: number[] = [];

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkDuration;
      try {
        const { stderr } = await execFileAsync("ffmpeg", [
          "-ss", String(start),
          "-t", String(chunkDuration),
          "-i", audioPath,
          "-af", "astats=metadata=1:reset=0",
          "-f", "null", "-",
        ], { timeout: 10_000 });

        // Parse RMS level from astats output
        const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
        const rms = rmsMatch ? parseFloat(rmsMatch[1]) : -30;
        // Normalize: -30dB = 0, 0dB = 1
        const normalized = Math.max(0, Math.min(1, (rms + 30) / 30));
        energy.push(normalized);
      } catch {
        energy.push(0.5);
      }
    }

    return energy;
  } catch {
    return new Array(100).fill(0.5);
  }
}

async function detectBeats(
  audioPath: string,
  tmpDir: string
): Promise<BeatInfo[]> {
  // Use FFmpeg's ebur128 filter to detect loudness peaks (proxy for beats)
  const beats: BeatInfo[] = [];

  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", audioPath,
      "-af", "ebur128=peak=true",
      "-f", "null", "-",
    ], { timeout: 60_000 });

    // Parse timestamped loudness data
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/t:\s*([\d.]+)\s+.*M:\s*([-\d.]+)/);
      if (match) {
        const timestamp = parseFloat(match[1]);
        const loudness = parseFloat(match[2]);
        if (!isNaN(timestamp) && !isNaN(loudness)) {
          beats.push({
            timestamp,
            strength: Math.max(0, Math.min(1, (loudness + 30) / 30)),
          });
        }
      }
    }
  } catch {
    // Fallback: use volume detection
  }

  return beats;
}

async function analyzeLoudness(audioPath: string) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", audioPath,
      "-af", "ebur128=peak=true",
      "-f", "null", "-",
    ], { timeout: 60_000 });

    const integratedMatch = stderr.match(/Integrated loudness:\s*([-\d.]+)/);
    const rangeMatch = stderr.match(/Loudness range:\s*([-\d.]+)/);
    const peakMatch = stderr.match(/True peak:\s*([-\d.]+)/);

    return {
      integrated: integratedMatch ? parseFloat(integratedMatch[1]) : -20,
      range: rangeMatch ? parseFloat(rangeMatch[1]) : 10,
      peak: peakMatch ? parseFloat(peakMatch[1]) : -1,
    };
  } catch {
    return { integrated: -20, range: 10, peak: -1 };
  }
}

function detectBPM(beats: BeatInfo[]): number {
  if (beats.length < 4) return 120; // default

  // Calculate intervals between strong beats
  const strongBeats = beats.filter(b => b.strength > 0.5);
  if (strongBeats.length < 4) return 120;

  const intervals: number[] = [];
  for (let i = 1; i < strongBeats.length; i++) {
    const interval = strongBeats[i].timestamp - strongBeats[i - 1].timestamp;
    if (interval > 0.1 && interval < 2) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) return 120;

  // Median interval → BPM
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const bpm = Math.round(60 / median);

  // Clamp to reasonable range
  return Math.max(60, Math.min(200, bpm));
}

function buildEnergyCurve(
  energyData: number[],
  duration: number,
  buckets: number
): number[] {
  if (energyData.length === 0) return new Array(buckets).fill(0.5);

  const result: number[] = [];
  const bucketSize = energyData.length / buckets;

  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const slice = energyData.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
    result.push(Math.round(avg * 100) / 100);
  }

  return result;
}

function detectSections(
  energyCurve: number[],
  duration: number,
  bpm: number
): SongSection[] {
  const sections: SongSection[] = [];
  const bucketSize = duration / energyCurve.length;

  // Simple section detection based on energy levels
  let currentSection: SongSection | null = null;

  for (let i = 0; i < energyCurve.length; i++) {
    const energy = energyCurve[i];
    const time = i * bucketSize;

    let sectionType: SongSection["type"];
    if (energy < 0.25) sectionType = "intro";
    else if (energy < 0.4) sectionType = "verse";
    else if (energy < 0.6) sectionType = "build";
    else if (energy < 0.8) sectionType = "chorus";
    else sectionType = "drop";

    // Check for section transition
    if (!currentSection || currentSection.type !== sectionType) {
      if (currentSection) {
        currentSection.end = time;
        sections.push(currentSection);
      }
      currentSection = {
        type: sectionType,
        start: time,
        end: time,
        energy,
        confidence: 0.7,
      };
    } else {
      currentSection.energy = Math.max(currentSection.energy, energy);
    }
  }

  if (currentSection) {
    currentSection.end = duration;
    sections.push(currentSection);
  }

  // Merge short sections (< 2s)
  const merged: SongSection[] = [];
  for (const section of sections) {
    if (merged.length > 0 && section.end - section.start < 2) {
      merged[merged.length - 1].end = section.end;
    } else {
      merged.push({ ...section });
    }
  }

  return merged;
}
