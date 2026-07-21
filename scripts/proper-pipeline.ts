/**
 * Proper Pipeline — analyzes CONTENT and STYLE, then edits.
 *
 * 1. Reference: extract effects, color, transitions, speed, overlays
 * 2. Raw: classify each segment (action, celebration, shot, reaction)
 * 3. Match: select Steph Curry's BEST moments (celebrations, shots)
 * 4. Apply: effects, color grading, transitions from reference
 */
import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";
const REF = "/Users/hamza/Desktop/reserves/monet-ai-story/reference-edits-2/new-reference.MOV";
const OUTPUT_DIR = "/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output";

// ═══════════════════════════════════════════════════════════
// REFERENCE ANALYSIS — extract the STYLE DNA
// ═══════════════════════════════════════════════════════════

interface ReferenceStyleDNA {
  cuts: number;
  avgShotDuration: number;
  shotDurations: number[];
  hasSpeedRamps: boolean;
  speedRampPattern: string;
  colorGrade: string;
  contrastBoost: number;
  saturationBoost: number;
  hasFlashFrames: boolean;
  flashFrequency: number;
  transitionTypes: string[];
  avgTransitionDuration: number;
  hasSlowMo: boolean;
  slowMoRatio: number;
  climaxPosition: number;
  energyCurve: number[];
}

async function analyzeReferenceStyle(): Promise<ReferenceStyleDNA> {
  console.log("=== Analyzing Reference Style DNA ===\n");

  const [scenes, energy] = await Promise.all([
    detectSceneChanges(REF, 0.3),
    analyzeVideoEnergy(REF, 0.5),
  ]);

  // Extract frames for visual analysis
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-style-"));
  try {
    await execFileAsync("ffmpeg", [
      "-i", REF, "-vf", "fps=10", "-q:v", "2",
      path.join(tmpDir, "frame_%04d.jpg"),
    ], { timeout: 30000 });

    const frames = (await fs.readdir(tmpDir)).filter(f => f.endsWith(".jpg")).sort();

    // Analyze brightness per frame (detect flashes)
    const brightnesses: number[] = [];
    for (const frame of frames) {
      try {
        const { stdout } = await execFileAsync("ffmpeg", [
          "-i", path.join(tmpDir, frame),
          "-vf", "signalstats",
          "-f", "null", "-",
        ], { timeout: 5000, encoding: "utf8" });

        // Parse YAVG from stderr
        const match = stdout.match(/YAVG=(\d+\.?\d*)/);
        brightnesses.push(match ? parseFloat(match[1]) : 128);
      } catch {
        brightnesses.push(128);
      }
    }

    const avgBrightness = brightnesses.reduce((s, b) => s + b, 0) / brightnesses.length;
    const flashFrames = brightnesses.filter(b => b > avgBrightness * 1.6);
    const flashFrequency = flashFrames.length / frames.length;

    // Detect speed ramps (unusual shot durations)
    const avgDur = scenes.avgShotDuration;
    const fastShots = scenes.shotDurations.filter(d => d < avgDur * 0.4);
    const slowShots = scenes.shotDurations.filter(d => d > avgDur * 2);

    // Color analysis
    const { stdout: colorStdout } = await execFileAsync("ffmpeg", [
      "-i", REF,
      "-vf", "signalstats=stat=tout+vrep+brng",
      "-f", "null", "-",
    ], { timeout: 15000 }).catch(() => ({ stdout: "" }));

    const satAvg = parseFloat(colorStdout.match(/SAT_AVG=(\d+\.?\d*)/)?.[1] ?? "128") / 255;
    const brngAvg = parseFloat(colorStdout.match(/BRNG_AVG=(\d+\.?\d*)/)?.[1] ?? "0");

    const dna: ReferenceStyleDNA = {
      cuts: scenes.scenes.length,
      avgShotDuration: scenes.avgShotDuration,
      shotDurations: scenes.shotDurations,
      hasSpeedRamps: fastShots.length > 0 || slowShots.length > 0,
      speedRampPattern: fastShots.length > slowShots.length ? "fast-heavy" : "slow-heavy",
      colorGrade: satAvg > 0.6 ? "saturated" : satAvg < 0.4 ? "desaturated" : "natural",
      contrastBoost: brngAvg > 0.1 ? 1.3 : 1.0,
      saturationBoost: satAvg > 0.6 ? 1.3 : satAvg > 0.5 ? 1.1 : 1.0,
      hasFlashFrames: flashFrames.length > 2,
      flashFrequency,
      transitionTypes: detectTransitionTypes(scenes),
      avgTransitionDuration: 0.1,
      hasSlowMo: slowShots.length > 0,
      slowMoRatio: slowShots.length / Math.max(1, scenes.shotCount),
      climaxPosition: energy.climaxPosition,
      energyCurve: energy.energyCurve,
    };

    console.log("Cuts:", dna.cuts, "avg", dna.avgShotDuration.toFixed(2) + "s");
    console.log("Speed ramps:", dna.hasSpeedRamps, "(" + dna.speedRampPattern + ")");
    console.log("Color:", dna.colorGrade, "contrast", dna.contrastBoost, "saturation", dna.saturationBoost);
    console.log("Flash frames:", dna.hasFlashFrames, "freq", dna.flashFrequency.toFixed(3));
    console.log("Slow-mo:", dna.hasSlowMo, "ratio", dna.slowMoRatio.toFixed(2));
    console.log("Climax:", dna.climaxPosition.toFixed(2));
    console.log("Transitions:", dna.transitionTypes.join(", "));

    return dna;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function detectTransitionTypes(scenes: any): string[] {
  const types: string[] = [];
  const avgDur = scenes.avgShotDuration;

  for (const dur of scenes.shotDurations) {
    if (dur < 0.2) types.push("flash-cut");
    else if (dur < avgDur * 0.5) types.push("quick-cut");
    else if (dur > avgDur * 2) types.push("hold");
    else types.push("standard");
  }

  return [...new Set(types)];
}

// ═══════════════════════════════════════════════════════════
// RAW FOOTAGE ANALYSIS — classify CONTENT of each segment
// ═══════════════════════════════════════════════════════════

interface RawSegment {
  startTime: number;
  endTime: number;
  contentType: "action" | "celebration" | "shot" | "reaction" | "transition" | "establishing";
  motionScore: number;
  brightness: number;
  contrast: number;
  description: string;
  score: number; // 0-1, how good is this moment
}

async function analyzeRawContent(): Promise<RawSegment[]> {
  console.log("\n=== Analyzing Raw Footage Content ===\n");

  const [scenes, cv] = await Promise.all([
    detectSceneChanges(RAW, 0.3),
    extractCVMetrics(RAW, 2.0),
  ]);

  const sceneTimes = [0, ...scenes.scenes.map((s: any) => s.timestamp), 72.83];

  // Extract frames for content analysis
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "raw-content-"));
  try {
    // Extract a frame from the middle of each segment
    const segments: RawSegment[] = [];

    for (let i = 0; i < sceneTimes.length - 1; i++) {
      const start = sceneTimes[i];
      const end = sceneTimes[i + 1];
      const dur = end - start;
      if (dur < 0.3) continue;

      const mid = start + dur / 2;

      // Extract frame at midpoint
      const framePath = path.join(tmpDir, `frame_${i}.jpg`);
      await execFileAsync("ffmpeg", [
        "-ss", String(mid),
        "-i", RAW,
        "-frames:v", "1",
        "-q:v", "2",
        framePath,
      ], { timeout: 10000 }).catch(() => {});

      // Analyze frame for content type
      let brightness = 128;
      let contrast = 128;
      try {
        const { stdout } = await execFileAsync("ffmpeg", [
          "-i", framePath,
          "-vf", "signalstats",
          "-f", "null", "-",
        ], { timeout: 5000, encoding: "utf8" });

        const yavg = parseFloat(stdout.match(/YAVG=(\d+\.?\d*)/)?.[1] ?? "128");
        const ymin = parseFloat(stdout.match(/YMIN=(\d+\.?\d*)/)?.[1] ?? "0");
        const ymax = parseFloat(stdout.match(/YMAX=(\d+\.?\d*)/)?.[1] ?? "255");
        brightness = yavg;
        contrast = ymax - ymin;
      } catch {}

      // Get CV metrics for this segment
      const cvSeg = cv.segments.find(s =>
        s.startTime >= start - 0.1 && s.endTime <= end + 0.1
      );
      const motionScore = cvSeg?.motionScore ?? 0.5;

      // Classify content type based on characteristics
      const contentType = classifyContent(motionScore, brightness, contrast, dur, i, sceneTimes.length);

      // Score this moment (higher = better for highlight reel)
      let score = 0;
      if (contentType === "celebration") score = 0.9;
      else if (contentType === "shot") score = 0.85;
      else if (contentType === "action") score = 0.7;
      else if (contentType === "reaction") score = 0.75;
      else if (contentType === "establishing") score = 0.3;
      else score = 0.4;

      // Boost for high motion (exciting moments)
      score += motionScore * 0.2;

      // Boost for high contrast (dramatic moments)
      score += (contrast / 255) * 0.1;

      segments.push({
        startTime: start,
        endTime: end,
        contentType,
        motionScore,
        brightness,
        contrast,
        description: `${contentType} at ${start.toFixed(1)}s (motion=${motionScore.toFixed(2)}, contrast=${contrast})`,
        score: Math.min(1, score),
      });
    }

    // Print content breakdown
    const typeCounts: Record<string, number> = {};
    for (const seg of segments) {
      typeCounts[seg.contentType] = (typeCounts[seg.contentType] || 0) + 1;
    }
    console.log("Content breakdown:", typeCounts);

    // Print timeline
    console.log("\nRaw footage timeline:");
    for (const seg of segments) {
      const bar = "█".repeat(Math.round(seg.score * 20));
      console.log(`  ${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s: ${seg.contentType.padEnd(12)} ${bar} (${seg.score.toFixed(2)})`);
    }

    return segments;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function classifyContent(
  motion: number,
  brightness: number,
  contrast: number,
  duration: number,
  index: number,
  total: number,
): RawSegment["contentType"] {
  // Steph Curry specific: high motion + high contrast = shot/celebration
  if (motion > 0.7 && contrast > 150) return "celebration";
  if (motion > 0.6 && contrast > 120) return "shot";
  if (motion > 0.5) return "action";
  if (brightness > 180 && contrast < 100) return "establishing";
  if (motion < 0.2) return "transition";

  // Position-based heuristics
  const pos = index / total;
  if (pos < 0.1) return "establishing";
  if (pos > 0.9) return "establishing";

  return "action";
}

// ═══════════════════════════════════════════════════════════
// EDIT — match reference style to Steph Curry highlights
// ═══════════════════════════════════════════════════════════

async function generateStyledEdit(
  refDNA: ReferenceStyleDNA,
  rawSegments: RawSegment[],
) {
  console.log("\n=== Generating Styled Edit ===\n");

  // Step 1: Select best moments (celebrations, shots, reactions)
  const bestMoments = rawSegments
    .filter(s => s.contentType === "celebration" || s.contentType === "shot" || s.contentType === "reaction")
    .sort((a, b) => b.score - a.score);

  console.log("Best moments found:", bestMoments.length);
  for (const m of bestMoments.slice(0, 10)) {
    console.log(`  ${m.startTime.toFixed(1)}-${m.endTime.toFixed(1)}s: ${m.contentType} (score=${m.score.toFixed(2)})`);
  }

  // Step 2: Build edit matching reference pacing
  const targetDuration = refDNA.avgShotDuration * refDNA.cuts;
  console.log(`\nTarget: ${targetDuration.toFixed(1)}s (${refDNA.cuts} shots × ${refDNA.avgShotDuration.toFixed(2)}s)`);

  // Select shots to fill target duration
  const selectedShots: RawSegment[] = [];
  let totalDur = 0;

  // Start with best celebration/shot
  for (const moment of bestMoments) {
    if (totalDur >= targetDuration) break;
    const shotDur = Math.min(moment.endTime - moment.startTime, refDNA.avgShotDuration * 1.5);
    selectedShots.push({
      ...moment,
      endTime: moment.startTime + shotDur,
    });
    totalDur += shotDur;
  }

  // Sort by time for natural flow
  selectedShots.sort((a, b) => a.startTime - b.startTime);

  console.log(`\nSelected ${selectedShots.length} shots, total ${totalDur.toFixed(1)}s`);
  for (const shot of selectedShots) {
    console.log(`  ${shot.startTime.toFixed(1)}-${shot.endTime.toFixed(1)}s: ${shot.contentType}`);
  }

  // Step 3: Build FFmpeg commands with effects
  const tmpDir = "/tmp/jalebi-styled-edit";
  await fs.mkdir(tmpDir, { recursive: true });

  const segmentFiles: string[] = [];

  for (let i = 0; i < selectedShots.length; i++) {
    const shot = selectedShots[i];
    const segPath = path.join(tmpDir, `seg_${i}.mp4`);
    const dur = shot.endTime - shot.startTime;

    // Apply per-segment effects based on reference style
    const filters: string[] = [];

    // Speed ramp on celebrations
    if (shot.contentType === "celebration" && refDNA.hasSpeedRamps) {
      // Slow-mo first half, normal second half
      filters.push("setpts='if(lt(T,0.5),3*PTS,PTS)'");
    }

    // Flash on quick cuts
    if (refDNA.hasFlashFrames && dur < 1) {
      filters.push("eq=brightness=0.1:contrast=1.2");
    }

    const filterStr = filters.length > 0 ? ["-vf", filters.join(",")] : [];

    await execFileAsync("ffmpeg", [
      "-ss", String(shot.startTime),
      "-i", RAW,
      "-t", String(dur),
      ...filterStr,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-ac", "2",
      "-y", segPath,
    ], { timeout: 30000 });

    segmentFiles.push(segPath);
  }

  // Step 4: Concat with global color grading
  const concatList = path.join(tmpDir, "concat.txt");
  await fs.writeFile(concatList, segmentFiles.map(f => `file '${f}'`).join("\n"));

  const outputPath = path.join(OUTPUT_DIR, "steph-curry-styled.mp4");

  // Color grade to match reference
  const colorFilter = refDNA.contrastBoost > 1 || refDNA.saturationBoost > 1
    ? ["-vf", `eq=contrast=${refDNA.contrastBoost}:saturation=${refDNA.saturationBoost}:brightness=0.03`]
    : [];

  await execFileAsync("ffmpeg", [
    "-f", "concat",
    "-safe", "0",
    "-i", concatList,
    ...colorFilter,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y",
    outputPath,
  ], { timeout: 60000 });

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n✓ Styled edit saved: ${outputPath}`);
  return outputPath;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const refDNA = await analyzeReferenceStyle();
  const rawSegments = await analyzeRawContent();
  await generateStyledEdit(refDNA, rawSegments);
}

main().catch(console.error);
