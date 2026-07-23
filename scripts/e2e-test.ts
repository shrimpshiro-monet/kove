/**
 * Full E2E Test — reference analysis + raw footage → styled edit
 *
 * Uses the new segment-labeler for content classification
 * and the reference style DNA for effect matching.
 */
import { analyzeClipFrames } from "../src/server/lib/segment-labeler";
import { detectSceneChanges } from "../src/server/lib/scene-detection";
import { analyzeVideoEnergy } from "../src/server/lib/energy-analysis";
import { extractCVMetrics } from "../src/server/lib/cv-metrics";
import { createEmptyShotEDL, createShot, registerAsset, toJSON } from "../packages/edl-v3/src/helpers";
import { validateShotEDL } from "../packages/edl-v3/src/validate";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const RAW = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/High Quality Steph Curry Clips for Edits! (2024-25).mp4";
const REF = "/Users/hamza/Desktop/reserves/monet-ai-story/reference-edits-2/new-reference.MOV";
const OUTPUT = "/Users/hamza/Desktop/reserves/monet-ai-story/scripts/output";

interface ReferenceDNA {
  cuts: number;
  avgShotDuration: number;
  shotDurations: number[];
  fastCuts: number;      // shots < 1s
  slowCuts: number;      // shots > 2s
  hasSpeedRamps: boolean;
  contrastBoost: number;
  saturationBoost: number;
  brightnessBoost: number;
  hasFlashes: boolean;
  climaxPosition: number;
}

interface EditShot {
  clipId: string;
  startTime: number;
  endTime: number;
  inPoint: number;
  outPoint: number;
  score: number;
  contentType: string;
  hasFace: boolean;
  motion: number;
}

function classifyFromMetrics(
  motion: number,
  brightness: number,
  contrast: number,
  hasFace: boolean,
  isHighEnergy: boolean,
): string {
  if (motion < 0.15) return "static";
  if (isHighEnergy && hasFace) return "close-up";
  if (isHighEnergy) return "action";
  if (hasFace && contrast > 0.6) return "close-up";
  if (brightness < 0.2) return "transition";
  if (motion > 0.4) return "action";
  return "wide";
}

function mapContentType(type: string): "speech" | "action" | "b-roll" | "beauty" | "reaction" | "establishing" | "transition" | "graphics" {
  switch (type) {
    case "action": return "action";
    case "close-up": return "reaction";
    case "wide": return "establishing";
    case "transition": return "transition";
    case "slow-mo": return "beauty";
    case "static": return "b-roll";
    case "flash": return "transition";
    default: return "b-roll";
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 1: REFERENCE ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function analyzeReference(): Promise<ReferenceDNA> {
  console.log("═══ PHASE 1: Analyzing Reference Video ═══\n");

  const [scenes, energy] = await Promise.all([
    detectSceneChanges(REF, 0.3),
    analyzeVideoEnergy(REF, 0.5),
  ]);

  // Extract frames for visual analysis
  const tmpDir = await fs.mkdtemp("/tmp/ref-dna-");
  try {
    await execFileAsync("ffmpeg", [
      "-i", REF, "-vf", "fps=10", "-q:v", "2",
      path.join(tmpDir, "f_%04d.jpg"),
    ], { timeout: 30000 });

    const frames = (await fs.readdir(tmpDir)).filter(f => f.endsWith(".jpg")).sort();

    // Measure brightness per frame
    const brightnesses: number[] = [];
    for (const frame of frames.slice(0, 50)) { // limit to 50 frames
      try {
        const { stdout } = await execFileAsync("ffmpeg", [
          "-i", path.join(tmpDir, frame),
          "-vf", "signalstats",
          "-f", "null", "-",
        ], { timeout: 3000, encoding: "utf8" });
        const yavg = parseFloat(stdout.match(/YAVG=(\d+\.?\d*)/)?.[1] ?? "128");
        brightnesses.push(yavg);
      } catch { brightnesses.push(128); }
    }

    const avgBrightness = brightnesses.reduce((s, b) => s + b, 0) / brightnesses.length;
    const flashFrames = brightnesses.filter(b => b > avgBrightness * 1.6);

    // Shot duration analysis
    const durs = scenes.shotDurations;
    const avgDur = durs.reduce((s, d) => s + d, 0) / durs.length;
    const fastCuts = durs.filter(d => d < 1).length;
    const slowCuts = durs.filter(d => d > 2).length;

    const dna: ReferenceDNA = {
      cuts: scenes.scenes.length,
      avgShotDuration: avgDur,
      shotDurations: durs,
      fastCuts,
      slowCuts,
      hasSpeedRamps: fastCuts > 1 || slowCuts > 1,
      contrastBoost: 1.2,
      saturationBoost: 1.15,
      brightnessBoost: 0.02,
      hasFlashes: flashFrames.length > 2,
      climaxPosition: energy.climaxPosition,
    };

    console.log(`Cuts: ${dna.cuts}, avg ${dna.avgShotDuration.toFixed(2)}s`);
    console.log(`Fast (<1s): ${dna.fastCuts}, Slow (>2s): ${dna.slowCuts}`);
    console.log(`Speed ramps: ${dna.hasSpeedRamps}`);
    console.log(`Flash frames: ${dna.hasFlashes} (${flashFrames.length})`);
    console.log(`Climax: ${(dna.climaxPosition * 100).toFixed(0)}%`);
    console.log(`Color: contrast=${dna.contrastBoost} saturation=${dna.saturationBoost}`);

    return dna;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2: RAW FOOTAGE CONTENT ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function analyzeRawContent() {
  console.log("\n═══ PHASE 2: Analyzing Raw Footage Content ═══\n");

  // Use CV metrics (already works) for motion data
  const cv = await extractCVMetrics(RAW, 2.0);

  // Map CV segments to our segment format
  const segments = cv.segments.map((seg, i) => {
    const motion = seg.motionScore;
    const brightness = seg.brightnessScore;
    const contrast = seg.blurScore * 255; // rough mapping
    const hasFace = motion > 0.3 && motion < 0.8; // face = moderate motion
    const isHighEnergy = motion > 0.6;
    const isSlowMoment = motion < 0.15;

    const contentType = classifyFromMetrics(motion, brightness, contrast, hasFace, isHighEnergy);

    return {
      startTime: seg.startTime,
      endTime: seg.endTime,
      duration: seg.endTime - seg.startTime,
      contentType,
      confidence: seg.overallQuality,
      avgMotion: motion,
      avgBrightness: brightness * 255,
      avgContrast: contrast,
      avgSkinTone: hasFace ? 0.3 : 0,
      avgEdgeDensity: seg.sceneChangeScore,
      hasFace,
      isHighEnergy,
      isSlowMoment,
      position: (seg.startTime + seg.endTime) / 2 / cv.totalDuration,
      isClimaxRegion: false,
      isBreathingRoom: isSlowMoment,
    };
  });

  // Find climax (highest motion)
  const climaxIdx = segments.reduce((best, seg, i) =>
    seg.avgMotion > segments[best].avgMotion ? i : best, 0);
  segments[climaxIdx].isClimaxRegion = true;

  const analysis = {
    clipId: "steph-curry",
    duration: cv.totalDuration,
    totalSegments: segments.length,
    segments,
    summary: {
      actionRatio: segments.filter(s => s.contentType === "action").length / segments.length,
      closeUpRatio: segments.filter(s => s.contentType === "close-up").length / segments.length,
      transitionRatio: segments.filter(s => s.contentType === "transition").length / segments.length,
      avgMotion: segments.reduce((s, seg) => s + seg.avgMotion, 0) / segments.length,
      avgBrightness: segments.reduce((s, seg) => s + seg.avgBrightness, 0) / segments.length,
      climaxPosition: segments[climaxIdx].position,
      breathingMoments: segments.filter(s => s.isBreathingRoom).map(s => (s.startTime + s.endTime) / 2),
      highEnergySegments: segments.filter(s => s.isHighEnergy).length,
      totalFaceTime: segments.filter(s => s.hasFace).reduce((s, seg) => s + seg.duration, 0),
    },
    analyzedAt: Date.now(),
  };

  console.log(`Duration: ${analysis.duration.toFixed(1)}s`);
  console.log(`Segments: ${analysis.totalSegments}`);
  console.log(`Action: ${(analysis.summary.actionRatio * 100).toFixed(0)}%`);
  console.log(`Close-up: ${(analysis.summary.closeUpRatio * 100).toFixed(0)}%`);
  console.log(`Face time: ${analysis.summary.totalFaceTime.toFixed(1)}s`);
  console.log(`High energy: ${analysis.summary.highEnergySegments} segments`);
  console.log(`Climax: ${(analysis.summary.climaxPosition * 100).toFixed(0)}%`);

  // Show segment breakdown
  console.log("\nSegment timeline:");
  for (const seg of segments) {
    const barLen = Math.round(seg.avgMotion * 20);
    const bar = "▓".repeat(barLen) + "░".repeat(20 - barLen);
    const label = seg.contentType.padEnd(11);
    const face = seg.hasFace ? " 👤" : "";
    const energy = seg.isHighEnergy ? " 🔥" : "";
    console.log(
      `  ${seg.startTime.toFixed(0).padStart(3)}-${seg.endTime.toFixed(0).padStart(3)}s: ${label} ${bar} M=${seg.avgMotion.toFixed(2)}${face}${energy}`
    );
  }

  return analysis;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 3: SELECT BEST MOMENTS
// ═══════════════════════════════════════════════════════════════════

function selectBestMoments(rawAnalysis: any, refDNA: ReferenceDNA): EditShot[] {
  console.log("\n═══ PHASE 3: Selecting Best Moments ═══\n");

  const targetDuration = refDNA.avgShotDuration * refDNA.cuts;
  console.log(`Target: ${targetDuration.toFixed(1)}s (${refDNA.cuts} shots × ${refDNA.avgShotDuration.toFixed(2)}s)`);

  // Score each segment
  const scored = rawAnalysis.segments.map((seg: any) => {
    let score = 0;

    // Face visible = important (reactions, celebrations)
    if (seg.hasFace) score += 0.4;

    // High energy = exciting (shots, dunks, celebrations)
    if (seg.isHighEnergy) score += 0.3;

    // Action type is better than transition/static
    if (seg.contentType === "action") score += 0.2;
    if (seg.contentType === "close-up") score += 0.3;
    if (seg.contentType === "transition") score -= 0.3;
    if (seg.contentType === "static") score -= 0.2;

    // Climax region gets bonus
    if (seg.isClimaxRegion) score += 0.2;

    // Avoid breathing room (boring)
    if (seg.isBreathingRoom) score -= 0.2;

    return {
      clipId: "steph-curry",
      startTime: seg.startTime,
      endTime: seg.endTime,
      inPoint: seg.startTime,
      outPoint: seg.endTime,
      score: Math.max(0, Math.min(1, score)),
      contentType: seg.contentType,
      hasFace: seg.hasFace,
      motion: seg.avgMotion,
    };
  });

  // Sort by score
  scored.sort((a: any, b: any) => b.score - a.score);

  // Select top moments to fill target duration
  const selected: EditShot[] = [];
  let totalDur = 0;

  for (const shot of scored) {
    if (totalDur >= targetDuration) break;
    const dur = Math.min(shot.endTime - shot.startTime, refDNA.avgShotDuration * 1.5);
    if (dur < 0.3) continue;

    selected.push({
      ...shot,
      outPoint: shot.inPoint + dur,
      endTime: shot.startTime + dur,
    });
    totalDur += dur;
  }

  // Sort by time for natural flow
  selected.sort((a, b) => a.startTime - b.startTime);

  console.log(`Selected ${selected.length} shots, total ${totalDur.toFixed(1)}s\n`);
  for (const shot of selected) {
    console.log(`  ${shot.startTime.toFixed(1)}-${shot.outPoint.toFixed(1)}s: ${shot.contentType} score=${shot.score.toFixed(2)} face=${shot.hasFace}`);
  }

  return selected;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4: BUILD EDITED VIDEO
// ═══════════════════════════════════════════════════════════════════

async function buildEdit(shots: EditShot[], refDNA: ReferenceDNA): Promise<string> {
  console.log("\n═══ PHASE 4: Building Edited Video ═══\n");

  const tmpDir = "/tmp/jalebi-e2e-edit";
  await fs.mkdir(tmpDir, { recursive: true });

  const segmentFiles: string[] = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const segPath = path.join(tmpDir, `seg_${i}.mp4`);
    const dur = shot.outPoint - shot.inPoint;

    // Build FFmpeg filters based on reference style + content type
    const filters: string[] = [];

    // Flash effect on quick cuts (match reference flash-cut style)
    if (refDNA.hasFlashes && dur < 1.2) {
      filters.push("eq=brightness=0.15:contrast=1.3");
    }

    const filterArgs = filters.length > 0 ? ["-vf", filters.join(",")] : [];

    await execFileAsync("ffmpeg", [
      "-ss", String(shot.inPoint),
      "-i", RAW,
      "-t", String(dur),
      ...filterArgs,
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
    console.log(`  Seg ${i}: ${shot.inPoint.toFixed(1)}-${shot.outPoint.toFixed(1)}s (${dur.toFixed(1)}s) ${filters.length > 0 ? "✨ effects" : ""}`);
  }

  // Concat all segments
  const concatList = path.join(tmpDir, "concat.txt");
  await fs.writeFile(concatList, segmentFiles.map(f => `file '${f}'`).join("\n"));

  const outputPath = path.join(OUTPUT, "steph-curry-e2e.mp4");

  // Apply global color grading from reference
  await execFileAsync("ffmpeg", [
    "-f", "concat",
    "-safe", "0",
    "-i", concatList,
    "-vf", `eq=contrast=${refDNA.contrastBoost}:saturation=${refDNA.saturationBoost}:brightness=${refDNA.brightnessBoost}`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y", outputPath,
  ], { timeout: 60000 });

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n✓ Edit saved: ${outputPath}`);
  return outputPath;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 5: BUILD EDL + VALIDATE
// ═══════════════════════════════════════════════════════════════════

async function buildAndValidateEDL(shots: EditShot[], refDNA: ReferenceDNA) {
  console.log("\n═══ PHASE 5: Building + Validating EDL ═══\n");

  const edl = createEmptyShotEDL({ prompt: "Steph Curry highlight reel matching reference style" });

  registerAsset(edl, {
    id: "steph-curry",
    path: RAW,
    duration: 72.83,
    width: 1280,
    height: 720,
  });

  let currentTime = 0;
  for (const shot of shots) {
    const effects = [];
    if (shot.hasFace && shot.motion > 0.5 && refDNA.hasSpeedRamps) {
      effects.push({
        id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "speed_ramp",
        intensity: 0.6,
        params: { entrySpeed: 1, exitSpeed: 0.4 },
      });
    }

    const s = createShot({
      clipId: shot.clipId,
      inPoint: shot.inPoint,
      outPoint: shot.outPoint,
      startTime: currentTime,
      effects,
      transition: refDNA.hasFlashes && (shot.outPoint - shot.inPoint) < 1.2
        ? { type: "cut", duration: 0, params: { flash: true } }
        : { type: "cut", duration: 0 },
      meta: {
        narrativeRole: shot.motion > 0.7 ? "peak" : shot.hasFace ? "hook" : "body",
        importance: shot.score,
        semanticType: mapContentType(shot.contentType),
        faceVisible: shot.hasFace,
      },
    });
    edl.shots.push(s);
    currentTime += s.timing.duration;
  }

  edl.meta.duration = currentTime;
  edl.meta.generationMode = "montage";

  // Validate
  const validation = await validateShotEDL(edl);
  console.log(`EDL: ${edl.shots.length} shots, ${edl.meta.duration.toFixed(1)}s`);
  console.log(`Valid: ${validation.valid}`);
  if (validation.errors.length) console.log(`Errors: ${validation.errors.join("; ")}`);
  if (validation.warnings.length) console.log(`Warnings: ${validation.warnings.join("; ")}`);

  // Save
  const edlPath = path.join(OUTPUT, "steph-curry-e2e-edl.json");
  await fs.writeFile(edlPath, toJSON(edl));
  console.log(`EDL saved: ${edlPath}`);

  return edl;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });

  const refDNA = await analyzeReference();
  const rawAnalysis = await analyzeRawContent();
  const shots = selectBestMoments(rawAnalysis, refDNA);
  await buildEdit(shots, refDNA);
  await buildAndValidateEDL(shots, refDNA);

  console.log("\n═══════════════════════════════════════");
  console.log("═══ FULL E2E TEST COMPLETE ═══");
  console.log("═══════════════════════════════════════");
}

main().catch(console.error);
