import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { getAIService } from "../services/ai-service";
import { replicateStyle, humanizeSkeleton } from "../director/style-replicator";
import { buildSourcePlan } from "../director/source-orchestrator";
import { compareReferenceTraceToEDL } from "../director/reference-similarity";
import { scoreNewPipelineEDL } from "../lib/edl-scoring";
import { enforceReferenceStyleOnEDL } from "../lib/reference-style-enforcer";
import { injectReferenceColorGrades } from "../lib/reference-color-injector";
import { enforceMotionContinuity } from "../director/shot-continuity";
import { ensureBeatLocksForMusic } from "../lib/edl-scoring";

const MAX_SIMILARITY_ATTEMPTS = 3;
const SIMILARITY_THRESHOLD = 0.65;

export async function handleReplicateStyle(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      referenceStyleId?: string;
      analysisId: string;
      targetDuration?: number;
      referenceMode?: "strict_replication" | "inspired";
      referenceStyle?: any;
      analysisData?: any;
      rhythmMap?: any;
    };

    const { projectId, referenceStyleId, analysisId, targetDuration: targetDur, referenceMode = "strict_replication", referenceStyle: clientRefStyle, analysisData, rhythmMap: clientRhythmMap } = body;

    // Resolve reference style
    let referenceStyle = clientRefStyle || null;
    if (!referenceStyle && referenceStyleId && env.DB) {
      try {
        const row = await env.DB.prepare("SELECT analysis_data FROM analysis_results WHERE id = ?").bind(referenceStyleId).first<{ analysis_data: string }>();
        if (row?.analysis_data) referenceStyle = JSON.parse(row.analysis_data);
      } catch { /* not found */ }
    }
    if (!referenceStyle) return apiError(ApiErrorCode.InvalidRequest, "referenceStyle is required", 400);

    // Resolve analysis
    let analysis = analysisData || null;
    if (!analysis && env.DB) {
      try {
        const row = await env.DB.prepare("SELECT analysis_data FROM analysis_results WHERE id = ?").bind(analysisId).first<{ analysis_data: string }>();
        if (row?.analysis_data) analysis = JSON.parse(row.analysis_data);
      } catch { /* not found */ }
    }
    if (!analysis) return apiError(ApiErrorCode.AnalysisNotFound, "Analysis not found", 404);

    const targetDuration = targetDur ?? analysis.music?.duration ?? 30;
    const rhythmMap = clientRhythmMap ?? referenceStyle.rhythmMap ?? null;

    // Build source plan
    const shotCount = Math.max(6, Math.round(targetDuration / referenceStyle.rhythm.avgShotDuration));
    const sourcePlan = buildSourcePlan(analysis, referenceStyle, shotCount);
    if (sourcePlan.length === 0) return apiError(ApiErrorCode.EDLGenerationFailed, "No source segments available", 500);

    const ai = getAIService(env);
    const effectiveTrace = referenceStyle?.referenceTrace ?? null;

    // Iterative refinement loop
    let bestEdl = null;
    let bestSimilarity = null;

    for (let attempt = 0; attempt < MAX_SIMILARITY_ATTEMPTS; attempt++) {
      let edl = replicateStyle({
        referenceStyle, analysis, sourcePlan, targetDuration, rhythmMap, fps: 30, createdAt: Date.now(), attemptIndex: attempt,
      });

      edl = await humanizeSkeleton(edl, referenceStyle, ai);

      edl = enforceReferenceStyleOnEDL(edl, referenceStyle, referenceMode);
      edl = injectReferenceColorGrades(edl, referenceStyle);
      edl = enforceMotionContinuity(edl);
      edl = ensureBeatLocksForMusic(edl, rhythmMap, { maxDriftMs: 70, strict: referenceMode === "strict_replication" });

      const similarity = effectiveTrace ? compareReferenceTraceToEDL(effectiveTrace, edl) : null;
      console.log(`[replicate-style] Attempt ${attempt + 1}: similarity=${similarity?.overall?.toFixed(3) ?? "N/A"}`);
      if (effectiveTrace) {
        console.log(`[replicate-style] Trace: shotDurations=${effectiveTrace.shotDurations?.length ?? 0}, events=${effectiveTrace.events?.length ?? 0}, avgShot=${effectiveTrace.avgShotDurationSec?.toFixed(3)}`);
      }

      if (!bestEdl || (similarity && (!bestSimilarity || similarity.overall > bestSimilarity.overall))) {
        bestEdl = edl;
        bestSimilarity = similarity;
      }

      if (!similarity || similarity.overall >= SIMILARITY_THRESHOLD) break;
    }

    if (!bestEdl) return apiError(ApiErrorCode.EDLGenerationFailed, "Style replication failed", 500);

    const musicForScore = analysis.music ?? { sourceId: "", duration: targetDuration, bpm: 120, beatGrid: [] };
    const scores = scoreNewPipelineEDL(bestEdl as any, musicForScore as any);

    const edlId = crypto.randomUUID();
    if (env.DB) {
      try {
        await env.DB.prepare("INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(edlId, projectId, JSON.stringify(bestEdl), scores.beatSyncScore, scores.pacingVariance, scores.overallConfidence, 0, "style-replication", Date.now()).run();
      } catch (e) { console.warn("[replicate-style] D1 insert failed:", (e as Error).message); }
    }

    return jsonResponse({ success: true, edlId, edl: bestEdl, scores, similarity: bestSimilarity, generationMode: "deterministic_replication", humanized: true });
  } catch (error: any) {
    console.error("[replicate-style] Error:", error);
    return apiError(ApiErrorCode.EDLGenerationFailed, error.message || "Style replication failed", 500);
  }
}
