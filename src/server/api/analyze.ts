import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { detectSceneChangesFromBuffer } from "../lib/scene-detection";
import { analyzeMusic } from "../services/audio-analysis-service";
import { extractCVMetrics, type SegmentQuality } from "../lib/cv-metrics";
import {
  FootageAnalysisSchema,
  FOOTAGE_ANALYSIS_JSON_SCHEMA,
  type FootageAnalysis,
} from "../types/analysis";
import { runPerceptionPro } from "../services/reference-analysis-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

const FOOTAGE_SYSTEM =
  "You are a precise video analyst. Return ONLY valid JSON matching the FootageAnalysis schema. " +
  "Set analysisMode to 'video' only if you can confidently describe each segment from the actual frames. " +
  "If frames are unclear or you must guess, set analysisMode to 'metadata_fallback' — do not fabricate details.";

async function extractFramesFromR2Buffer(
  buffer: ArrayBuffer,
  mimeType: string,
  count: number
): Promise<Uint8Array[]> {
  const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "analyze-frames-"));
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

async function getVideoDurationFromBuffer(
  buffer: ArrayBuffer,
  mimeType: string
): Promise<number> {
  const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "analyze-dur-"));
  const tmpPath = path.join(tmpDir, `input${ext}`);

  try {
    await fs.writeFile(tmpPath, Buffer.from(buffer));
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      tmpPath,
    ], { timeout: 30_000 });
    return parseFloat(stdout.trim()) || 0;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function analyzeFootageClip(
  env: Env,
  fileId: string
): Promise<FootageAnalysis> {
  const ai = getAIService(env);

  let buffer: ArrayBuffer | null = null;
  let mimeType = "video/mp4";
  let actualDuration = 0;

  const object = await env.MONET_MEDIA.get(fileId);
  if (object) {
    buffer = await object.arrayBuffer();
    mimeType = object.httpMetadata?.contentType || "video/mp4";
    actualDuration = await getVideoDurationFromBuffer(buffer, mimeType);
    console.log(`[analyze] Fetched footage: ${fileId} (${buffer.byteLength} bytes, ${actualDuration.toFixed(1)}s)`);
  }

  let frames: Uint8Array[] = [];
  if (buffer) {
    try {
      frames = await extractFramesFromR2Buffer(buffer, mimeType, 8);
      console.log(`[analyze] Extracted ${frames.length} frames for footage ${fileId}`);
    } catch (e) {
      console.warn(`[analyze] Frame extraction failed for ${fileId}: ${(e as Error).message}`);
    }
  }

  let analysis: any = null;
  try {
    const result = await ai.run("analyze-footage", {
      systemPrompt: FOOTAGE_SYSTEM,
      prompt: `Analyze this footage (clipId=${fileId}, duration=${actualDuration.toFixed(1)}s). Identify segments with timing, subjects, motion, color. Return valid FootageAnalysis JSON.`,
      images: frames.length > 0 ? frames : undefined,
      schema: FootageAnalysisSchema as any,
      schemaJSON: FOOTAGE_ANALYSIS_JSON_SCHEMA as Record<string, unknown>,
      maxTokens: 4096,
    });
    analysis = result.data;

    if (analysis && analysis.clipId !== fileId) {
      console.warn(`[analyze] AI returned clipId "${analysis.clipId}" but expected "${fileId}" — overriding`);
      analysis.clipId = fileId;
    }

    if (!result.schemaValid) {
      console.warn(`[analyze] Footage ${fileId} schema invalid, using metadata fallback`);
      analysis = null;
    }
  } catch (e) {
    console.warn(`[analyze] Footage AI analysis failed for ${fileId}: ${(e as Error).message}`);
  }

  if (!analysis) {
    analysis = await buildFallbackAnalysis(env, fileId, buffer, mimeType, actualDuration);
  }

  return analysis;
}

async function buildFallbackAnalysis(
  env: Env,
  fileId: string,
  buffer: ArrayBuffer | null,
  mimeType: string,
  actualDuration: number
): Promise<any> {
  const dur = actualDuration > 0 ? actualDuration : 30;

  let segments: any[] = [];
  let cvMetrics: SegmentQuality[] = [];

  // Try to extract CV metrics if we have a buffer
  if (buffer && dur > 5) {
    try {
      // Write buffer to temp file for FFmpeg processing
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-metrics-"));
      const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
      const tmpPath = path.join(tmpDir, `input${ext}`);
      await fs.writeFile(tmpPath, Buffer.from(buffer));
      
      const cvResult = await extractCVMetrics(tmpPath, 2.0);
      cvMetrics = cvResult.segments;
      console.log(`[analyze] CV metrics extracted: ${cvMetrics.length} segments, avgMotion=${cvResult.avgMotion.toFixed(2)}, avgBrightness=${cvResult.avgBrightness.toFixed(2)}`);
      
      // Use CV metrics to create segments with real scores
      for (const cvSeg of cvMetrics) {
        const pos = (cvSeg.startTime + cvSeg.endTime) / 2 / dur;
        const isHook = pos < 0.15;
        const isClimax = pos > 0.6 && pos < 0.85;
        const isResolution = pos > 0.85;

        // Map CV metrics to segment scores
        const motion = cvSeg.motionScore;
        const brightness = cvSeg.brightnessScore;
        const sharpness = cvSeg.blurScore;
        const sceneChange = cvSeg.sceneChangeScore;
        
        // Overall quality from CV metrics
        const overall = cvSeg.overallQuality;
        
        // Interest score: combine CV quality with position-based heuristics
        let interest = overall;
        if (isHook) interest = Math.max(interest, 0.8);
        if (isClimax) interest = Math.max(interest, 0.75);
        if (cvSeg.isBlackFrame) interest *= 0.1;
        if (cvSeg.isStaticFrame) interest *= 0.3;

        segments.push({
          id: `seg_${String(cvSeg.segmentIndex + 1).padStart(3, "0")}`,
          start: cvSeg.startTime,
          end: cvSeg.endTime,
          duration: cvSeg.endTime - cvSeg.startTime,
          scores: {
            motion,
            emotion: interest * 0.9,
            visual: sharpness,
            overall,
            interest,
          },
          tags: isHook ? ["hook"] : isClimax ? ["climax"] : isResolution ? ["resolution"] : ["body"],
          description: `CV-analyzed segment at ${cvSeg.startTime.toFixed(1)}s (motion=${motion.toFixed(2)}, brightness=${brightness.toFixed(2)}, sharpness=${sharpness.toFixed(2)})`,
          dominantColors: ["#333333", "#666666", "#999999"],
          cvMetrics: {
            motionScore: cvSeg.motionScore,
            brightnessScore: cvSeg.brightnessScore,
            blurScore: cvSeg.blurScore,
            sceneChangeScore: cvSeg.sceneChangeScore,
            overallQuality: cvSeg.overallQuality,
            isBlackFrame: cvSeg.isBlackFrame,
            isStaticFrame: cvSeg.isStaticFrame,
          },
        });
      }
      console.log(`[analyze] Built ${segments.length} CV-scored segments`);
    } catch (e) {
      console.warn(`[analyze] CV metrics extraction failed: ${(e as Error).message}`);
    }
  }

  // Fallback to scene-based segments if CV metrics failed
  if (segments.length === 0 && buffer && dur > 5) {
    try {
      const sceneResult = await detectSceneChangesFromBuffer(buffer, mimeType);
      if (sceneResult.scenes.length >= 2) {
        const allCuts = [0, ...sceneResult.scenes.map(s => s.timestamp), dur];
        for (let i = 0; i < allCuts.length - 1; i++) {
          const start = allCuts[i];
          const end = allCuts[i + 1];
          const segDur = end - start;
          if (segDur < 0.5) continue;

          const pos = (start + end) / 2 / dur;
          const isHook = pos < 0.15;
          const isClimax = pos > 0.6 && pos < 0.85;
          const isResolution = pos > 0.85;

          const motion = isClimax ? 0.8 : isHook ? 0.7 : isResolution ? 0.4 : 0.5;
          const interest = isHook ? 0.9 : isClimax ? 0.85 : isResolution ? 0.5 : 0.6;

          segments.push({
            id: `seg_${String(i + 1).padStart(3, "0")}`,
            start,
            end,
            duration: segDur,
            scores: {
              motion,
              emotion: interest * 0.9,
              visual: interest,
              overall: (motion + interest) / 2,
              interest,
            },
            tags: isHook ? ["hook"] : isClimax ? ["climax"] : isResolution ? ["resolution"] : ["body"],
            description: `${isHook ? "Hook" : isClimax ? "Climax" : isResolution ? "Resolution" : "Body"} segment at ${start.toFixed(1)}s`,
            dominantColors: ["#333333", "#666666", "#999999"],
          });
        }
        console.log(`[analyze] Scene-based segments: ${segments.length} segments from ${sceneResult.scenes.length} cuts`);
      }
    } catch (e) {
      console.warn(`[analyze] Scene detection for fallback failed: ${(e as Error).message}`);
    }
  }

  // Final fallback: time-based segments
  if (segments.length === 0) {
    const segmentCount = Math.max(1, Math.ceil(dur / 10));
    for (let i = 0; i < segmentCount; i++) {
      const start = (i / segmentCount) * dur;
      const end = Math.min(((i + 1) / segmentCount) * dur, dur);
      const pos = (start + end) / 2 / dur;
      const isHook = pos < 0.15;
      const isClimax = pos > 0.6 && pos < 0.85;

      segments.push({
        id: `seg_${String(i + 1).padStart(3, "0")}`,
        start,
        end,
        duration: end - start,
        scores: {
          motion: isClimax ? 0.8 : isHook ? 0.7 : 0.5,
          emotion: 0.5,
          visual: isHook ? 0.8 : 0.5,
          overall: isClimax ? 0.75 : isHook ? 0.7 : 0.5,
          interest: isHook ? 0.85 : isClimax ? 0.8 : 0.5,
        },
        tags: isHook ? ["hook"] : isClimax ? ["climax"] : ["body"],
        description: `Estimated segment ${i + 1}/${segmentCount}`,
        dominantColors: ["#333333", "#666666", "#999999"],
      });
    }
  }

  // Run perception_pro on user footage to populate semantic/motionDir/faceCentered/hasVelocityRamp
  if (segments.length > 0 && buffer && dur > 5) {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "perception-"));
      const ext = mimeType.includes("quicktime") ? ".mov" : ".mp4";
      const tmpPath = path.join(tmpDir, `input${ext}`);
      await fs.writeFile(tmpPath, Buffer.from(buffer));
      const pro = await runPerceptionPro(tmpPath, env);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      for (const segment of segments) {
        const mid = (segment.start + segment.end) / 2;
        const match = pro.shots.reduce(
          (best: any, s: any) => {
            const d = Math.abs((s.start_time + s.end_time) / 2 - mid);
            return d < best.d ? { d, s } : best;
          },
          { d: Infinity, s: null },
        ).s;

        if (match) {
          segment.semantic = match.semantic;
          segment.motionDir = match.motionDir;
          segment.faceCentered = match.faceCentered;
          segment.hasVelocityRamp = match.hasVelocityRamp;
          segment.scores = segment.scores ?? {};
          segment.scores.motion = match.motion;
        }
      }
      console.log(`[analyze] Perception pro: ${pro.shots.length} shots, flow=${pro.backends?.flow}`);
    } catch (e) {
      console.warn(`[analyze] Perception pro failed: ${(e as Error).message}`);
    }
  }

  // Compute characteristics from CV metrics
  const avgMotion = cvMetrics.length > 0
    ? cvMetrics.reduce((s, m) => s + m.motionScore, 0) / cvMetrics.length
    : 0.5;
  const avgBrightness = cvMetrics.length > 0
    ? cvMetrics.reduce((s, m) => s + m.brightnessScore, 0) / cvMetrics.length
    : 0.5;

  return {
    clipId: fileId,
    duration: dur,
    confidence: cvMetrics.length > 0 ? 0.7 : buffer ? 0.5 : 0.3,
    analysisMode: cvMetrics.length > 0 ? "cv_analyzed" : buffer ? "scene_detected" : "metadata_fallback",
    segments,
    characteristics: {
      avgBrightness,
      avgMotion,
      dominantColors: ["#333333", "#666666", "#999999"],
      visualStyle: "unknown",
      contentType: ["footage"],
    },
  };
}

export async function handleAnalyze(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      footageIds?: string[];
      musicId?: string;
    };

    const { projectId, footageIds = [], musicId } = body;

    if (footageIds.length === 0 && !musicId) {
      return apiError(ApiErrorCode.InvalidRequest, "Must provide at least one footageId or a musicId", 400);
    }

    const footageResults: FootageAnalysis[] = [];
    for (const fileId of footageIds) {
      footageResults.push(await analyzeFootageClip(env, fileId));
    }

    const musicResult = musicId ? await analyzeMusic(env, musicId) : null;

    const analysisId = crypto.randomUUID();
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO analysis_results (id, project_id, analysis_data, created_at) VALUES (?, ?, ?, ?)`
        )
          .bind(analysisId, projectId, JSON.stringify({ footage: footageResults, music: musicResult }), Date.now())
          .run();
        console.log("[analyze] Stored analysis", analysisId, "footage clips:", footageResults.length);
      } catch (e) {
        console.warn("[analyze] D1 insert failed:", (e as Error).message);
      }
    }

    return jsonResponse({
      success: true,
      analysisId,
      result: { footage: footageResults, music: musicResult },
    });
  } catch (error: any) {
    console.error("[analyze] Error:", error);
    return apiError(ApiErrorCode.InternalError, error.message || "Analysis failed", 500);
  }
}
