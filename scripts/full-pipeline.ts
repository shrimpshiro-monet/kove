/**
 * Full Pipeline Script — analyzes reference + raw footage, generates edited video.
 *
 * Outputs:
 * 1. reference-analysis.mp4 — visualization of the reference analysis
 * 2. steph-curry-edit.mp4   — the actual edited video
 */
import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";
const REF = "/Users/hamza/Desktop/reserves/monet-ai-story/reference-edits-2/new-reference.MOV";
const OUTPUT_DIR = "/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output";

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Analyze reference video
  // ═══════════════════════════════════════════════════════════
  console.log("═══ STEP 1: Analyzing reference video ═══\n");

  const [refScenes, refEnergy, refCV] = await Promise.all([
    detectSceneChanges(REF, 0.3),
    analyzeVideoEnergy(REF, 0.5),
    extractCVMetrics(REF, 2.0),
  ]);

  console.log(`Reference: ${refScenes.scenes.length} cuts, avg ${refScenes.avgShotDuration.toFixed(2)}s`);
  console.log(`Energy: climax at ${refEnergy.climaxPosition.toFixed(2)} (${(refEnergy.climaxPosition * 13.87).toFixed(1)}s)`);
  console.log(`CV: ${refCV.segments.length} segments`);

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Analyze raw footage
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ STEP 2: Analyzing raw footage ═══\n");

  const [rawScenes, rawEnergy, rawCV] = await Promise.all([
    detectSceneChanges(RAW, 0.3),
    analyzeVideoEnergy(RAW, 0.5),
    extractCVMetrics(RAW, 2.0),
  ]);

  console.log(`Raw: ${rawScenes.scenes.length} cuts, avg ${rawScenes.avgShotDuration.toFixed(2)}s`);
  console.log(`Energy: climax at ${rawEnergy.climaxPosition.toFixed(2)} (${(rawEnergy.climaxPosition * 72.83).toFixed(1)}s)`);
  console.log(`CV: ${rawCV.segments.length} segments`);

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Generate reference analysis visualization
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ STEP 3: Generating reference analysis video ═══\n");

  const refVizPath = path.join(OUTPUT_DIR, "reference-analysis.mp4");
  await generateReferenceVisualization(REF, refVizPath, refScenes, refEnergy, refCV);
  console.log(`✓ Reference analysis video saved: ${refVizPath}`);

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Generate edited video
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ STEP 4: Generating edited video ═══\n");

  const editPath = path.join(OUTPUT_DIR, "steph-curry-edit.mp4");
  await generateEdit(RAW, editPath, rawScenes, rawEnergy, rawCV, refEnergy);
  console.log(`✓ Edited video saved: ${editPath}`);

  console.log("\n═══ DONE ═══");
  console.log(`Reference analysis: ${refVizPath}`);
  console.log(`Edited video: ${editPath}`);
}

// ═══════════════════════════════════════════════════════════
// REFERENCE VISUALIZATION
// ═══════════════════════════════════════════════════════════

async function generateReferenceVisualization(
  inputPath: string,
  outputPath: string,
  scenes: any,
  energy: any,
  cv: any,
) {
  const duration = 13.87;
  const w = 1080;
  const h = 1440;

  // Build scene change markers (red vertical bars)
  const sceneFilters = scenes.scenes.map((s: any) => {
    const t = s.timestamp;
    return `drawbox=x=0:y=0:w=4:h=ih:color=red@0.8:enable='between(t,${t - 0.05},${t + 0.05})'`;
  }).join(",");

  // Build energy bar overlay (colored bars at bottom)
  const energyBarFilter = generateEnergyBarFilter(energy, duration);

  // Climax marker (orange bar)
  const climaxTime = energy.climaxPosition * duration;
  const climaxFilter = `drawbox=x=0:y=0:w=iw:h=8:color=orange@0.9:enable='between(t,${climaxTime - 0.3},${climaxTime + 0.3})'`;

  // Combine all filters
  const allFilters = [sceneFilters, energyBarFilter, climaxFilter]
    .filter(f => f.length > 0)
    .join(",");

  const cmd = [
    "-i", inputPath,
    "-y",
  ];

  if (allFilters.length > 0) {
    cmd.push("-vf", allFilters);
  }

  cmd.push(
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    outputPath,
  );

  console.log("Running FFmpeg for reference visualization...");
  try {
    await execFileAsync("ffmpeg", cmd, { timeout: 60000 });
  } catch (e: any) {
    console.error("FFmpeg error:", e.stderr?.slice(0, 500));
    throw e;
  }
}

function generateEnergyBarFilter(energy: any, duration: number): string {
  if (!energy.energyCurve || energy.energyCurve.length === 0) return "";

  // Create a scrolling energy bar at the bottom
  const barHeight = 80;
  const segments = energy.energyCurve.map((val: number, i: number) => {
    const t = (i / energy.energyCurve.length) * duration;
    const h = Math.round(val * barHeight);
    const color = val > 0.7 ? "red" : val > 0.4 ? "yellow" : "green";
    return `drawbox=x=0:y=ih-${h}:w=iw:h=${h}:color=${color}@0.5:enable='between(t,${t},${t + duration / energy.energyCurve.length})'`;
  }).join(",");

  return segments;
}

// ═══════════════════════════════════════════════════════════
// EDITED VIDEO
// ═══════════════════════════════════════════════════════════

async function generateEdit(
  inputPath: string,
  outputPath: string,
  scenes: any,
  energy: any,
  cv: any,
  refEnergy: any,
) {
  const TARGET_DURATION = 14;
  const sceneTimes = [0, ...scenes.scenes.map((s: any) => s.timestamp), 72.83];

  // Pick best segments between cuts
  const candidates: Array<{
    start: number;
    end: number;
    quality: number;
    motion: number;
  }> = [];

  for (let i = 0; i < sceneTimes.length - 1; i++) {
    const start = sceneTimes[i];
    const end = sceneTimes[i + 1];
    const dur = end - start;
    if (dur < 0.3) continue;

    const cvSeg = cv.segments.find((s: any) =>
      s.startTime >= start - 0.1 && s.endTime <= end + 0.1
    );

    candidates.push({
      start,
      end,
      quality: cvSeg?.overallQuality || 0.5,
      motion: cvSeg?.motionScore || 0.5,
    });
  }

  // Sort by quality, take best to fill target duration
  candidates.sort((a, b) => b.quality - a.quality);

  const selected: typeof candidates = [];
  let totalDur = 0;
  for (const c of candidates) {
    if (totalDur >= TARGET_DURATION) break;
    const dur = Math.min(c.end - c.start, 2.0);
    selected.push({ ...c, end: c.start + dur });
    totalDur += dur;
  }

  // Reorder by time
  selected.sort((a, b) => a.start - b.start);

  console.log(`Selected ${selected.length} shots, total ${totalDur.toFixed(1)}s`);

  // Simple approach: extract each segment, then concat
  const tmpDir = "/tmp/jalebi-edit-segments";
  await fs.mkdir(tmpDir, { recursive: true });

  const segmentFiles: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const s = selected[i];
    const segPath = path.join(tmpDir, `seg_${i}.mp4`);

    // Extract segment with re-encode to ensure consistent format
    await execFileAsync("ffmpeg", [
      "-ss", String(s.start),
      "-i", inputPath,
      "-t", String(s.end - s.start),
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

  // Create concat list
  const concatList = path.join(tmpDir, "concat.txt");
  const listContent = segmentFiles.map(f => `file '${f}'`).join("\n");
  await fs.writeFile(concatList, listContent);

  // Concat all segments
  await execFileAsync("ffmpeg", [
    "-f", "concat",
    "-safe", "0",
    "-i", concatList,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y", outputPath,
  ], { timeout: 60000 });

  // Cleanup temp files
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

main().catch(console.error);
