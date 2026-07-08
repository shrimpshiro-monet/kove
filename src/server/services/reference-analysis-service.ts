/**
 * Reference analysis service.
 * Handles scene detection, energy analysis, LLM visual analysis, and style construction.
 * Used by analyze-reference.ts.
 */

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { detectSceneChangesFromBuffer, type SceneDetectionResult } from "../lib/scene-detection";
import { analyzeVideoEnergy, type FrameEnergy } from "../lib/energy-analysis";
import { extractEffectVocabulary, type FrameData, type ReferenceEditTrace } from "../lib/reference-effect-extractor";
import { extractColorGrades } from "../lib/reference-color-extractor";
import { extractVelocityRamps } from "../lib/reference-velocity-extractor";
import { detectFlashFrames } from "../lib/flash-frame-detector";
import { extractTextOverlays, type DetectedTextOverlay } from "../lib/text-overlay-extractor";
import { runPythonVelocityAnalysis, type StructuralMotionResult } from "../lib/python-velocity-bridge";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

function normalizeDominantPalette(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((c): c is string =>
    typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)
  );
}

async function extractOpenCVColorProfile(videoPath: string): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync("python3", [
      "workers/python-ai/color_transfer.py",
      videoPath,
    ], { timeout: 30_000 });
    return JSON.parse(stdout);
  } catch {
    return { avgSaturation: 0.5, avgBrightness: 0.5, avgContrast: 0.5, avgTemperature: 0, saturationRange: [0, 1], brightnessRange: [0, 1] };
  }
}

async function detectTextOverlays(videoPath: string, fps: number): Promise<DetectedTextOverlay[]> {
  try {
    const { stdout } = await execFileAsync("python3", [
      "workers/python-ai/text_detector.py",
      videoPath,
    ], { timeout: 60_000 });
    const detections = JSON.parse(stdout);
    return extractTextOverlays(detections, fps);
  } catch {
    return [];
  }
}

const REFERENCE_SYSTEM =
  "You analyze a reference video to extract editing STYLE for stylistic mimicry. " +
  "Return ONLY valid JSON matching the ReferenceStyle schema. " +
  "Focus on: color palette, grading style, pacing, detected effects, mood. " +
  "Set confidence based on how well you can determine style from the frames.";

const REF_STYLE_SCHEMA = {
  type: "object",
  properties: {
    referenceId: { type: "string" },
    duration: { type: "number" },
    cutFrequency: { type: "number" },
    avgShotDurationSeconds: { type: "number" },
    cutDurationsVariance: { type: "number" },
    dominantPalette: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    gradingStyle: {
      type: "string",
      enum: ["flat", "cinematic", "high-contrast", "desaturated", "vibrant", "teal-orange", "monochrome", "other"],
    },
    motionEnergyProfile: { type: "array", items: { type: "number" }, minItems: 1 },
    detectedEffects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["zoom", "shake", "glow", "glitch", "slow-motion", "speed-ramp", "transition", "overlay", "other"] },
          intensity: { type: "number" },
          timestampRange: { type: "array", items: { type: "number" } },
        },
      },
    },
    pacing: { type: "string", enum: ["slow", "medium", "fast", "frantic"] },
    styleDescription: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["referenceId", "duration", "cutFrequency", "avgShotDurationSeconds", "pacing", "styleDescription"],
};

export interface ReferenceAnalysisResult {
  style: any;
  totalDuration: number;
}

/**
 * Analyze a reference video: extract deterministic features via FFmpeg,
 * run LLM visual analysis, and build the complete style object.
 */
export async function analyzeReference(
  env: Env,
  referenceFileId: string,
  buffer: ArrayBuffer,
  mimeType: string
): Promise<ReferenceAnalysisResult> {
  const ai = getAIService(env);

  let frames: Uint8Array[] = [];
  let motionEnergy: number[] = [];
  let energyFrames: FrameEnergy[] = [];
  let sceneResult: SceneDetectionResult | null = null;
  let cutFrequency = { cutsPerSecond: 0, avgShotDuration: 0, variance: 0 };
  let totalDuration = 0;
  let opencvColorProfile: Record<string, unknown> = {};
  let structuralAnalysis: ReturnType<typeof buildMotionProfile1s> | null = null;
  let detectedTextOverlays: DetectedTextOverlay[] = [];
  let pythonData: StructuralMotionResult | null = null;

  // Scene detection
  try {
    const detected = await detectSceneChangesFromBuffer(buffer, mimeType);
    sceneResult = detected;
    cutFrequency = {
      cutsPerSecond: detected.cutFrequency,
      avgShotDuration: detected.avgShotDuration,
      variance: detected.shotDurations.length > 1
        ? detected.shotDurations.reduce((s, d) => s + Math.pow(d - detected.avgShotDuration, 2), 0) / detected.shotDurations.length
        : 0,
    };
    totalDuration = detected.totalDuration;
    console.log(`[reference-analysis] Scene detection: ${detected.scenes.length} cuts, avg ${detected.avgShotDuration.toFixed(2)}s/shot, ${detected.totalDuration.toFixed(1)}s total`);
  } catch (e) {
    console.warn(`[reference-analysis] Scene detection failed: ${(e as Error).message}`);
  }

  // Energy analysis + frame extraction (needs temp file)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-analysis-"));
  const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
  const tmpPath = path.join(tmpDir, `input${ext}`);

  try {
    await fs.writeFile(tmpPath, Buffer.from(buffer));

    if (totalDuration <= 0) {
      const { stdout: durStr } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        tmpPath,
      ], { timeout: 30_000 });
      totalDuration = parseFloat(durStr.trim()) || 0;
    }

    // Run Python deep analysis for real motion data
    try {
      pythonData = await runPythonVelocityAnalysis(tmpPath);
      console.log(`[reference-analysis] Python velocity: ${pythonData.motionSampleCount} samples, ${pythonData.nonzeroMotionSampleCount} nonzero, source=${pythonData.motionSource}`);
    } catch (e) {
      console.warn(`[reference-analysis] Python velocity failed: ${(e as Error).message}`);
    }

    try {
      const energyResult = await analyzeVideoEnergy(tmpPath);
      motionEnergy = energyResult.energyCurve;
      energyFrames = energyResult.frames;
      console.log(`[reference-analysis] Energy analysis: avgMotion=${energyResult.avgMotion.toFixed(3)}, climax=${energyResult.climaxPosition.toFixed(2)}, frames=${energyResult.frames.length}`);
    } catch (e) {
      console.warn(`[reference-analysis] Energy analysis failed: ${(e as Error).message}`);
    }

    if (pythonData && pythonData.motionSampleCount > 0) {
      structuralAnalysis = {
        motionEnergyProfile1s: pythonData.motionEnergyProfile1s,
        shotMotionProfile: pythonData.shotMotionProfile,
        earlyEnergy: pythonData.earlyEnergy,
        lateEnergy: pythonData.lateEnergy,
        energyVarianceRatio: pythonData.energyVarianceRatio,
        peakMotionTimestamp: pythonData.peakMotionTimestamp,
        motionSource: pythonData.motionSource,
        motionSampleCount: pythonData.motionSampleCount,
        nonzeroMotionSampleCount: pythonData.nonzeroMotionSampleCount,
      };
    } else if (energyFrames.length > 0 && totalDuration > 0) {
      structuralAnalysis = buildMotionProfile1s(energyFrames, totalDuration, sceneResult);
    }

    try {
      frames = await extractFramesFromBuffer(buffer, mimeType, 24);
      console.log(`[reference-analysis] Extracted ${frames.length} frames for LLM vision`);
    } catch (e) {
      console.warn(`[reference-analysis] Frame extraction for LLM failed: ${(e as Error).message}`);
    }

    try {
      opencvColorProfile = await extractOpenCVColorProfile(tmpPath);
      console.log(`[reference-analysis] OpenCV color profile: ${JSON.stringify(opencvColorProfile)}`);
    } catch (e) {
      console.warn(`[reference-analysis] OpenCV color profile failed: ${(e as Error).message}`);
    }

    try {
      const textOverlays = await detectTextOverlays(tmpPath, 30);
      if (textOverlays.length > 0) {
        console.log(`[reference-analysis] Text overlays detected: ${textOverlays.length}`);
      }
      detectedTextOverlays = textOverlays;
    } catch (e) {
      console.warn(`[reference-analysis] Text detection failed: ${(e as Error).message}`);
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // LLM visual analysis
  let llmStyle: any = null;
  try {
    const result = await ai.run("analyze-reference", {
      systemPrompt: REFERENCE_SYSTEM,
      prompt:
        `Reference video file: ${referenceFileId}\n` +
        `Duration: ${totalDuration.toFixed(1)}s\n` +
        `Detected cut frequency: ${cutFrequency.cutsPerSecond.toFixed(2)} cuts/sec\n` +
        `Avg shot duration: ${cutFrequency.avgShotDuration.toFixed(2)}s\n` +
        `Cut duration variance: ${cutFrequency.variance.toFixed(4)}\n` +
        `Motion energy profile: [${motionEnergy.map(v => v.toFixed(2)).join(", ")}]\n\n` +
        `Analyze the visual style from the frames above. Describe palette, grading, pacing, effects you observe.`,
      images: frames.slice(0, 4),
      schema: undefined,
      schemaJSON: REF_STYLE_SCHEMA as Record<string, unknown>,
      maxTokens: 3072,
    });

    if (result.schemaValid) {
      llmStyle = result.data;
      console.log("[reference-analysis] LLM vision analysis succeeded");
    } else {
      console.warn("[reference-analysis] LLM returned invalid schema, using deterministic fallback");
    }
  } catch (e) {
    console.warn(`[reference-analysis] LLM call failed: ${(e as Error).message} — using deterministic data only`);
  }

  // Build style from deterministic FFmpeg data
  const style = buildReferenceStyle(
    referenceFileId,
    totalDuration,
    cutFrequency,
    motionEnergy,
    llmStyle,
    sceneResult?.shotDurations
  );

  style.colorProfile = opencvColorProfile;
  if (detectedTextOverlays.length > 0) {
    style.textOverlays = detectedTextOverlays;
  }

  // Use Python palette if available (overrides LLM palette)
  if (pythonData && pythonData.dominantPalette.length > 0) {
    style.dominantPalette = normalizeDominantPalette(pythonData.dominantPalette);
  }

  if (structuralAnalysis) {
    style.structuralAnalysis = structuralAnalysis;
  }

  if (structuralAnalysis && totalDuration > 0) {
    const rhythmStruct = style.rhythm?.structure;
    const climax = detectClimax(structuralAnalysis, rhythmStruct ?? null, totalDuration);
    if (climax) {
      style.climax = climax;
    }
  }

  // Per-shot effect extraction from frame data
  if (energyFrames.length > 0 && totalDuration > 0) {
    const frameData = buildFrameDataFromEnergy(energyFrames, totalDuration);
    const trace = buildTraceFromScenes(sceneResult, totalDuration);
    const beatTimestamps = llmStyle?.detectedEffects
      ?.filter((e: any) => e.type === "transition")
      .flatMap((e: any) => e.timestampRange ?? []) ?? [];

    try {
      style.effectVocabulary = extractEffectVocabulary(trace, frameData);
      console.log(`[reference-analysis] Effect vocabulary: ${style.effectVocabulary.length} shots analyzed`);
    } catch (e) {
      console.warn(`[reference-analysis] Effect extraction failed: ${(e as Error).message}`);
    }

    try {
      style.colorGrades = extractColorGrades(frameData);
      console.log(`[reference-analysis] Color grades: ${style.colorGrades.length} keyframes`);
    } catch (e) {
      console.warn(`[reference-analysis] Color extraction failed: ${(e as Error).message}`);
    }

    try {
      style.velocityRamps = extractVelocityRamps(trace, frameData, beatTimestamps);
      console.log(`[reference-analysis] Velocity ramps: ${style.velocityRamps.length} detected`);
    } catch (e) {
      console.warn(`[reference-analysis] Velocity extraction failed: ${(e as Error).message}`);
    }

    try {
      style.flashFrames = detectFlashFrames(frameData, trace.shots);
      console.log(`[reference-analysis] Flash frames: ${style.flashFrames.length} detected`);
    } catch (e) {
      console.warn(`[reference-analysis] Flash frame detection failed: ${(e as Error).message}`);
    }
  }

  return { style, totalDuration };
}

function buildRhythmStructure(
  shotDurations: number[],
  totalDuration: number
): {
  firstHalfAvgShotDuration: number;
  secondHalfAvgShotDuration: number;
  firstHalfCutsPerSecond: number;
  secondHalfCutsPerSecond: number;
  shortestShotDuration: number;
  longestShotDuration: number;
  shotDurationVariance: number;
  accelerationRatio: number;
} | null {
  if (shotDurations.length < 2) return null;

  const midpoint = totalDuration / 2;
  let accumulated = 0;
  const firstHalfDurations: number[] = [];
  const secondHalfDurations: number[] = [];

  for (const dur of shotDurations) {
    if (accumulated + dur <= midpoint) {
      firstHalfDurations.push(dur);
    } else if (accumulated >= midpoint) {
      secondHalfDurations.push(dur);
    } else {
      const firstPart = midpoint - accumulated;
      const secondPart = dur - firstPart;
      if (firstPart > 0.01) firstHalfDurations.push(firstPart);
      if (secondPart > 0.01) secondHalfDurations.push(secondPart);
    }
    accumulated += dur;
  }

  const firstHalfAvg = firstHalfDurations.length > 0
    ? firstHalfDurations.reduce((a, b) => a + b, 0) / firstHalfDurations.length
    : totalDuration;
  const secondHalfAvg = secondHalfDurations.length > 0
    ? secondHalfDurations.reduce((a, b) => a + b, 0) / secondHalfDurations.length
    : totalDuration;

  const firstHalfDuration = Math.min(midpoint, totalDuration);
  const secondHalfDuration = Math.max(0, totalDuration - midpoint);

  const firstHalfCutsPerSecond = firstHalfDuration > 0
    ? firstHalfDurations.length / firstHalfDuration
    : 0;
  const secondHalfCutsPerSecond = secondHalfDuration > 0
    ? secondHalfDurations.length / secondHalfDuration
    : 0;

  const allDurations = shotDurations;
  const shortestShotDuration = Math.min(...allDurations);
  const longestShotDuration = Math.max(...allDurations);
  const mean = allDurations.reduce((a, b) => a + b, 0) / allDurations.length;
  const shotDurationVariance = allDurations.reduce((s, d) => s + (d - mean) ** 2, 0) / allDurations.length;
  const accelerationRatio = firstHalfAvg / (secondHalfAvg + 1e-5);

  return {
    firstHalfAvgShotDuration: firstHalfAvg,
    secondHalfAvgShotDuration: secondHalfAvg,
    firstHalfCutsPerSecond,
    secondHalfCutsPerSecond,
    shortestShotDuration,
    longestShotDuration,
    shotDurationVariance,
    accelerationRatio,
  };
}

function buildReferenceStyle(
  referenceId: string,
  duration: number,
  cutFrequency: { cutsPerSecond: number; avgShotDuration: number; variance: number },
  motionEnergy: number[],
  llmStyle: any,
  shotDurations?: number[]
): any {
  const avgMotion = motionEnergy.length > 0
    ? motionEnergy.reduce((a: number, b: number) => a + b, 0) / motionEnergy.length
    : 0.5;
  const isHighEnergy = avgMotion > 0.5 || cutFrequency.cutsPerSecond > 1.5;
  const isFastPaced = cutFrequency.avgShotDuration < 1.0;

  const style: any = {
    referenceId,
    duration,
    cutFrequency: cutFrequency.cutsPerSecond,
    avgShotDurationSeconds: cutFrequency.avgShotDuration,
    cutDurationsVariance: cutFrequency.variance,
    motionEnergyProfile: motionEnergy,
    detectedEffects: llmStyle?.detectedEffects ?? [],
    dominantPalette: normalizeDominantPalette(llmStyle?.dominantPalette),
    gradingStyle: llmStyle?.gradingStyle ?? "other",
    styleDescription: llmStyle?.styleDescription ?? "Analysis based on FFmpeg scene detection and energy analysis",
    confidence: llmStyle?.confidence ?? (cutFrequency.cutsPerSecond > 0 ? 0.6 : 0.2),
  };

  style.rhythm = {
    avgShotDuration: cutFrequency.avgShotDuration,
    cutAlignment: cutFrequency.cutsPerSecond > 2 ? "strict" : cutFrequency.cutsPerSecond > 1 ? "loose" : "none",
    cutsPerSecond: cutFrequency.cutsPerSecond,
  };

  if (shotDurations && shotDurations.length > 0) {
    const structure = buildRhythmStructure(shotDurations, duration);
    if (structure) {
      style.rhythm.structure = structure;
    }
  }
  // Infer structure from rhythm split
  let structureType: "setup_to_montage" | "uniform_montage" | "dialogue_drama" | "unknown" = "unknown";
  let energyArc: "flat" | "build" | "climax_spike" | "decline" = "flat";

  const hasVariance = cutFrequency.variance > 0.3;
  const isFastPaced2 = cutFrequency.avgShotDuration < 1.2;
  const isHighCuts = cutFrequency.cutsPerSecond > 0.8;

  // Pacing inference — never leave undefined
  let inferredPacing: "aggressive" | "fast" | "medium" | "slow" | "varied";
  if (isFastPaced2 || isHighCuts) {
    inferredPacing = cutFrequency.avgShotDuration < 0.5 ? "aggressive" : "fast";
  } else if (cutFrequency.avgShotDuration < 2.0) {
    inferredPacing = "medium";
  } else {
    inferredPacing = "slow";
  }

  style.intentMapping = {
    genre: "other",
    pacing: inferredPacing,
    syncToBeat: cutFrequency.cutsPerSecond > 1,
    beatSyncStrength: Math.min(1, cutFrequency.cutsPerSecond / 3),
    colorTreatment: isHighEnergy ? "vibrant" : "raw",
    effectsIntensity: isHighEnergy ? 0.6 : 0.3,
    transitionStyle: cutFrequency.cutsPerSecond > 2 ? "aggressive" : cutFrequency.cutsPerSecond > 1 ? "dynamic" : "smooth",
    avgShotDuration: cutFrequency.avgShotDuration,
    mood: isHighEnergy ? ["energetic", "intense"] : ["calm", "cinematic"],
    contentFocus: [],
  };

  // Post-hoc enhancement using structural data
  if (style.rhythm?.structure) {
    const s = style.rhythm.structure;
    const highVariance = s.shotDurationVariance > 0.3;
    const highAccel = s.accelerationRatio > 1.3;

    if (highVariance && highAccel) {
      structureType = "setup_to_montage";
      energyArc = "climax_spike";
    } else if (highAccel) {
      structureType = "uniform_montage";
      energyArc = "build";
    } else if (!isFastPaced2 && !isHighCuts) {
      structureType = "dialogue_drama";
      energyArc = "flat";
    }

    style.intentMapping.structure = structureType;
    style.intentMapping.energyArc = energyArc;

    // Override pacing if structural data is stronger
    if (s.secondHalfCutsPerSecond > s.firstHalfCutsPerSecond * 1.5) {
      style.intentMapping.pacing = "varied";
    }
  }
  style.pacing = {
    climaxPosition: motionEnergy.length > 0 ? 0.65 : 0.5,
    energyCurve: motionEnergy.slice(0, 10),
  };
  style.effects = {
    transitionsBreakdown: {
      cutPercentage: cutFrequency.cutsPerSecond > 1 ? 0.8 : 0.5,
      crossfadePercentage: cutFrequency.cutsPerSecond > 1 ? 0.2 : 0.5,
    },
    effectsFrequency: style.detectedEffects?.length > 0 ? 0.5 : (isHighEnergy ? 0.4 : 0.2),
  };
  style.shotLanguage = {
    subjectFocus: isFastPaced ? ["action", "movement"] : ["subject", "environment"],
    cameraMotion: isHighEnergy ? "dynamic" : "static",
    composition: "standard",
  };
  style.editingPhilosophy = {
    summary: isFastPaced
      ? "Fast-paced editing with rapid cuts, emphasizing energy and movement"
      : isHighEnergy
      ? "Dynamic editing with moderate cuts, balancing energy and narrative"
      : "Measured editing with deliberate pacing, emphasizing story and atmosphere",
    cutRhythm: isFastPaced ? "rapid" : "measured",
    effectDensity: isHighEnergy ? "high" : "moderate",
  };
  style.pillarScores = {
    brutalistImpact: isHighEnergy ? 0.7 : 0.3,
    tensionPivot: cutFrequency.variance > 0.5 ? 0.6 : 0.3,
    vocalFlowSync: 0.4,
    legacyMontage: isFastPaced ? 0.6 : 0.3,
  };

  return style;
}

function buildFrameDataFromEnergy(
  energyFrames: FrameEnergy[],
  totalDuration: number
): FrameData[] {
  const frameData: FrameData[] = [];
  const motionValues = energyFrames.map((f) => f.motion);
  const motionMean = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;
  const motionVariance = motionValues.reduce((s, v) => s + (v - motionMean) ** 2, 0) / motionValues.length;
  const motionStddev = Math.sqrt(motionVariance);

  for (let i = 0; i < energyFrames.length; i++) {
    const ef = energyFrames[i];
    const prevMotion = i > 0 ? energyFrames[i - 1].motion : ef.motion;
    const motionDelta = Math.abs(ef.motion - prevMotion);
    const edgeDensity = Math.min(1, motionDelta * 2);

    const brightValues = energyFrames
      .slice(Math.max(0, i - 2), Math.min(energyFrames.length, i + 3))
      .map((f) => f.brightness);
    const brightMean = brightValues.reduce((a, b) => a + b, 0) / brightValues.length;
    const contrast = Math.min(1, Math.abs(ef.brightness - brightMean) * 3);

    const saturation = Math.min(1, ef.brightness * 0.5 + ef.motion * 0.3 + 0.2);
    const sceneChange = ef.motion > motionMean + motionStddev * 1.5 ? 1 : 0;

    frameData.push({
      timestamp: ef.timestamp,
      brightness: ef.brightness,
      contrast,
      motionScore: ef.motion,
      edgeDensity,
      sceneChange,
      saturation,
    });
  }

  return frameData;
}

function buildTraceFromScenes(
  sceneResult: SceneDetectionResult | null,
  totalDuration: number
): ReferenceEditTrace {
  if (sceneResult && sceneResult.shotDurations.length > 0) {
    let accumulated = 0;
    const shots = sceneResult.shotDurations.map((dur) => {
      const start = accumulated;
      accumulated += dur;
      return { startTime: start, duration: dur };
    });
    return { shots };
  }

  const segmentCount = 10;
  const segmentDuration = totalDuration / segmentCount;
  return {
    shots: Array.from({ length: segmentCount }, (_, i) => ({
      startTime: i * segmentDuration,
      duration: segmentDuration,
    })),
  };
}

function buildMotionProfile1s(
  energyFrames: FrameEnergy[],
  totalDuration: number,
  sceneResult: SceneDetectionResult | null
): {
  motionEnergyProfile1s: number[];
  shotMotionProfile: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    meanMotion: number;
    maxMotion: number;
  }>;
  earlyEnergy: number;
  lateEnergy: number;
  energyVarianceRatio: number;
  peakMotionTimestamp?: number;
  motionSource: string;
  motionSampleCount: number;
  nonzeroMotionSampleCount: number;
} {
  const bucketCount = Math.max(1, Math.ceil(totalDuration));
  const motionEnergyProfile1s: number[] = new Array(bucketCount).fill(0);
  const bucketCounts: number[] = new Array(bucketCount).fill(0);

  for (const frame of energyFrames) {
    const bucket = Math.min(bucketCount - 1, Math.floor(frame.timestamp));
    motionEnergyProfile1s[bucket] += frame.motion;
    bucketCounts[bucket]++;
  }

  for (let i = 0; i < bucketCount; i++) {
    if (bucketCounts[i] > 0) {
      motionEnergyProfile1s[i] = motionEnergyProfile1s[i] / bucketCounts[i];
    }
  }

  const shotMotionProfile: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    meanMotion: number;
    maxMotion: number;
  }> = [];

  if (sceneResult && sceneResult.shotDurations.length > 0) {
    let accumulated = 0;
    for (let i = 0; i < sceneResult.shotDurations.length; i++) {
      const dur = sceneResult.shotDurations[i];
      const shotStart = accumulated;
      const shotEnd = accumulated + dur;
      const shotFrames = energyFrames.filter(
        f => f.timestamp >= shotStart && f.timestamp < shotEnd
      );
      const motions = shotFrames.map(f => f.motion);
      shotMotionProfile.push({
        shotIndex: i,
        startTime: shotStart,
        duration: dur,
        meanMotion: motions.length > 0 ? motions.reduce((a, b) => a + b, 0) / motions.length : 0,
        maxMotion: motions.length > 0 ? Math.max(...motions) : 0,
      });
      accumulated += dur;
    }
  }

  const midpoint = totalDuration / 2;
  const earlyFrames = energyFrames.filter(f => f.timestamp < midpoint);
  const lateFrames = energyFrames.filter(f => f.timestamp >= midpoint);
  const earlyEnergy = earlyFrames.length > 0
    ? earlyFrames.reduce((s, f) => s + f.combined, 0) / earlyFrames.length
    : 0;
  const lateEnergy = lateFrames.length > 0
    ? lateFrames.reduce((s, f) => s + f.combined, 0) / lateFrames.length
    : 0;
  const energyVarianceRatio = earlyEnergy > 0 ? lateEnergy / earlyEnergy : 1;

  let peakMotionTimestamp: number | undefined;
  if (energyFrames.length > 0) {
    const peakFrame = energyFrames.reduce((max, f) =>
      f.motion > max.motion ? f : max, energyFrames[0]);
    peakMotionTimestamp = peakFrame.timestamp;
  }

  // Diagnostic: check if motion data is real
  const nonzeroSamples = energyFrames.filter(f => f.motion > 0).length;
  const motionSource = nonzeroSamples > energyFrames.length * 0.1 ? 'energyFrames' : 'missing';

  return {
    motionEnergyProfile1s,
    shotMotionProfile,
    earlyEnergy,
    lateEnergy,
    energyVarianceRatio,
    peakMotionTimestamp,
    motionSource,
    motionSampleCount: energyFrames.length,
    nonzeroMotionSampleCount: nonzeroSamples,
  };
}

function detectClimax(
  structuralAnalysis: {
    earlyEnergy: number;
    lateEnergy: number;
    energyVarianceRatio: number;
    peakMotionTimestamp?: number;
    motionEnergyProfile1s: number[];
    motionSource?: string;
  },
  rhythmStructure: {
    firstHalfCutsPerSecond: number;
    secondHalfCutsPerSecond: number;
    firstHalfAvgShotDuration: number;
    secondHalfAvgShotDuration: number;
    accelerationRatio: number;
  } | null,
  totalDuration: number
): {
  timestamp: number;
  confidence: number;
  reason: string;
  signals: {
    motionJump: number;
    cutAcceleration: number;
    shotDurationDrop: number;
    peakMotion?: number;
  };
} | null {
  const WARMUP_SECONDS = 2.0;

  const motionJump = structuralAnalysis.earlyEnergy > 0
    ? structuralAnalysis.lateEnergy / structuralAnalysis.earlyEnergy
    : 1;
  const cutAcceleration = rhythmStructure
    ? rhythmStructure.secondHalfCutsPerSecond / (rhythmStructure.firstHalfCutsPerSecond + 1e-5)
    : 1;
  const shotDurationDrop = rhythmStructure
    ? rhythmStructure.firstHalfAvgShotDuration / (rhythmStructure.secondHalfAvgShotDuration + 1e-5)
    : 1;

  const motionScore = Math.min(3, motionJump) / 3;
  const cutScore = Math.min(3, cutAcceleration) / 3;
  const durationScore = Math.min(3, shotDurationDrop) / 3;
  const confidence = Math.min(1, (motionScore * 0.35 + cutScore * 0.35 + durationScore * 0.3));

  let timestamp = totalDuration * 0.5;
  let reason = 'estimated from midpoint';

  // Only use peak motion if it's real (non-zero) and past warmup
  const hasRealMotion = structuralAnalysis.motionSource !== 'missing'
    && structuralAnalysis.peakMotionTimestamp !== undefined
    && structuralAnalysis.peakMotionTimestamp > WARMUP_SECONDS;

  if (hasRealMotion) {
    timestamp = structuralAnalysis.peakMotionTimestamp!;
    reason = 'peak motion timestamp';
  } else if (structuralAnalysis.motionEnergyProfile1s.length > 0) {
    const profile = structuralAnalysis.motionEnergyProfile1s;
    const avg = profile.reduce((a, b) => a + b, 0) / profile.length;
    // Search for motion jump AFTER warmup window
    for (let i = Math.ceil(WARMUP_SECONDS); i < profile.length; i++) {
      if (profile[i] > avg * 1.3 && profile[i - 1] < avg) {
        timestamp = i;
        reason = `motion jump at ${i}s`;
        break;
      }
    }
  }

  // Fallback: use rhythm-based detection if no motion data
  if (reason === 'estimated from midpoint' && rhythmStructure) {
    // Find where shot durations drop significantly
    // Use the midpoint as a fallback but note it's rhythm-based
    timestamp = totalDuration * 0.3; // Earlier default for setup_to_montage
    reason = 'rhythm-based estimate (no reliable motion data)';
  }

  // Penalize confidence if climax is at boundary
  let adjustedConfidence = confidence;
  if (timestamp < WARMUP_SECONDS) {
    adjustedConfidence *= 0.3; // Heavy penalty for boundary climax
    reason += ' (low confidence — climax at boundary)';
  }

  if (adjustedConfidence < 0.2) {
    reason += ' (low confidence)';
  }

  return {
    timestamp,
    confidence: adjustedConfidence,
    reason,
    signals: {
      motionJump,
      cutAcceleration,
      shotDurationDrop,
      peakMotion: hasRealMotion ? structuralAnalysis.peakMotionTimestamp : undefined,
    },
  };
}

async function extractFramesFromBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  count: number
): Promise<Uint8Array[]> {
  const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ref-frames-"));
  const tmpPath = path.join(tmpDir, `input${ext}`);
  const framesDir = path.join(tmpDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  try {
    await fs.writeFile(tmpPath, Buffer.from(buffer));

    const { stdout: durationStr } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      tmpPath,
    ], { timeout: 30_000 });

    const duration = parseFloat(durationStr.trim());
    if (isNaN(duration) || duration <= 0) return [];

    const frames: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i / count) * duration;
      const framePath = path.join(framesDir, `frame_${i}.jpg`);
      try {
        await execFileAsync("ffmpeg", [
          "-ss", String(t),
          "-i", tmpPath,
          "-frames:v", "1",
          "-q:v", "2",
          framePath,
        ], { timeout: 15_000 });
        const data = await fs.readFile(framePath);
        frames.push(new Uint8Array(data));
      } catch { /* skip failed frames */ }
    }

    return frames;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
