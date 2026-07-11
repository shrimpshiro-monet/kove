import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { getAIService } from "../services/ai-service";
import { replicateStyle, humanizeSkeleton } from "../director/style-replicator";
import { buildSourcePlan } from "../director/source-orchestrator";
import { compareReferenceTraceToEDL } from "../director/reference-similarity";
import { scoreNewPipelineEDL } from "../lib/edl-scoring";
import { enforceReferenceStyleOnEDL } from "../lib/reference-style-enforcer";
import { enforceMotionContinuity } from "../director/shot-continuity";
import { ensureBeatLocksForMusic } from "../lib/edl-scoring";
import { compileReferenceGrammar, type ReferenceGrammar } from "../director/reference-grammar";
import { generateCandidates, rankCandidates, type CandidateEDL } from "../director/candidate-generator";
import { scoreCandidate, type MultiJudgeScore } from "../director/multi-judge";
import { createPatchPlan, applyPatchPlan } from "../director/patch-refiner";

const MAX_CANDIDATES = 6;
const MAX_PATCH_ATTEMPTS = 2;
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

    // ── Resolve inputs ──
    let referenceStyle = clientRefStyle || null;
    if (!referenceStyle && referenceStyleId && env.DB) {
      try {
        const row = await env.DB.prepare("SELECT analysis_data FROM analysis_results WHERE id = ?").bind(referenceStyleId).first<{ analysis_data: string }>();
        if (row?.analysis_data) referenceStyle = JSON.parse(row.analysis_data);
      } catch { /* not found */ }
    }
    if (!referenceStyle) return apiError(ApiErrorCode.InvalidRequest, "referenceStyle is required", 400);

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

    // ══════════════════════════════════════════════════════════════
    // PHASE 1: Compile Reference Grammar
    // ══════════════════════════════════════════════════════════════
    const grammar = compileReferenceGrammar(referenceStyle);
    const refTrace = (referenceStyle as any).referenceTrace;
    const shotDurs = refTrace?.shotDurations ?? [];
    console.log(`[replicate-style] Grammar: refShotCount=${grammar.topology.referenceShotCount}, traceShotDurations=${shotDurs.length}, shotDurs=${JSON.stringify(shotDurs.slice(0, 5))}, range=[${grammar.topology.minGeneratedShots}-${grammar.topology.maxGeneratedShots}], sections=${grammar.sections.length}`);

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: Build Source Plan (shot-count topology aware)
    // ══════════════════════════════════════════════════════════════
    const shotCount = Math.max(grammar.topology.minGeneratedShots, Math.round(targetDuration / referenceStyle.rhythm.avgShotDuration));
    const sourcePlan = buildSourcePlan(analysis, referenceStyle, Math.min(shotCount, grammar.topology.maxGeneratedShots));
    if (sourcePlan.length === 0) return apiError(ApiErrorCode.EDLGenerationFailed, "No source segments available", 500);

    const ai = getAIService(env);
    const effectiveTrace = referenceStyle?.referenceTrace ?? null;

    // ══════════════════════════════════════════════════════════════
    // PHASE 3: Generate Candidate EDLs
    // ══════════════════════════════════════════════════════════════
    const baseInput = {
      referenceStyle, analysis, sourcePlan, targetDuration, rhythmMap,
      fps: 30, createdAt: Date.now(),
    };

    let candidates = generateCandidates(baseInput, grammar, MAX_CANDIDATES);
    console.log(`[replicate-style] Generated ${candidates.length} candidates`);

    // Humanize only top 2 candidates (save Gemini calls), enforce all
    for (let i = 0; i < candidates.length; i++) {
      if (i < 2) {
        candidates[i].edl = await humanizeSkeleton(candidates[i].edl, referenceStyle, ai);
      }
      candidates[i].edl = enforceReferenceStyleOnEDL(candidates[i].edl, referenceStyle, referenceMode);
      candidates[i].edl = enforceMotionContinuity(candidates[i].edl);
      candidates[i].edl = ensureBeatLocksForMusic(candidates[i].edl, rhythmMap, { maxDriftMs: 70, strict: referenceMode === "strict_replication" });
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 4: Multi-Judge Scoring + Ranking
    // ══════════════════════════════════════════════════════════════
    const ranked = rankCandidates(candidates, grammar, effectiveTrace);

    console.log(`[replicate-style] Ranked candidates:`);
    for (const c of ranked) {
      console.log(`  ${c.strategy}: overall=${c.scores?.overall?.toFixed(3) ?? "N/A"}, structural=${c.scores?.structural?.shotCountTopology?.toFixed(2) ?? "?"}, editorial=${c.scores?.editorial?.hookStrength?.toFixed(2) ?? "?"}`);
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 5: Patch Refinement (surgical fixes)
    // ══════════════════════════════════════════════════════════════
    let bestCandidate = ranked[0];
    if (bestCandidate?.scores) {
      for (let patchRound = 0; patchRound < MAX_PATCH_ATTEMPTS; patchRound++) {
        const patchPlan = createPatchPlan(bestCandidate.edl, bestCandidate.scores, grammar);
        if (!patchPlan) break;

        console.log(`[replicate-style] Patch round ${patchRound + 1}: ${patchPlan.reason}`);
        const patched = applyPatchPlan(bestCandidate.edl, patchPlan);
        const rescored = scoreCandidate(patched, grammar, effectiveTrace);

        if (rescored.overall > (bestCandidate.scores?.overall ?? 0)) {
          bestCandidate = {
            ...bestCandidate,
            edl: patched,
            scores: rescored,
            strategyNotes: [...bestCandidate.strategyNotes, `Patched: ${patchPlan.reason}`],
          };
          console.log(`[replicate-style] Patch improved: ${(bestCandidate.scores?.overall ?? 0).toFixed(3)}`);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 6: Final Output
    // ══════════════════════════════════════════════════════════════
    const finalEdl = bestCandidate?.edl;
    if (!finalEdl) return apiError(ApiErrorCode.EDLGenerationFailed, "Style replication failed", 500);

    // Legacy similarity for backward compatibility
    const similarity = effectiveTrace ? compareReferenceTraceToEDL(effectiveTrace, finalEdl) : null;

    const musicForScore = analysis.music ?? { sourceId: "", duration: targetDuration, bpm: 120, beatGrid: [] };
    const scores = scoreNewPipelineEDL(finalEdl as any, musicForScore as any);

    const edlId = crypto.randomUUID();
    if (env.DB) {
      try {
        await env.DB.prepare("INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(edlId, projectId, JSON.stringify(finalEdl), scores.beatSyncScore, scores.pacingVariance, scores.overallConfidence, 0, "style-replication", Date.now()).run();
      } catch (e) { console.warn("[replicate-style] D1 insert failed:", (e as Error).message); }
    }

    return jsonResponse({
      success: true,
      edlId,
      edl: finalEdl,
      scores,
      similarity,
      multiJudgeScore: bestCandidate?.scores ?? null,
      candidateCount: candidates.length,
      winningStrategy: bestCandidate?.strategy ?? "unknown",
      strategyNotes: bestCandidate?.strategyNotes ?? [],
      generationMode: "generational_engine",
      humanized: true,
      grammar: {
        topology: grammar.topology,
        sections: grammar.sections.length,
        effects: grammar.effects.length,
        pacingShape: grammar.rhythm.pacingShape,
      },
    });
  } catch (error: any) {
    console.error("[replicate-style] Error:", error);
    return apiError(ApiErrorCode.EDLGenerationFailed, error.message || "Style replication failed", 500);
  }
}
