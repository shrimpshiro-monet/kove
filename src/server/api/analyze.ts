// POST /api/analyze - Analyze footage and music
// Phase 3: Video understanding before EDL generation

import { z } from "zod";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import {
  AnalysisResultSchema,
  type AnalysisResult,
  type FootageAnalysis,
} from "../types/analysis";
import {
  analyzeClip,
  analyzeMusic,
  type AnalysisServiceError,
} from "../services/footage-analysis";
import { getCachedAnalysis, cacheAnalysis } from "../lib/analysis-cache";
import { storeAnalysisResult } from "../lib/analysis-store";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const MAX_FOOTAGE_ANALYZE_CONCURRENCY = 3;

const AnalyzeRequestSchema = z.object({
  projectId: z.string().min(1),
  footageIds: z.array(z.string().min(1)).optional(),
  musicId: z.string().min(1).optional(),
  referenceId: z.string().min(1).optional(),
});

type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

type ClipAnalysisFailure = {
  clipId: string;
  error: AnalysisServiceError;
};

/**
 * Analyze uploaded media for edit generation.
 */
export async function handleAnalyze(
  request: Request,
  env: Env
): Promise<Response> {
  console.log("[handleAnalyze] Received env, keys:", Object.keys(env || {}));
  if (!env || !env.MONET_MEDIA) {
    console.error("[handleAnalyze] Critical error: MONET_MEDIA binding is missing from env");
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  console.log("[handleAnalyze] Request body:", JSON.stringify(bodyResult.value));

  const validation = AnalyzeRequestSchema.safeParse(bodyResult.value);
  if (!validation.success) {
    return apiError(
      ApiErrorCode.InvalidRequest,
      "Invalid analysis request",
      400,
      validation.error
    );
  }

  try {
    return await analyzeRequest(validation.data, env);
  } catch (error: any) {
    console.error("[handleAnalyze] Unexpected error:", error);
    return apiError(
      ApiErrorCode.InternalError,
      error.message || "An unexpected error occurred during analysis",
      500,
      { stack: error.stack }
    );
  }
}

async function analyzeRequest(
  request: AnalyzeRequest,
  env: Env
): Promise<Response> {
  const { projectId, footageIds = [], musicId, referenceId } = request;

  if (footageIds.length === 0 && !musicId) {
    return apiError(
      ApiErrorCode.InvalidRequest,
      "Must provide at least one footageId or a musicId to analyze",
      400
    );
  }

  // Check cache first (HUGE COST SAVER for refinements)
  const cached = getCachedAnalysis(footageIds, musicId);
  if (cached) {
    const cacheValidation = AnalysisResultSchema.safeParse(cached);
    if (!cacheValidation.success) {
      console.warn("[analysis] Cached analysis failed validation; ignoring cache", {
        operation: "handleAnalyze",
        projectId,
        error: cacheValidation.error,
      });
    } else {
      const analysisId = `cached-${Date.now()}`;
      storeAnalysisResult(analysisId, cacheValidation.data);

      return jsonResponse({
        success: true,
        analysisId,
        result: cacheValidation.data,
        cached: true,
      });
    }
  }

  const ai = getAIService(env);

  const footageResult = await analyzeFootageIds(footageIds, env, ai);
  if (!footageResult.ok) {
    return apiError(
      ApiErrorCode.AnalysisFailed,
      "Failed to analyze one or more clips",
      502,
      footageResult.error
    );
  }

  const musicResult = musicId
    ? await analyzeMusic({ musicId, env, ai })
    : undefined;

  if (musicResult && !musicResult.ok) {
    return apiError(
      ApiErrorCode.AnalysisFailed,
      "Failed to analyze music",
      502,
      musicResult.error
    );
  }

  const analysisResult: AnalysisResult = {
    version: "1.0.0",
    projectId,
    timestamp: Date.now(),
    footage: footageResult.value,
    ...(musicResult?.ok ? { music: musicResult.value } : {}),
    ...(referenceId ? { referenceId } : {}),
  };

  const finalValidation = AnalysisResultSchema.safeParse(analysisResult);
  if (!finalValidation.success) {
    console.error("[analysis] Final AnalysisResult failed validation", {
      operation: "handleAnalyze",
      projectId,
      error: finalValidation.error,
    });

    return apiError(
      ApiErrorCode.ValidationFailed,
      "Analysis result failed validation",
      500
    );
  }

  const validAnalysis = finalValidation.data;
  const analysisId = crypto.randomUUID();

  storeAnalysisResult(analysisId, validAnalysis);

  const storeResult = await storeAnalysisInD1(env, analysisId, validAnalysis);
  if (!storeResult.ok) {
    return apiError(
      ApiErrorCode.DatabaseInsertFailed,
      "Failed to store analysis result",
      500,
      storeResult.error
    );
  }

  cacheAnalysis(footageIds, musicId, validAnalysis);

  return jsonResponse({
    success: true,
    analysisId,
    result: validAnalysis,
    cached: false,
  });
}

async function analyzeFootageIds(
  footageIds: string[],
  env: Env,
  ai: ReturnType<typeof getAIService>
): Promise<
  | { ok: true; value: FootageAnalysis[] }
  | { ok: false; error: { failures: ClipAnalysisFailure[] } }
> {
  if (footageIds.length === 0) {
    return { ok: true, value: [] };
  }

  const results = await runWithConcurrency(
    footageIds,
    MAX_FOOTAGE_ANALYZE_CONCURRENCY,
    async (clipId) => {
      const result = await analyzeClip({ clipId, env, ai });
      return { clipId, result };
    }
  );

  const footage: FootageAnalysis[] = [];
  const failures: ClipAnalysisFailure[] = [];

  for (const item of results) {
    if (item.result.ok) {
      footage.push(item.result.value);
    } else {
      failures.push({
        clipId: item.clipId,
        error: item.result.error,
      });
    }
  }

  if (failures.length > 0) {
    return { ok: false, error: { failures } };
  }

  return { ok: true, value: footage };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers: Promise<void>[] = Array.from({ length: workerCount }, runWorker);

  await Promise.all(workers);
  return results;
}

async function storeAnalysisInD1(
  env: Env,
  analysisId: string,
  analysis: AnalysisResult
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  if (!env?.DB) return { ok: true };

  try {
    const insertResult = await env.DB.prepare(
      `INSERT INTO analysis_results (id, project_id, analysis_data, created_at) 
       VALUES (?, ?, ?, ?)`
    )
      .bind(analysisId, analysis.projectId, JSON.stringify(analysis), Date.now())
      .run();

    return insertResult.success ? { ok: true } : { ok: false, error: "D1 insert failed" };
  } catch (error) {
    return { ok: false, error };
  }
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    return {
      ok: false,
      response: apiError(ApiErrorCode.InvalidRequest, "Invalid JSON body", 400),
    };
  }
}
