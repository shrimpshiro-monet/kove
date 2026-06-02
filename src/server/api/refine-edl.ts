// POST /api/refine-edl - Refine existing EDL based on user feedback
// Phase 9: The magical <3s iteration loop that proves Monet's core value

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type { MonetEDL } from "../types/edl";
import { EDL_JSON_SCHEMA } from "../types/edl";
import { now } from "../types/env";
import { readFileSync } from "fs";
import { join } from "path";
import { generateDeterministicEDL } from "../lib/deterministic-edl";
import { getCachedAnalysis } from "../lib/analysis-cache";
import { getCachedIntent } from "../lib/intent-cache";
import type { TimelineAnnotation } from "../types/annotation";
import type { ReferenceStyle } from "../types/reference-style";
import { normalizeReferenceStyle } from "../types/reference-style";
import { getConfiguredGeminiModel } from "../services/model-config";
import { getOpenReelCapabilityContract } from "../lib/openreel-capabilities";
import { validateAndNormalizeAdvancedEDL } from "../lib/validate-advanced-edl";
import { enforceReferenceStyleOnEDL } from "../lib/reference-style-enforcer";

const REFINE_TIMEOUT_MS = 30_000;

interface RefineEDLRequest {
  projectId: string;
  edlId: string;
  edl: MonetEDL;              // Current EDL (passed from client to skip DB lookup)
  feedback: string;           // Natural language: "faster cuts", "hit harder on drop"
  intentId?: string;
  analysisId?: string;
  /** Time-anchored per-shot instructions left by pausing the preview */
  annotations?: TimelineAnnotation[];
  /** Optional reference style DNA to preserve during refinement */
  referenceStyle?: ReferenceStyle;
  referenceMode?: "strict_replication" | "inspired";
}

interface TableInfoRow {
  name: string;
}

interface RefineEDLResponse {
  success: boolean;
  edlId?: string;
  edl?: MonetEDL;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  usedFallback?: boolean;
  error?: string;
}

/**
 * Refine an existing EDL based on natural language feedback.
 *
 * This is THE core product moment. Must complete in <5s.
 *
 * Key design:
 * - We pass the FULL current EDL + feedback to Gemini
 * - Gemini returns a MODIFIED EDL (not a new one from scratch)
 * - We NEVER re-run analysis (uses cached analysis)
 * - Deterministic fallback available if Gemini flakes
 */
export async function handleRefineEDL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: RefineEDLRequest = await request.json();

    const hasGlobalFeedback = !!body.feedback?.trim();
    const hasAnnotations = Array.isArray(body.annotations) && body.annotations.length > 0;
    if (!body.projectId || !body.edl || (!hasGlobalFeedback && !hasAnnotations)) {
      return jsonResponse(
        { success: false, error: "Missing projectId, edl, or feedback/annotations" },
        400
      );
    }

    const normalizedReferenceStyle = body.referenceStyle
      ? normalizeReferenceStyle(body.referenceStyle)
      : undefined;

    const ai = getAIService(env);
    const aiModel = getConfiguredGeminiModel(env);
    let refinedEDL: MonetEDL;
    let usedFallback = false;

    try {
      refinedEDL = await refineWithAI(
        body.edl,
        body.feedback ?? "",
        ai,
        body.annotations,
        normalizedReferenceStyle,
        body.referenceMode ?? (normalizedReferenceStyle ? "strict_replication" : "inspired")
      );
      if (normalizedReferenceStyle) {
        refinedEDL = enforceReferenceStyleOnEDL(
          refinedEDL,
          normalizedReferenceStyle,
          body.referenceMode ?? "strict_replication"
        );
      }
      refinedEDL.metadata = {
        ...refinedEDL.metadata,
        createdAt: Date.now(),
        aiModel,
        prompt: `REFINED: ${body.feedback ?? ""}${
          body.annotations?.length ? ` (+${body.annotations.length} annotation${body.annotations.length !== 1 ? "s" : ""})` : ""
        }`,
      };
    } catch (error) {
      console.error("AI refinement failed, using deterministic fallback:", error);
      refinedEDL = applyDeterministicRefinement(body.edl, body.feedback ?? "", body.annotations);
      if (normalizedReferenceStyle) {
        refinedEDL = enforceReferenceStyleOnEDL(
          refinedEDL,
          normalizedReferenceStyle,
          body.referenceMode ?? "strict_replication"
        );
      }
      usedFallback = true;
    }

    // Score the refined EDL
    const scores = scoreEDL(refinedEDL);

    // Backfill beat locks when music exists but no lock metadata came back.
    refinedEDL = ensureBeatLocksForMusic(refinedEDL);

    // Store updated EDL in D1 (best-effort so a DB mismatch doesn't block editing UX)
    let newEdlId = `edl-refined-${Date.now()}`;
    if (env?.DB) {
      try {
        newEdlId = await storeRefinedEDL(
          env.DB,
          body.projectId,
          refinedEDL,
          body.edlId,
          body.intentId,
          body.analysisId,
          scores,
          usedFallback,
          body.feedback ?? null
        );
      } catch (storeError) {
        console.error("Failed to persist refined EDL, returning in-memory result", {
          projectId: body.projectId,
          previousEdlId: body.edlId,
          error: storeError,
        });
      }
    }

    return jsonResponse({
      success: true,
      edlId: newEdlId,
      edl: refinedEDL,
      scores,
      usedFallback,
    });
  } catch (error) {
    console.error("Refine EDL error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
}

/**
 * Use Gemini to intelligently refine the EDL based on feedback
 */
async function refineWithAI(
  currentEDL: MonetEDL,
  feedback: string,
  ai: ReturnType<typeof getAIService>,
  annotations?: TimelineAnnotation[],
  referenceStyle?: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired" = "inspired"
): Promise<MonetEDL> {
  const promptTemplate = loadPromptTemplate("refine-edl.txt");
  const openreelContract = getOpenReelCapabilityContract();
  const referenceSection = referenceStyle
    ? buildReferenceRefinementSection(referenceStyle, referenceMode, currentEDL.timeline.duration)
    : "";

  const annotationSection =
    annotations && annotations.length > 0
      ? `\n## Time-Anchored Annotations\n\nThe user paused the preview and left these per-shot instructions. Apply them SURGICALLY — modify ONLY the referenced shot (and immediately adjacent shots if flow requires it). Do NOT apply these globally to other shots.\n\n${annotations
          .map(
            (a, i) =>
              `${i + 1}. At ${a.timestamp.toFixed(2)}s — Shot id="${a.shotId}" (#${a.shotIndex + 1} of ${currentEDL.shots.length}): "${a.text}"`
          )
          .join("\n")}\n`
      : "";

  const contextPrompt = `
## Current EDL

${JSON.stringify(currentEDL, null, 2)}

## Global Feedback

"${feedback || "(none — apply annotations only)"}"
${annotationSection}
${referenceSection}
${openreelContract}
## Your Task

Modify the EDL above based on the feedback and any annotations. Return the complete modified EDL.

Key rules:
- Preserve the total duration (${currentEDL.timeline.duration}s)
- Keep the same clip IDs (clipId values in source fields)
- Maintain beat sync where applicable
- Annotations take priority over global feedback for their referenced shot
- Apply global feedback normally to all shots NOT mentioned in annotations
- Include aiRationale on each modified shot explaining the change
- Preserve reference DNA if a reference section is provided
`;

  const fullPrompt = promptTemplate + "\n\n" + contextPrompt;

  const edlData = await withTimeout(
    ai.generateContentJSON<Partial<MonetEDL>>({
      prompt: fullPrompt,
      temperature: 0.6,
      schema: EDL_JSON_SCHEMA,
    }),
    REFINE_TIMEOUT_MS,
    "EDL refinement timed out"
  );

  // Preserve music track from original (Gemini sometimes drops it)
  if (!edlData.music && currentEDL.music) {
    edlData.music = currentEDL.music;
  }

  // Preserve timeline from original
  edlData.timeline = currentEDL.timeline;

  return validateAndNormalizeAdvancedEDL(edlData as MonetEDL);
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

function buildReferenceRefinementSection(
  rs: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired",
  totalDurationSec: number
): string {
  const targetAvg = rs.rhythm.avgShotDuration;
  const targetShots = Math.max(1, Math.round(totalDurationSec / targetAvg));
  const transitionCuts = Math.round(rs.effects.transitionsBreakdown.cutPercentage * 100);
  const effectsFrequency = Math.round(rs.effects.effectsFrequency * 100);
  const strict = referenceMode === "strict_replication";

  return `
## Reference Replication Guardrails (${referenceMode})

Maintain the reference editor DNA while applying user feedback.
This means preserving structure/style statistics on new footage, not copying source reference frames.

Targets to preserve:
- Average shot duration near ${targetAvg.toFixed(2)}s (${strict ? "±15%" : "±30%"})
- Approximate shot count near ${targetShots}
- Cut ratio around ${transitionCuts}% (${strict ? "±8pp" : "±15pp"})
- Effects frequency around ${effectsFrequency}% (${strict ? "±8pp" : "±15pp"})
- Climax near ${Math.round(rs.pacing.climaxPosition * 100)}% of timeline
- Subject focus priority: ${rs.shotLanguage.subjectFocus.join(", ") || "none"}

If user feedback conflicts with these constraints:
- strict_replication: preserve reference DNA first, then apply feedback as far as possible.
- inspired: prioritize feedback, keep reference feel where possible.
`;
}

/**
 * Rule-based EDL refinement as fallback when AI is unavailable.
 * Handles the most common refinement patterns deterministically.
 */
function applyDeterministicRefinement(
  edl: MonetEDL,
  feedback: string,
  annotations?: TimelineAnnotation[]
): MonetEDL {
  const f = feedback.toLowerCase();
  const refinedShots = edl.shots.map((shot) => ({ ...shot }));

  // Annotation pre-pass: surgical per-shot changes before global rules
  if (annotations && annotations.length > 0) {
    for (const annotation of annotations) {
      const idx = refinedShots.findIndex((s) => s.id === annotation.shotId);
      if (idx === -1) continue;
      const af = annotation.text.toLowerCase();
      const shot = refinedShots[idx];
      if (af.match(/zoom/)) {
        shot.effects = [...(shot.effects ?? []), { type: "zoom_pulse" as const, intensity: 0.6 }];
      }
      if (af.match(/glow/)) {
        shot.effects = [...(shot.effects ?? []), { type: "glow" as const, intensity: 0.5 }];
      }
      if (af.match(/shake/)) {
        shot.effects = [...(shot.effects ?? []), { type: "shake" as const, intensity: 0.4 }];
      }
      if (af.match(/slow.?mo|slow down/)) {
        shot.timing = { ...shot.timing, speed: 0.5, duration: shot.timing.duration * 1.8 };
      }
      if (af.match(/faster|cut shorter|shorter/)) {
        shot.timing = { ...shot.timing, duration: shot.timing.duration * 0.65 };
      }
      if (af.match(/longer|hold longer/)) {
        shot.timing = { ...shot.timing, duration: shot.timing.duration * 1.4 };
      }
      if (af.match(/clean|no effect|remove effect/)) {
        shot.effects = [];
      }
      shot.aiRationale = `Annotated at ${annotation.timestamp.toFixed(1)}s: "${annotation.text}"`;
    }
    // If no global feedback, return annotation-only result
    if (!f.trim()) {
      return { ...edl, shots: refinedShots };
    }
  }

  // "faster cuts" / "faster" / "speed up" / "more cuts"
  if (f.match(/faster|speed up|more cuts|quick/)) {
    const factor = 0.65;
    let timeline = 0;
    for (const shot of refinedShots) {
      shot.timing = {
        ...shot.timing,
        duration: shot.timing.duration * factor,
        startTime: timeline,
      };
      timeline += shot.timing.duration;
    }
    // Trim timeline if longer than original
    const maxEnd = edl.timeline.duration;
    const filtered = refinedShots.filter((s) => s.timing.startTime < maxEnd);
    return { ...edl, shots: filtered };
  }

  // "slower" / "more breathing room" / "slow down"
  if (f.match(/slower|slow down|breathing room|relaxed/)) {
    const factor = 1.4;
    let timeline = 0;
    const limit = edl.timeline.duration;
    const result: typeof refinedShots = [];
    for (const shot of refinedShots) {
      if (timeline >= limit) break;
      const newDur = Math.min(shot.timing.duration * factor, limit - timeline);
      result.push({
        ...shot,
        timing: { ...shot.timing, duration: newDur, startTime: timeline },
      });
      timeline += newDur;
    }
    return { ...edl, shots: result };
  }

  // "more effects" / "more energy" / "more intense"
  if (f.match(/more effect|more energy|more intense|harder|heavier/)) {
    return {
      ...edl,
      shots: refinedShots.map((shot) => ({
        ...shot,
        effects: [
          ...(shot.effects || []),
          { type: "shake" as const, intensity: 0.3 },
          { type: "glow" as const, intensity: 0.4 },
        ],
      })),
    };
  }

  // "less effects" / "cleaner" / "simpler"
  if (f.match(/less effect|clean|simpler|minimal/)) {
    return {
      ...edl,
      shots: refinedShots.map((shot) => ({
        ...shot,
        effects: [],
      })),
    };
  }

  // "hit harder on the drop" / "bigger climax" / "more impact"
  if (f.match(/drop|climax|impact|hit hard/)) {
    const midpoint = Math.floor(refinedShots.length * 0.6);
    return {
      ...edl,
      shots: refinedShots.map((shot, i) => {
        if (i >= midpoint) {
          return {
            ...shot,
            timing: {
              ...shot.timing,
              duration: shot.timing.duration * 0.6,
            },
            effects: [
              ...(shot.effects || []),
              { type: "shake" as const, intensity: 0.5 },
            ],
          };
        }
        return shot;
      }),
    };
  }

  // No recognized pattern — return unchanged but update rationale
  return {
    ...edl,
    shots: refinedShots.map((shot) => ({
      ...shot,
      aiRationale: shot.aiRationale
        ? `${shot.aiRationale} (refined: ${feedback})`
        : `Refined: ${feedback}`,
    })),
  };
}

function scoreEDL(edl: MonetEDL): {
  beatSyncScore: number;
  pacingVariance: number;
  overallConfidence: number;
} {
  let beatSyncScore = 1.0;
  if (edl.music && edl.music.beatGrid.length > 0) {
    const beatGrid = edl.music.beatGrid;
    const threshold = 0.05;
    let hits = 0;
    const beatLocked = edl.shots.filter((s) => s.beatLock);
    for (const shot of beatLocked) {
      const beatTime = beatGrid[shot.beatLock!.beatIndex];
      if (beatTime !== undefined && Math.abs(shot.timing.startTime - beatTime) < threshold) {
        hits++;
      }
    }
    beatSyncScore = beatLocked.length > 0 ? hits / beatLocked.length : 0;
  }

  const durations = edl.shots.map((s) => s.timing.duration);
  let pacingVariance = 0.5;
  if (durations.length >= 2) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((s, d) => s + (d - mean) ** 2, 0) / durations.length;
    pacingVariance = Math.min(Math.sqrt(variance) / mean / 0.5, 1.0);
  }

  return {
    beatSyncScore: Math.round(beatSyncScore * 100) / 100,
    pacingVariance: Math.round(pacingVariance * 100) / 100,
    overallConfidence: Math.round((beatSyncScore * 0.5 + pacingVariance * 0.5) * 100) / 100,
  };
}

function ensureBeatLocksForMusic(edl: MonetEDL): MonetEDL {
  const beatGrid = edl.music?.beatGrid;
  if (!beatGrid || beatGrid.length === 0 || edl.shots.length === 0) {
    return edl;
  }

  const hasAnyBeatLock = edl.shots.some((shot) => !!shot.beatLock);
  if (hasAnyBeatLock) {
    return edl;
  }

  const shots = edl.shots.map((shot) => {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < beatGrid.length; i++) {
      const dist = Math.abs(beatGrid[i] - shot.timing.startTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return {
      ...shot,
      beatLock: {
        beatIndex: bestIdx,
        lockMode: "start" as const,
      },
    };
  });

  return {
    ...edl,
    shots,
  };
}

async function storeRefinedEDL(
  db: D1Database,
  projectId: string,
  edl: MonetEDL,
  previousEdlId: string,
  intentId?: string,
  analysisId?: string,
  scores?: { beatSyncScore: number; pacingVariance: number; overallConfidence: number },
  usedFallback?: boolean,
  feedbackText?: string | null
): Promise<string> {
  const edlId = crypto.randomUUID();

  const tableInfo = await db.prepare("PRAGMA table_info(edls)").all<TableInfoRow>();
  const columnNames = new Set((tableInfo.results || []).map((row) => row.name));
  const hasLegacyColumns = columnNames.has("edl_data") && columnNames.has("intent_id");

  if (hasLegacyColumns) {
    const previous = await db
      .prepare("SELECT intent_id, analysis_id FROM edls WHERE id = ?")
      .bind(previousEdlId)
      .first<{ intent_id: string | null; analysis_id: string | null }>();

    const resolvedIntentId = intentId ?? previous?.intent_id;
    if (!resolvedIntentId) {
      throw new Error("Cannot persist refined EDL: missing intent_id for legacy edls schema");
    }

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
        resolvedIntentId,
        analysisId ?? previous?.analysis_id ?? null,
        edl.version || "1.0.0",
        JSON.stringify(edl),
        scores?.beatSyncScore ?? null,
        scores?.pacingVariance ?? null,
        scores?.overallConfidence ?? null,
        "gemini-2.0-flash",
        now()
      )
      .run();
    return edlId;
  }

  await db
    .prepare(
      `INSERT INTO edls (
        id, project_id, version, data, previous_edl_id,
        beat_sync_score, pacing_variance, overall_confidence,
        used_fallback, feedback_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      edlId,
      projectId,
      Number.parseInt(edl.version || "1", 10) || 1,
      JSON.stringify(edl),
      previousEdlId,
      scores?.beatSyncScore ?? null,
      scores?.pacingVariance ?? null,
      scores?.overallConfidence ?? null,
      usedFallback ? 1 : 0,
      feedbackText,
      now()
    )
    .run();

  return edlId;
}

function loadPromptTemplate(filename: string): string {
  try {
    const path = join(process.cwd(), "src", "server", "prompts", filename);
    return readFileSync(path, "utf-8");
  } catch {
    return "You are Monet, a professional AI video editor.";
  }
}

function jsonResponse(data: unknown, status = 200): Response {
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
