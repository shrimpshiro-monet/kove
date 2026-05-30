// POST /api/generate-edl - Generate edit timeline from intent + analysis
// Phase 4: The AI director creates the actual edit

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type { MonetEDL } from "../types/edl";
import { EDL_JSON_SCHEMA } from "../types/edl";
import type { IntentExtractionResult } from "../types/intent";
import type { AnalysisResult } from "../types/analysis";
import { now } from "../types/env";
import { readFileSync } from "fs";
import { join } from "path";
import { generateDeterministicEDL } from "../lib/deterministic-edl";

interface GenerateEDLRequest {
  projectId: string;
  intentId: string; // Reference to stored intent
  analysisId: string; // Reference to stored analysis
}

interface GenerateEDLResponse {
  success: boolean;
  edlId?: string;
  edl?: MonetEDL;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  error?: string;
}

/**
 * Generate complete edit timeline from intent + analysis
 *
 * Flow:
 * 1. Fetch intent and analysis from D1
 * 2. Build prompt with all context
 * 3. Call Gemini with EDL generation prompt
 * 4. Score the generated EDL
 * 5. Store EDL in D1
 * 6. Return EDL + scores
 */
export async function handleGenerateEDL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: GenerateEDLRequest = await request.json();

    // Validate input
    if (!body.projectId || !body.intentId || !body.analysisId) {
      return jsonResponse(
        { success: false, error: "Missing required fields" },
        400
      );
    }

    // Fetch intent from D1 (or mock for dev)
    const intent = await fetchIntent(body.intentId, env);
    if (!intent) {
      return jsonResponse(
        { success: false, error: "Intent not found" },
        404
      );
    }

    // Fetch analysis from D1 (or mock for dev)
    const analysis = await fetchAnalysis(body.analysisId, env);
    if (!analysis) {
      return jsonResponse(
        { success: false, error: "Analysis not found" },
        404
      );
    }

    // Generate EDL (LLM-enhanced with deterministic fallback)
    const ai = getAIService(env);
    let edl: MonetEDL;
    let usedFallback = false;

    try {
      // Try LLM-enhanced generation first
      edl = await generateEDL(intent, analysis, ai);

      // Add metadata
      edl.metadata = {
        title: `Edit for ${body.projectId}`,
        createdAt: Date.now(),
        aiModel: "gemini-2.5-flash",
        prompt: intent.intent.goal.primary,
        intentId: body.intentId,
        analysisId: body.analysisId,
      };
    } catch (error) {
      console.error("LLM EDL generation failed, using deterministic fallback:", error);

      // FALLBACK: Deterministic EDL (no LLM dependency)
      edl = generateDeterministicEDL(intent, analysis, {
        intentId: body.intentId,
        analysisId: body.analysisId,
        projectId: body.projectId,
      });

      usedFallback = true;
    }

    // Score the EDL
    const scores = scoreEDL(edl, analysis, intent);

    // Store EDL in D1 (if DB available)
    const edlId = env?.DB
      ? await storeEDL(env.DB, body.projectId, body.intentId, body.analysisId, edl, scores)
      : `edl-${Date.now()}`;

    return jsonResponse({
      success: true,
      edlId,
      edl,
      scores,
      usedFallback, // Tell user if we fell back to deterministic
    });
  } catch (error) {
    console.error("EDL generation error:", error);
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
 * Generate EDL using AI service
 */
async function generateEDL(
  intent: IntentExtractionResult,
  analysis: AnalysisResult,
  ai: ReturnType<typeof getAIService>
): Promise<MonetEDL> {
  // Load prompt template
  const promptTemplate = loadPromptTemplate("generate-edl.txt");

  // Build context for Gemini
  const contextPrompt = `
## User's Creative Intent

${JSON.stringify(intent.intent, null, 2)}

Intent confidence: ${intent.confidence}
Reasoning: ${intent.reasoning}

## Footage Analysis

${JSON.stringify(analysis.footage, null, 2)}

## Music Analysis

${analysis.music ? JSON.stringify(analysis.music, null, 2) : "No music provided"}

## Your Task

Based on the intent and analysis above, generate a complete EDL (Edit Decision List).

Target duration: ${intent.intent.structure.duration} seconds
Pacing: ${intent.intent.style.pacing}
Mood: ${intent.intent.style.mood.join(", ")}
Beat sync: ${intent.intent.technical.syncToBeat ? "REQUIRED" : "Optional"}
${intent.intent.technical.syncToBeat ? `Beat sync strength: ${intent.intent.technical.beatSyncStrength}` : ""}

Generate the EDL now.
`;

  const fullPrompt = promptTemplate + "\n\n" + contextPrompt;

  // Call AI service with JSON mode
  const edlData = await ai.generateContentJSON<Partial<MonetEDL>>({
    prompt: fullPrompt,
    temperature: 0.8, // Higher temp for creative choices
    schema: EDL_JSON_SCHEMA,
  });

  // Add music reference if provided
  if (analysis.music) {
    edlData.music = {
      sourceId: analysis.music.musicId,
      bpm: analysis.music.bpm,
      beatGrid: analysis.music.beatGrid,
      volume: 0.8,
      fadeIn: 0.5,
    };
  }

  // Add timeline metadata
  edlData.timeline = {
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    duration: edlData.timeline?.duration || intent.intent.structure.duration,
  };

  return edlData as MonetEDL;
}

/**
 * Score the generated EDL for quality
 */
function scoreEDL(
  edl: MonetEDL,
  analysis: AnalysisResult,
  intent: IntentExtractionResult
): { beatSyncScore: number; pacingVariance: number; overallConfidence: number } {
  // Beat sync score (if music provided)
  let beatSyncScore = 1.0;
  if (edl.music && edl.music.beatGrid.length > 0) {
    beatSyncScore = calculateBeatSyncScore(edl, edl.music.beatGrid);
  }

  // Pacing variance (variety in shot durations)
  const pacingVariance = calculatePacingVariance(edl);

  // Overall confidence (combined score)
  const overallConfidence = beatSyncScore * 0.5 + pacingVariance * 0.3 + intent.confidence * 0.2;

  return {
    beatSyncScore: Math.round(beatSyncScore * 100) / 100,
    pacingVariance: Math.round(pacingVariance * 100) / 100,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };
}

/**
 * Calculate how well shots align to beat grid
 */
function calculateBeatSyncScore(edl: MonetEDL, beatGrid: number[]): number {
  if (!edl.shots.length || !beatGrid.length) return 1.0; // No music = perfect score

  let hits = 0;
  const threshold = 0.05; // 50ms tolerance

  for (const shot of edl.shots) {
    if (!shot.beatLock) continue;

    const beatTime = beatGrid[shot.beatLock.beatIndex];
    if (!beatTime) continue;

    const shotTime = shot.timing.startTime;
    const offset = Math.abs(shotTime - beatTime);

    if (offset < threshold) {
      hits++;
    }
  }

  // Shots with beatLock
  const beatLockedShots = edl.shots.filter((s) => s.beatLock).length;

  // If no shots have beatLock but music exists, that's intentional (no beat sync)
  if (beatLockedShots === 0) return 1.0;

  return hits / beatLockedShots;
}

/**
 * Calculate pacing variety (coefficient of variation)
 */
function calculatePacingVariance(edl: MonetEDL): number {
  if (edl.shots.length < 2) return 0.5; // Single shot = default mid score

  const durations = edl.shots.map((s) => s.timing.duration);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Prevent divide by zero
  if (mean === 0) return 0;

  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (normalized)
  const cv = stdDev / mean;

  // 0 = all same length (boring), 1 = high variety (dynamic)
  // Cap at 1.0 for very high variance
  return Math.min(cv / 0.5, 1.0);
}

/**
 * Fetch intent from D1 (or mock for dev)
 */
async function fetchIntent(
  intentId: string,
  env: Env
): Promise<IntentExtractionResult | null> {
  if (!env?.DB) {
    // Mock intent for dev
    console.warn("No DB binding - using mock intent");
    return {
      intent: {
        version: "1.0.0",
        goal: { primary: "Create aggressive anime AMV" },
        style: { genre: "anime_amv", pacing: "aggressive", mood: ["intense"] },
        structure: { duration: 30, energyCurve: Array(30).fill(0.8) },
        technical: { syncToBeat: true, beatSyncStrength: 0.9, transitionStyle: "cut" },
        contentPreferences: { focusOn: ["action", "closeups"] },
      },
      confidence: 0.85,
      reasoning: "Mock intent for testing",
    };
  }

  const result = await env.DB.prepare(
    "SELECT intent_data, confidence FROM edit_intents WHERE id = ?"
  )
    .bind(intentId)
    .first<{ intent_data: string; confidence: number }>();

  if (!result) return null;

  return {
    intent: JSON.parse(result.intent_data),
    confidence: result.confidence,
    reasoning: "Stored intent",
  };
}

/**
 * Fetch analysis from D1 (or mock for dev)
 */
async function fetchAnalysis(
  analysisId: string,
  env: Env
): Promise<AnalysisResult | null> {
  if (!env?.DB) {
    // Mock analysis for dev
    console.warn("No DB binding - using mock analysis");
    return {
      version: "1.0.0",
      projectId: "test",
      timestamp: Date.now(),
      footage: [
        {
          clipId: "clip-1",
          duration: 30,
          resolution: { width: 1920, height: 1080 },
          fps: 30,
          segments: [
            {
              start: 2.0,
              end: 4.0,
              duration: 2.0,
              scores: { overall: 0.9, motion: 0.95, emotion: 0.85, visual: 0.88, interest: 0.92 },
              description: "Intense action sequence",
              tags: ["action", "closeup"],
              avgBrightness: 0.6,
              dominantColor: "#FF5733",
              faceDetected: true,
            },
          ],
          characteristics: {
            avgBrightness: 0.6,
            avgMotion: 0.8,
            dominantColors: ["#FF5733"],
            visualStyle: "anime",
            contentType: ["action"],
          },
        },
      ],
      music: {
        musicId: "music-1",
        duration: 30,
        bpm: 140,
        beatGrid: Array.from({ length: 70 }, (_, i) => i * 0.43),
        beatConfidence: 0.95,
        energyCurve: Array(30).fill(0.8),
        characteristics: { genre: "electronic", mood: ["intense"], tempo: "fast", intensity: 0.9 },
      },
    };
  }

  const result = await env.DB.prepare(
    "SELECT analysis_data FROM analysis_results WHERE id = ?"
  )
    .bind(analysisId)
    .first<{ analysis_data: string }>();

  if (!result) return null;

  return JSON.parse(result.analysis_data);
}

/**
 * Store EDL in D1
 */
async function storeEDL(
  db: D1Database,
  projectId: string,
  intentId: string,
  analysisId: string,
  edl: MonetEDL,
  scores: { beatSyncScore: number; pacingVariance: number; overallConfidence: number }
): Promise<string> {
  const edlId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO edls (
        id, project_id, intent_id, analysis_id, version,
        edl_data, beat_sync_score, pacing_variance_score, overall_confidence,
        model_used, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      edlId,
      projectId,
      intentId,
      analysisId,
      edl.version || "1.0.0",
      JSON.stringify(edl),
      scores.beatSyncScore,
      scores.pacingVariance,
      scores.overallConfidence,
      "gemini-2.5-flash",
      now()
    )
    .run();

  return edlId;
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
