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
import { buildRealTrace } from "../lib/real-trace-builder";
import { detectTransitions, aggregateTransitions } from "../director/transition-detector";
import { classifyCameraMotion } from "../director/camera-motion";
import { analyzeSemanticSequences } from "../director/semantic-sequence";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

async function runRhythm(mediaPath: string) {
  const scriptDir = path.resolve(process.cwd(), "workers/python-ai/workers");
  const venvBeat = path.resolve(process.cwd(), "workers/python-ai/.venv-beat/bin/python3");
  try {
    const { stdout } = await execFileAsync(
      venvBeat,
      [
        "-c",
        `import json,sys;sys.path.insert(0,'${scriptDir}');from beat_engine import analyze_rhythm;print(json.dumps(analyze_rhythm(sys.argv[1])))`,
        mediaPath,
      ],
      { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 },
    );
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error(`[rhythm] analysis failed: ${(err as Error).message}`);
    return {
      bpm: 120, beats: [], downbeats: [], onsets: [],
      drop_candidates: [], source: "error", duration: 0,
      beat_sync_available: false,
    };
  }
}

export async function runPerceptionPro(videoPath: string) {
  const scriptDir = path.resolve(process.cwd(), "workers/python-ai/workers");
  const venvPro = path.resolve(process.cwd(), "workers/python-ai/.venv/bin/python3");
  try {
    const { stdout } = await execFileAsync(
      venvPro,
      [
        "-c",
        `import json,sys;sys.path.insert(0,'${scriptDir}');from perception_pro import run;print(json.dumps(run(sys.argv[1])))`,
        videoPath,
      ],
      { timeout: 180_000, maxBuffer: 80 * 1024 * 1024 },
    );
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error(`[perception-pro] failed: ${(err as Error).message}`);
    return { shots: [], velocity: [], backends: { shots: "error", flow: "error" } };
  }
}

function attachPerceptionToShots(ref: any, proShots: any[]) {
  if (!proShots?.length) return;
  const vocab = ref.effectVocabulary ?? [];
  for (const entry of vocab) {
    const t = entry.startTime ?? entry.time ?? 0;
    const match = proShots.reduce((best: any, s: any) => {
      const d = Math.abs(s.start_time - t);
      return d < best.d ? { d, s } : best;
    }, { d: Infinity, s: null }).s;
    if (match) {
      entry.semantic = match.semantic;
      entry.motionDir = match.motionDir;
      entry.faceCentered = match.faceCentered;
      entry.hasVelocityRamp = match.hasVelocityRamp;
      entry.motion = match.motion;
    }
  }
  ref.perceptionShots = proShots;
}

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
  "You are a master film editor and cinematographer. You analyze a reference video to extract its complete editing DNA — the philosophy, timing, visual decisions, and emotional architecture. " +
  "Think like a film professor dissecting an edit. Think like an editor who has to replicate this style on entirely different footage. " +
  "Return ONLY valid JSON matching the provided schema. " +
  "Focus on: rhythm, pacing, shot language, visual style, effects, transitions, emotional arc, and editing philosophy. " +
  "Be precise — these values drive a real AI video editor.";

const REF_STYLE_SCHEMA = {
  type: "object",
  properties: {
    rhythm: {
      type: "object",
      properties: {
        avgShotDuration: { type: "number" },
        shotDurationVariance: { type: "number" },
        beatsPerCut: { type: "number" },
        cutAlignment: { type: "string", enum: ["strict", "loose", "none"] },
        accentCuts: { type: "array", items: { type: "number" } },
      },
      required: ["avgShotDuration", "shotDurationVariance", "beatsPerCut", "cutAlignment", "accentCuts"],
    },
    pacing: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["aggressive", "fast", "medium", "slow", "varied"] },
        energyCurve: { type: "array", items: { type: "number" }, minItems: 10, maxItems: 10 },
        intensityBuilds: { type: "boolean" },
        climaxPosition: { type: "number" },
        breathingMoments: { type: "array", items: { type: "number" } },
      },
      required: ["type", "energyCurve", "intensityBuilds", "climaxPosition", "breathingMoments"],
    },
    shotLanguage: {
      type: "object",
      properties: {
        closeupRatio: { type: "number" },
        wideRatio: { type: "number" },
        motionPreference: { type: "string", enum: ["static", "moving", "mixed"] },
        subjectFocus: { type: "array", items: { type: "string" } },
        sequencePatterns: { type: "array", items: { type: "string" } },
      },
      required: ["closeupRatio", "wideRatio", "motionPreference", "subjectFocus", "sequencePatterns"],
    },
    visualStyle: {
      type: "object",
      properties: {
        colorGrade: { type: "string", enum: ["cinematic", "vibrant", "vintage", "monochrome", "anime", "raw"] },
        colorTemperature: { type: "string", enum: ["warm", "cool", "neutral"] },
        contrastLevel: { type: "string", enum: ["low", "medium", "high"] },
        saturationLevel: { type: "string", enum: ["desaturated", "natural", "saturated", "hyper-saturated"] },
        vignettePresent: { type: "boolean" },
        grainPresent: { type: "boolean" },
      },
      required: ["colorGrade", "colorTemperature", "contrastLevel", "saturationLevel", "vignettePresent", "grainPresent"],
    },
    effects: {
      type: "object",
      properties: {
        overallIntensity: { type: "number" },
        effectsFrequency: { type: "number" },
        commonEffects: { type: "array", items: { type: "string" } },
        transitionsBreakdown: {
          type: "object",
          properties: {
            cutPercentage: { type: "number" },
            crossfadePercentage: { type: "number" },
            otherPercentage: { type: "number" },
          },
          required: ["cutPercentage", "crossfadePercentage", "otherPercentage"],
        },
      },
      required: ["overallIntensity", "effectsFrequency", "commonEffects", "transitionsBreakdown"],
    },
    emotionalArc: {
      type: "object",
      properties: {
        openingMood: { type: "string" },
        peakMood: { type: "string" },
        closingMood: { type: "string" },
        emotionalContour: { type: "string" },
      },
      required: ["openingMood", "peakMood", "closingMood", "emotionalContour"],
    },
    editingPhilosophy: {
      type: "object",
      properties: {
        summary: { type: "string" },
        rhythmContract: { type: "string" },
        restraintLevel: { type: "string", enum: ["minimal", "moderate", "heavy"] },
        signatureMove: { type: "string" },
      },
      required: ["summary", "rhythmContract", "restraintLevel", "signatureMove"],
    },
    composition: {
      type: "object",
      properties: {
        avgLayerCount: { type: "number" },
        maskingFrequency: { type: "number" },
        depthOrder: { type: "string", enum: ["subject_on_top", "text_behind_subject", "mixed"] },
        commonBlendModes: { type: "array", items: { type: "string" } },
      },
      required: ["avgLayerCount", "maskingFrequency", "depthOrder", "commonBlendModes"],
    },
    textStyle: {
      type: "object",
      properties: {
        pacing: { type: "string", enum: ["snappy", "lingering", "none"] },
        positioning: { type: "string", enum: ["center", "dynamic", "lower_third"] },
        fontVibe: { type: "string" },
        animationStyle: { type: "string" },
      },
      required: ["pacing", "positioning", "fontVibe", "animationStyle"],
    },
    pillarScores: {
      type: "object",
      properties: {
        brutalistImpact: { type: "number" },
        tensionPivot: { type: "number" },
        vocalFlowSync: { type: "number" },
        legacyMontage: { type: "number" },
      },
      required: ["brutalistImpact", "tensionPivot", "vocalFlowSync", "legacyMontage"],
    },
    intentMapping: {
      type: "object",
      properties: {
        genre: { type: "string", enum: ["anime_amv", "sports_highlight", "wedding", "cinematic_trailer", "fan_edit", "music_video", "promo", "vlog", "other"] },
        pacing: { type: "string", enum: ["aggressive", "fast", "medium", "slow", "varied"] },
        syncToBeat: { type: "boolean" },
        beatSyncStrength: { type: "number" },
        colorTreatment: { type: "string" },
        effectsIntensity: { type: "number" },
        transitionStyle: { type: "string", enum: ["cut", "smooth", "dynamic", "aggressive", "mixed"] },
        avgShotDuration: { type: "number" },
        mood: { type: "array", items: { type: "string" } },
        contentFocus: { type: "array", items: { type: "string" } },
      },
      required: ["genre", "pacing", "syncToBeat", "beatSyncStrength", "colorTreatment", "effectsIntensity", "transitionStyle", "avgShotDuration", "mood", "contentFocus"],
    },
    dominantPalette: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    styleDescription: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["rhythm", "pacing", "shotLanguage", "visualStyle", "effects", "emotionalArc", "editingPhilosophy", "composition", "textStyle", "pillarScores", "intentMapping", "styleDescription"],
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

    // Rhythm + perception analysis — run in parallel (before temp dir cleanup)
    var rhythmData: any = null;
    var proData: any = null;
    try {
      [rhythmData, proData] = await Promise.all([
        runRhythm(tmpPath),
        runPerceptionPro(tmpPath),
      ]);
      console.log(`[reference-analysis] Rhythm: bpm=${rhythmData.bpm}, source=${rhythmData.source}, beats=${rhythmData.beats.length}, onsets=${rhythmData.onsets.length}`);
      console.log(`[perception-pro] shots=${proData.shots.length} flow=${proData.backends.flow}`);
    } catch (e) {
      console.warn(`[reference-analysis] Rhythm/perception failed: ${(e as Error).message}`);
    }

    // Build rich reference trace (needs sceneResult and energyFrames)
    var richTrace: any = null;
    if (sceneResult && energyFrames.length > 0 && totalDuration > 0) {
      try {
        const avgBrightness = energyFrames.reduce((a: number, f: any) => a + (f.brightness ?? 0), 0) / energyFrames.length;
        const avgMotionVal = motionEnergy.reduce((a: number, b: number) => a + b, 0) / Math.max(1, motionEnergy.length);
        const energyResult = {
          frames: energyFrames,
          energyCurve: motionEnergy,
          avgBrightness,
          avgMotion: avgMotionVal,
          peakMoment: 0,
          peakIntensity: 0,
          climaxPosition: structuralAnalysis?.peakMotionTimestamp ?? 0.5,
          breathingMoments: [],
          totalDuration,
        };
        richTrace = buildRealTrace(sceneResult, energyResult as any, null, referenceFileId);
        console.log(`[reference-analysis] Rich trace: ${richTrace.events.length} events, ${richTrace.shotDurations.length} shots`);
      } catch (e) {
        console.warn(`[reference-analysis] Rich trace build failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // LLM visual analysis — uses the full analyze-reference prompt
  let llmStyle: any = null;
  try {
    const { loadPromptTemplate } = await import("../prompts");
    const analysisPrompt = loadPromptTemplate("analyze-reference.txt");

    const enrichedPrompt =
      `${analysisPrompt}\n\n` +
      `=== DETERMINISTIC DATA (from FFmpeg analysis) ===\n` +
      `Reference video: ${referenceFileId}\n` +
      `Duration: ${totalDuration.toFixed(1)}s\n` +
      `Detected cut frequency: ${cutFrequency.cutsPerSecond.toFixed(2)} cuts/sec\n` +
      `Avg shot duration: ${cutFrequency.avgShotDuration.toFixed(2)}s\n` +
      `Cut duration variance: ${cutFrequency.variance.toFixed(4)}\n` +
      `Motion energy profile (10 buckets): [${motionEnergy.map(v => v.toFixed(2)).join(", ")}]\n` +
      `Shot count: ${sceneResult?.scenes.length ?? "unknown"}\n` +
      (rhythmData ? `BPM: ${rhythmData.bpm}, beat sync: ${rhythmData.beat_sync_available}\n` : "") +
      `\nUse the deterministic data above to cross-check your visual analysis. ` +
      `Where the visual analysis and deterministic data conflict, trust the deterministic data for timing/rhythm ` +
      `but use your visual analysis for style/aesthetics/effects.\n` +
      `\nReturn ONLY valid JSON matching the schema.`;

    const result = await ai.run("analyze-reference", {
      systemPrompt: REFERENCE_SYSTEM,
      prompt: enrichedPrompt,
      images: frames.slice(0, 8),
      schema: undefined,
      schemaJSON: REF_STYLE_SCHEMA as Record<string, unknown>,
      maxTokens: 8192,
    });

    if (result.schemaValid) {
      llmStyle = result.data;
      console.log("[reference-analysis] LLM vision analysis succeeded with full prompt");
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
    sceneResult?.shotDurations,
    detectedTextOverlays,
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

  // Apply rhythm/perception/trace results (collected before temp dir cleanup)
  if (rhythmData) {
    rhythmData.beat_sync_available = (rhythmData.beats?.length ?? 0) > 0;
    style.rhythmMap = rhythmData;
  }
  if (proData) {
    attachPerceptionToShots(style, proData.shots);
  }
  if (richTrace) {
    (style as any).referenceTrace = richTrace;
  }

  // ─── COMPREHENSIVE REFERENCE REVERSE-ENGINEERING ───
  // Extract transition types, camera motion, and semantic sequences

  // Transition detection from frame differences at cut points
  if (sceneResult && sceneResult.scenes.length > 1 && tmpPath) {
    try {
      const shotBoundaries = sceneResult.scenes.slice(1).map(s => s.timestamp);
      const transitionDetections = await detectTransitions(tmpPath, shotBoundaries);
      const transitionBreakdown = aggregateTransitions(transitionDetections);
      style.effects.transitionsBreakdown = {
        cutPercentage: transitionBreakdown.cutPercentage,
        crossfadePercentage: transitionBreakdown.crossfadePercentage + transitionBreakdown.whipPanPercentage,
        otherPercentage: transitionBreakdown.otherPercentage,
      };
      (style as any).transitionDetections = transitionDetections;
      console.log(`[reference-analysis] Transitions: ${transitionDetections.length} detected, cut=${(transitionBreakdown.cutPercentage * 100).toFixed(0)}%, crossfade=${((transitionBreakdown.crossfadePercentage + transitionBreakdown.whipPanPercentage) * 100).toFixed(0)}%`);
    } catch (e) {
      console.warn(`[reference-analysis] Transition detection failed: ${(e as Error).message}`);
    }
  }

  // Camera motion classification from optical flow
  if (proData?.shots?.length > 0 && proData.velocity?.length > 0) {
    try {
      const cameraMotion = classifyCameraMotion(proData.shots, proData.velocity);
      style.shotLanguage.motionPreference = cameraMotion.overall === "static" ? "static"
        : cameraMotion.overall === "handheld" || cameraMotion.overall === "steadicam" ? "moving"
        : "mixed";
      (style as any).cameraMotion = cameraMotion;
      console.log(`[reference-analysis] Camera motion: ${cameraMotion.overall}, avg=${cameraMotion.avgMagnitude.toFixed(2)}, pan=${(cameraMotion.breakdown.panRatio * 100).toFixed(0)}%`);
    } catch (e) {
      console.warn(`[reference-analysis] Camera motion classification failed: ${(e as Error).message}`);
    }
  }

  // Semantic sequence analysis from CLIP tags
  if (proData?.shots?.length > 0) {
    try {
      const semanticSeq = analyzeSemanticSequences(proData.shots);
      style.editingPhilosophy.rhythmContract = `Narrative: ${semanticSeq.narrativeArc}, subject continuity: ${(semanticSeq.subjectContinuity * 100).toFixed(0)}%`;
      (style as any).semanticSequences = semanticSeq;
      console.log(`[reference-analysis] Semantic sequences: ${semanticSeq.patterns.length} patterns, arc=${semanticSeq.narrativeArc}, continuity=${(semanticSeq.subjectContinuity * 100).toFixed(0)}%`);
    } catch (e) {
      console.warn(`[reference-analysis] Semantic sequence analysis failed: ${(e as Error).message}`);
    }
  }

  // Shot language from perception data
  if (proData?.shots?.length > 0) {
    const shots = proData.shots;
    const closeupShots = shots.filter((s: any) =>
      s.semantic?.some((t: string) => ["close-up face reaction", "product close-up", "emotional facial expression"].includes(t))
    ).length;
    const wideShots = shots.filter((s: any) =>
      s.semantic?.some((t: string) => ["crowd or audience", "outdoor city street", "nature or landscape"].includes(t))
    ).length;
    style.shotLanguage.closeupRatio = closeupShots / shots.length;
    style.shotLanguage.wideRatio = wideShots / shots.length;
    style.shotLanguage.subjectFocus = [...new Set(shots.flatMap((s: any) => s.semantic ?? []))].slice(0, 5);
    console.log(`[reference-analysis] Shot language: closeup=${(style.shotLanguage.closeupRatio * 100).toFixed(0)}%, wide=${(style.shotLanguage.wideRatio * 100).toFixed(0)}%`);
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

    // Extract pacing distribution for humanizer
    if (sceneResult && sceneResult.shotDurations.length > 0) {
      try {
        const { extractPacingDistribution } = await import("../director/humanizer");
        const pacingDist = extractPacingDistribution(sceneResult.shotDurations);
        (style as any).pacingDistribution = pacingDist;
        console.log(`[reference-analysis] Pacing distribution: mean=${pacingDist.mean.toFixed(2)}s, std=${pacingDist.std.toFixed(2)}s, skew=${pacingDist.skew.toFixed(2)}`);
      } catch (e) {
        console.warn(`[reference-analysis] Pacing distribution extraction failed: ${(e as Error).message}`);
      }
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
  shotDurations?: number[],
  textOverlays?: DetectedTextOverlay[],
): any {
  const avgMotion = motionEnergy.length > 0
    ? motionEnergy.reduce((a: number, b: number) => a + b, 0) / motionEnergy.length
    : 0.5;
  const isHighEnergy = avgMotion > 0.5 || cutFrequency.cutsPerSecond > 1.5;
  const isFastPaced = cutFrequency.avgShotDuration < 1.0;

  // Start with LLM's visual analysis (the full schema now)
  // Then overlay deterministic data for timing/rhythm (ground truth)
  const style: any = {
    referenceId,
    duration,
    // LLM fields — pass through directly when available
    rhythm: llmStyle?.rhythm ?? {},
    pacing: llmStyle?.pacing ?? {},
    shotLanguage: llmStyle?.shotLanguage ?? {},
    visualStyle: llmStyle?.visualStyle ?? {},
    effects: llmStyle?.effects ?? {},
    emotionalArc: llmStyle?.emotionalArc ?? {},
    editingPhilosophy: llmStyle?.editingPhilosophy ?? {},
    composition: llmStyle?.composition ?? {},
    textStyle: llmStyle?.textStyle ?? {},
    pillarScores: llmStyle?.pillarScores ?? { brutalistImpact: 0.3, tensionPivot: 0.3, vocalFlowSync: 0.2, legacyMontage: 0.2 },
    intentMapping: llmStyle?.intentMapping ?? {},
    dominantPalette: normalizeDominantPalette(llmStyle?.dominantPalette),
    styleDescription: llmStyle?.styleDescription ?? "Analysis based on FFmpeg scene detection and energy analysis",
    confidence: llmStyle?.confidence ?? (cutFrequency.cutsPerSecond > 0 ? 0.6 : 0.2),
  };

  // Override rhythm with FFmpeg ground truth (more reliable than LLM for timing)
  style.rhythm = {
    ...style.rhythm,
    avgShotDuration: cutFrequency.avgShotDuration,
    shotDurationVariance: cutFrequency.variance,
    beatsPerCut: style.rhythm?.beatsPerCut ?? (cutFrequency.cutsPerSecond > 0 ? 1 : 2),
    cutAlignment: style.rhythm?.cutAlignment ?? (cutFrequency.cutsPerSecond > 2 ? "strict" : cutFrequency.cutsPerSecond > 1 ? "loose" : "none"),
    accentCuts: style.rhythm?.accentCuts ?? [],
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

  // Override intentMapping with deterministic data where LLM is weak
  if (!style.intentMapping.genre || style.intentMapping.genre === "other") {
    style.intentMapping.genre = "other";
  }
  style.intentMapping.pacing = style.intentMapping.pacing ?? (isFastPaced2 ? "fast" : cutFrequency.avgShotDuration < 2.0 ? "medium" : "slow");
  style.intentMapping.syncToBeat = style.intentMapping.syncToBeat ?? (cutFrequency.cutsPerSecond > 1);
  style.intentMapping.beatSyncStrength = style.intentMapping.beatSyncStrength ?? Math.min(1, cutFrequency.cutsPerSecond / 3);
  style.intentMapping.avgShotDuration = cutFrequency.avgShotDuration;
  style.intentMapping.mood = style.intentMapping.mood ?? (isHighEnergy ? ["energetic", "intense"] : ["calm", "cinematic"]);
  style.intentMapping.contentFocus = style.intentMapping.contentFocus ?? [];

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

    if (s.secondHalfCutsPerSecond > s.firstHalfCutsPerSecond * 1.5) {
      style.intentMapping.pacing = "varied";
    }
  }

  // Override pacing with FFmpeg energy curve (ground truth)
  style.pacing = {
    ...style.pacing,
    climaxPosition: style.pacing?.climaxPosition ?? (motionEnergy.length > 0 ? 0.65 : 0.5),
    energyCurve: motionEnergy.slice(0, 10),
    type: style.pacing?.type ?? (isFastPaced2 ? "fast" : "medium"),
    intensityBuilds: style.pacing?.intensityBuilds ?? isHighEnergy,
    breathingMoments: style.pacing?.breathingMoments ?? [],
  };

  // Override effects with deterministic data
  style.effects = {
    ...style.effects,
    transitionsBreakdown: style.effects?.transitionsBreakdown ?? {
      cutPercentage: cutFrequency.cutsPerSecond > 1 ? 0.8 : 0.5,
      crossfadePercentage: cutFrequency.cutsPerSecond > 1 ? 0.2 : 0.5,
      otherPercentage: 0,
    },
    effectsFrequency: style.effects?.effectsFrequency ?? (isHighEnergy ? 0.4 : 0.2),
    commonEffects: style.effects?.commonEffects ?? (isHighEnergy ? ["push_in", "impact_flash", "speed_ramp"] : ["push_in"]),
    overallIntensity: style.effects?.overallIntensity ?? (isHighEnergy ? 0.6 : 0.3),
  };

  // Override shotLanguage with deterministic data
  style.shotLanguage = {
    ...style.shotLanguage,
    subjectFocus: style.shotLanguage?.subjectFocus ?? (isFastPaced ? ["action", "movement"] : ["subject", "environment"]),
    motionPreference: style.shotLanguage?.motionPreference ?? (isHighEnergy ? "moving" : "static"),
    closeupRatio: style.shotLanguage?.closeupRatio ?? 0.3,
    wideRatio: style.shotLanguage?.wideRatio ?? 0.2,
    sequencePatterns: style.shotLanguage?.sequencePatterns ?? [],
  };

  // Override editingPhilosophy if LLM didn't provide meaningful data
  if (!style.editingPhilosophy?.summary || style.editingPhilosophy.summary.length < 10) {
    style.editingPhilosophy = {
      summary: isFastPaced
        ? "Fast-paced editing with rapid cuts, emphasizing energy and movement"
        : isHighEnergy
        ? "Dynamic editing with moderate cuts, balancing energy and narrative"
        : "Measured editing with deliberate pacing, emphasizing story and atmosphere",
      rhythmContract: cutFrequency.cutsPerSecond > 1 ? "beat-locked" : "visual rhythm",
      restraintLevel: isHighEnergy ? "moderate" : "minimal",
      signatureMove: isHighEnergy ? "impact_flash on drops" : "push_in on hero shots",
    };
  }

  // Use LLM's composition if available, otherwise sensible defaults
  style.composition = {
    avgLayerCount: style.composition?.avgLayerCount ?? 1,
    maskingFrequency: style.composition?.maskingFrequency ?? 0,
    depthOrder: style.composition?.depthOrder ?? "subject_on_top",
    commonBlendModes: style.composition?.commonBlendModes ?? ["normal"],
  };

  // Use LLM's textStyle if available
  style.textStyle = {
    pacing: style.textStyle?.pacing ?? ((textOverlays?.length ?? 0) > 0 ? "snappy" : "none"),
    positioning: style.textStyle?.positioning ?? "center",
    fontVibe: style.textStyle?.fontVibe ?? "bold_sans",
    animationStyle: style.textStyle?.animationStyle ?? "pop_in",
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
