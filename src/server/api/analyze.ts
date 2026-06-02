// POST /api/analyze - Analyze footage and music
// Phase 3: Video understanding before EDL generation

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type {
  AnalysisResult,
  FootageAnalysis,
  MusicAnalysis,
} from "../types/analysis";
import {
  FOOTAGE_ANALYSIS_SCHEMA,
  MUSIC_ANALYSIS_SCHEMA,
} from "../types/analysis";
import { now } from "../types/env";
import { readFileSync } from "fs";
import { join } from "path";
import { getCachedAnalysis, cacheAnalysis } from "../lib/analysis-cache";
import { storeAnalysisResult } from "../lib/analysis-store";

const ANALYZE_TIMEOUT_MS = 18_000;
const MAX_FOOTAGE_ANALYZE_CONCURRENCY = 3;

interface AnalyzeRequest {
  projectId: string;
  footageIds?: string[]; // R2 keys for video files
  musicId?: string; // R2 key for audio file
  referenceId?: string; // R2 key for reference video (future)
}

interface AnalyzeResponse {
  success: boolean;
  analysisId?: string;
  result?: AnalysisResult;
  error?: string;
}

/**
 * Analyze uploaded media for edit generation
 *
 * Flow:
 * 1. Fetch media files from R2
 * 2. Upload to Gemini Files API (if not cached)
 * 3. Analyze footage: segment scoring, motion/emotion detection
 * 4. Analyze music: beat detection, BPM, energy curve
 * 5. Store analysis in D1 for EDL generation
 * 6. Return structured analysis JSON
 */
export async function handleAnalyze(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: AnalyzeRequest = await request.json();

    // Validate input
    if (!body.projectId) {
      return jsonResponse(
        { success: false, error: "Missing projectId" },
        400
      );
    }

    if (!body.footageIds?.length && !body.musicId) {
      return jsonResponse(
        {
          success: false,
          error: "Must provide at least footageIds or musicId to analyze",
        },
        400
      );
    }

    // Check cache first (HUGE COST SAVER for refinements)
    const cached = getCachedAnalysis(body.footageIds || [], body.musicId);
    if (cached) {
      console.log("🚀 Analysis cache hit - skipping Gemini analysis");
      const analysisId = `cached-${Date.now()}`;
      storeAnalysisResult(analysisId, cached);
      return jsonResponse({
        success: true,
        analysisId,
        result: cached,
        cached: true,
      });
    }

    const ai = getAIService(env);
    const result: Partial<AnalysisResult> = {
      version: "1.0.0",
      projectId: body.projectId,
      timestamp: Date.now(),
      footage: [],
    };

    // Analyze footage (if provided)
    if (body.footageIds?.length) {
      console.log(`Analyzing ${body.footageIds.length} video clip(s)...`);

      const clipResults = await analyzeFootageBatch(body.footageIds, ai, env);
      for (const clipResult of clipResults) {
        if (clipResult.ok) {
          result.footage!.push(clipResult.value);
        } else {
          console.error(`Failed to analyze clip ${clipResult.clipId}:`, clipResult.error);
        }
      }
    }

    // Analyze music (if provided)
    if (body.musicId) {
      console.log("Analyzing music track...");
      try {
        result.music = await analyzeMusicTrack(body.musicId, ai, env);
      } catch (error) {
        console.error("Failed to analyze music:", error);
        // Music analysis failure is not fatal
      }
    }

    // Cache analysis for refinements (THE REAL COST SAVER)
    cacheAnalysis(body.footageIds || [], body.musicId, result as AnalysisResult);

    // Store analysis in D1 (if DB available)
    const analysisId = env?.DB
      ? await storeAnalysis(env.DB, result as AnalysisResult)
      : `analysis-${Date.now()}`;

    storeAnalysisResult(analysisId, result as AnalysisResult);

    return jsonResponse({
      success: true,
      analysisId,
      result: result as AnalysisResult,
      cached: false,
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

type FootageBatchResult =
  | { ok: true; clipId: string; value: FootageAnalysis }
  | { ok: false; clipId: string; error: unknown };

async function analyzeFootageBatch(
  clipIds: string[],
  ai: ReturnType<typeof getAIService>,
  env: Env
): Promise<FootageBatchResult[]> {
  const results: FootageBatchResult[] = [];
  for (let i = 0; i < clipIds.length; i += MAX_FOOTAGE_ANALYZE_CONCURRENCY) {
    const batch = clipIds.slice(i, i + MAX_FOOTAGE_ANALYZE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (clipId) => ({
        clipId,
        analysis: await analyzeFootageClip(clipId, ai, env),
      }))
    );

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      const clipId = batch[j];
      if (outcome.status === "fulfilled") {
        results.push({ ok: true, clipId, value: outcome.value.analysis });
      } else {
        results.push({ ok: false, clipId, error: outcome.reason });
      }
    }
  }
  return results;
}

/**
 * Analyze a single video clip
 */
async function analyzeFootageClip(
  clipId: string,
  ai: ReturnType<typeof getAIService>,
  env: Env
): Promise<FootageAnalysis> {
  // TODO: Fetch video from R2
  // TODO: Upload to Gemini Files API
  // TODO: Get video metadata (duration, resolution, fps)

  // For MVP: Mock R2 fetch, assume video is already uploaded to Gemini
  // In production, this would:
  // 1. const videoBlob = await env.R2.get(clipId)
  // 2. const geminiFile = await gemini.uploadFile(videoBlob)
  // 3. Use geminiFile.uri in prompt

  // Load prompt template
  const promptTemplate = loadPromptTemplate("analyze-footage.txt");

  // Call AI service with video analysis prompt
  let analysis: Partial<FootageAnalysis>;
  try {
    analysis = await withTimeout(
      ai.generateContentJSON<Partial<FootageAnalysis>>({
        prompt: `${promptTemplate}\n\nVideo clip ID: ${clipId}\n\nAnalyze this video and return the JSON response.`,
        temperature: 0.5, // Lower temp for more consistent analysis
        schema: FOOTAGE_ANALYSIS_SCHEMA,
      }),
      ANALYZE_TIMEOUT_MS,
      `Footage analysis timed out for ${clipId}`
    );
  } catch (error) {
    console.warn(`Falling back to deterministic footage analysis for ${clipId}:`, error);
    analysis = {
      segments: buildFallbackSegments(30, clipId),
      characteristics: {
        avgBrightness: 0.5,
        avgMotion: 0.6,
        dominantColors: ["#202020", "#f5f5f5"],
        visualStyle: "mixed",
        contentType: ["action"],
      },
    };
  }

  // Add metadata (in production, this comes from R2 object metadata)
  return {
    clipId,
    duration: 30, // TODO: Get from video metadata
    resolution: { width: 1920, height: 1080 }, // TODO: Get from metadata
    fps: 30, // TODO: Get from metadata
    segments: analysis.segments || [],
    characteristics: analysis.characteristics || {
      avgBrightness: 0.5,
      avgMotion: 0.5,
      dominantColors: ["#000000"],
      visualStyle: "unknown",
      contentType: ["unknown"],
    },
  };
}

function buildFallbackSegments(duration: number, clipId: string): FootageAnalysis["segments"] {
  const count = 6;
  const segmentLength = Math.max(1.5, duration / (count + 1));
  const baseSeed = clipId.length;
  const segments: FootageAnalysis["segments"] = [];

  for (let i = 0; i < count; i++) {
    const jitter = ((baseSeed + i * 7) % 11) / 20;
    const start = Math.max(0, Math.min(duration - 1.2, i * segmentLength + jitter));
    const rawDuration = 1.4 + ((baseSeed + i * 5) % 14) / 10;
    const end = Math.min(duration, start + rawDuration);
    const segDuration = Math.max(1.0, end - start);
    const motion = 0.58 + ((baseSeed + i * 3) % 20) / 100;
    const emotion = 0.52 + ((baseSeed + i * 9) % 22) / 100;
    const visual = 0.6 + ((baseSeed + i * 4) % 16) / 100;
    const overall = Math.min(0.82, motion * 0.4 + emotion * 0.3 + visual * 0.3);

    segments.push({
      start: Number(start.toFixed(3)),
      end: Number((start + segDuration).toFixed(3)),
      duration: Number(segDuration.toFixed(3)),
      scores: {
        motion: Number(motion.toFixed(3)),
        emotion: Number(emotion.toFixed(3)),
        visual: Number(visual.toFixed(3)),
        overall: Number(overall.toFixed(3)),
        interest: Number((overall * 0.94).toFixed(3)),
      },
      tags: ["fallback", i % 2 === 0 ? "dynamic" : "closeup"],
      description: "Deterministic fallback segment (analysis timeout)",
      avgBrightness: Number((0.42 + (i % 4) * 0.08).toFixed(2)),
      dominantColor: i % 2 === 0 ? "#202020" : "#2f2a38",
      faceDetected: i % 3 === 1,
    });
  }

  return segments;
}

/**
 * Analyze music track for beat detection and structure
 */
async function analyzeMusicTrack(
  musicId: string,
  ai: ReturnType<typeof getAIService>,
  env: Env
): Promise<MusicAnalysis> {
  // TODO: Fetch audio from R2
  // TODO: Upload to Gemini Files API
  // TODO: Get audio metadata (duration)

  // Load prompt template
  const promptTemplate = loadPromptTemplate("analyze-music.txt");

  // Call AI service with music analysis prompt
  let analysis: Partial<MusicAnalysis>;
  try {
    analysis = await withTimeout(
      ai.generateContentJSON<Partial<MusicAnalysis>>({
        prompt: `${promptTemplate}\n\nAudio track ID: ${musicId}\n\nAnalyze this audio and return the JSON response.`,
        temperature: 0.3, // Very low temp for precise beat detection
        schema: MUSIC_ANALYSIS_SCHEMA,
      }),
      ANALYZE_TIMEOUT_MS,
      `Music analysis timed out for ${musicId}`
    );
  } catch (error) {
    console.warn(`Falling back to deterministic music analysis for ${musicId}:`, error);
    const fallbackBpm = 120;
    const beatStep = 60 / fallbackBpm;
    const beatGrid: number[] = [];
    for (let t = 0; t < 30; t += beatStep) beatGrid.push(Number(t.toFixed(3)));
    analysis = {
      bpm: fallbackBpm,
      beatGrid,
      beatConfidence: 0.5,
      energyCurve: [0.4, 0.5, 0.65, 0.7, 0.8, 0.9, 0.75, 0.6, 0.5, 0.45],
      characteristics: {
        genre: "unknown",
        mood: ["energetic"],
        tempo: "medium",
        intensity: 0.6,
      },
    };
  }

  // Add metadata
  return {
    musicId,
    duration: 30, // TODO: Get from audio metadata
    bpm: analysis.bpm || 120,
    beatGrid: analysis.beatGrid || [],
    beatConfidence: analysis.beatConfidence || 0.5,
    structure: analysis.structure,
    energyCurve: analysis.energyCurve || [],
    characteristics: analysis.characteristics || {
      genre: "unknown",
      mood: [],
      tempo: "medium",
      intensity: 0.5,
    },
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Store analysis result in D1
 */
async function storeAnalysis(
  db: D1Database,
  result: AnalysisResult
): Promise<string> {
  const analysisId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO analysis_results (
        id, project_id, analysis_data, created_at
      ) VALUES (?, ?, ?, ?)`
    )
    .bind(analysisId, result.projectId, JSON.stringify(result), now())
    .run();

  return analysisId;
}

/**
 * Load prompt template from file
 */
function loadPromptTemplate(filename: string): string {
  try {
    const path = join(process.cwd(), "src", "server", "prompts", filename);
    return readFileSync(path, "utf-8");
  } catch (error) {
    console.error("Failed to load prompt template:", error);
    throw new Error(`Prompt template not found: ${filename}`);
  }
}

// Helper: JSON response
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
