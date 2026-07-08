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

    try {
      const energyResult = await analyzeVideoEnergy(tmpPath);
      motionEnergy = energyResult.energyCurve;
      energyFrames = energyResult.frames;
      console.log(`[reference-analysis] Energy analysis: avgMotion=${energyResult.avgMotion.toFixed(3)}, climax=${energyResult.climaxPosition.toFixed(2)}, frames=${energyResult.frames.length}`);
    } catch (e) {
      console.warn(`[reference-analysis] Energy analysis failed: ${(e as Error).message}`);
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
      style.textOverlays = textOverlays;
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
    llmStyle
  );

  style.colorProfile = opencvColorProfile;

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

function buildReferenceStyle(
  referenceId: string,
  duration: number,
  cutFrequency: { cutsPerSecond: number; avgShotDuration: number; variance: number },
  motionEnergy: number[],
  llmStyle: any
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
  style.intentMapping = {
    genre: "other",
    pacing: isFastPaced ? "fast" : cutFrequency.avgShotDuration < 2.0 ? "medium" : "slow",
    syncToBeat: cutFrequency.cutsPerSecond > 1,
    beatSyncStrength: Math.min(1, cutFrequency.cutsPerSecond / 3),
    colorTreatment: isHighEnergy ? "vibrant" : "raw",
    effectsIntensity: isHighEnergy ? 0.6 : 0.3,
    transitionStyle: cutFrequency.cutsPerSecond > 2 ? "aggressive" : cutFrequency.cutsPerSecond > 1 ? "dynamic" : "smooth",
    avgShotDuration: cutFrequency.avgShotDuration,
    mood: isHighEnergy ? ["energetic", "intense"] : ["calm", "cinematic"],
    energy: isHighEnergy ? "high" : "medium",
  };
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
