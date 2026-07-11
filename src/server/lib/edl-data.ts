import type { Env } from "../types/env";
import type { MonetEDL } from "../types/edl";
import type { AnalysisResult } from "../types/analysis";
import type { IntentExtractionResult } from "../types/intent";
import { getAnalysisResult } from "./analysis-store";
import { now } from "../types/env";

export async function fetchIntent(
  intentId: string,
  env: Env
): Promise<IntentExtractionResult | null> {
  if (!env?.DB) {
    console.warn("No DB binding - using mock intent");
    return {
      intent: {
        version: "1.0.0",
        goal: { primary: "Create aggressive anime AMV" },
        style: { genre: "anime_amv", pacing: "aggressive", mood: ["intense"] },
        structure: { duration: 30, energyCurve: Array(30).fill(0.8) },
        technical: {
          syncToBeat: true,
          beatSyncStrength: 0.9,
          transitionStyle: "cut",
          colorTreatment: "anime",
          effectsIntensity: 0.6,
        },
        contentPreferences: { focusOn: ["action", "closeups"] },
      },
      pillarWeights: { brutalistImpact: 0.8, tensionPivot: 0.4, vocalFlowSync: 0.5, legacyMontage: 0.1 },
      directorParams: { climaxPosition: 0.55, restraintLevel: "minimal", heroMomentCount: 3, crossClipBias: 0.8, effectBudget: 25 },
      confidence: 0.85,
      clarifyingQuestions: [],
      reasoning: "Mock intent for testing",
    };
  }

  const result = await env.DB.prepare(
    "SELECT intent_data, confidence FROM edit_intents WHERE id = ?"
  )
    .bind(intentId)
    .first<{ intent_data: string; confidence: number }>();

  if (!result) return null;

  const parsed = JSON.parse(result.intent_data);
  return {
    intent: parsed,
    pillarWeights: parsed.pillarWeights || { brutalistImpact: 0.5, tensionPivot: 0.2, vocalFlowSync: 0.1, legacyMontage: 0.2 },
    directorParams: parsed.directorParams || { climaxPosition: 0.65, restraintLevel: "moderate", heroMomentCount: 2, crossClipBias: 0.6 },
    confidence: result.confidence,
    clarifyingQuestions: [],
    reasoning: "Stored intent",
  };
}

export async function fetchAnalysis(
  analysisId: string,
  env: Env
): Promise<AnalysisResult | null> {
  const inMemory = getAnalysisResult(analysisId);
  if (inMemory) return inMemory;

  if (!env?.DB) {
    console.warn("No DB binding and no in-memory analysis found for:", analysisId);
    return null;
  }

  const result = await env.DB.prepare(
    "SELECT analysis_data FROM analysis_results WHERE id = ?"
  )
    .bind(analysisId)
    .first<{ analysis_data: string }>();

  if (!result) return null;
  return JSON.parse(result.analysis_data);
}

export async function storeEDL(
  db: D1Database,
  projectId: string,
  intentId: string,
  analysisId: string,
  edl: MonetEDL,
  scores: { beatSyncScore: number; pacingVariance: number; overallConfidence: number },
  aiModel: string
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
      aiModel,
      now()
    )
    .run();

  return edlId;
}
