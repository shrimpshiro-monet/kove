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
      return jsonResponse({
        success: true,
        analysisId: `cached-${Date.now()}`,
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

      for (const clipId of body.footageIds) {
        try {
          const analysis = await analyzeFootageClip(clipId, ai, env);
          result.footage!.push(analysis);
        } catch (error) {
          console.error(`Failed to analyze clip ${clipId}:`, error);
          // Continue with other clips even if one fails
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
  const analysis = await ai.generateContentJSON<Partial<FootageAnalysis>>({
    prompt: `${promptTemplate}\n\nVideo clip ID: ${clipId}\n\nAnalyze this video and return the JSON response.`,
    temperature: 0.5, // Lower temp for more consistent analysis
    schema: FOOTAGE_ANALYSIS_SCHEMA,
  });

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
  const analysis = await ai.generateContentJSON<Partial<MusicAnalysis>>({
    prompt: `${promptTemplate}\n\nAudio track ID: ${musicId}\n\nAnalyze this audio and return the JSON response.`,
    temperature: 0.3, // Very low temp for precise beat detection
    schema: MUSIC_ANALYSIS_SCHEMA,
  });

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
