// POST /api/generate-edl - Generate edit timeline from intent + analysis
// Phase 4: The AI director creates the actual edit

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type { MonetEDL } from "../types/edl";
import { EDL_JSON_SCHEMA } from "../types/edl";
import type { IntentExtractionResult } from "../types/intent";
import type { AnalysisResult } from "../types/analysis";
import type { ReferenceStyle } from "../types/reference-style";
import { normalizeReferenceStyle } from "../types/reference-style";
import { now } from "../types/env";
import { readFileSync } from "fs";
import { join } from "path";
import { generateDeterministicEDL } from "../lib/deterministic-edl";
import { getConfiguredGeminiModel } from "../services/model-config";
import { getAnalysisResult } from "../lib/analysis-store";
import { getOpenReelCapabilityContract } from "../lib/openreel-capabilities";
import { validateAndNormalizeAdvancedEDL } from "../lib/validate-advanced-edl";
import { enforceReferenceStyleOnEDL } from "../lib/reference-style-enforcer";

const GENERATE_TIMEOUT_MS = 45_000;

interface GenerateEDLRequest {
  projectId: string;
  intentId: string;
  analysisId: string;
  referenceStyle?: ReferenceStyle; // Optional: if user provided a reference video
  referenceMode?: "strict_replication" | "inspired";
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

    const normalizedReferenceStyle = body.referenceStyle
      ? normalizeReferenceStyle(body.referenceStyle)
      : undefined;

    // Generate EDL (LLM-enhanced with deterministic fallback)
    const ai = getAIService(env);
    const aiModel = getConfiguredGeminiModel(env);
    let edl: MonetEDL;
    let usedFallback = false;

    try {
      // Try LLM-enhanced generation first
      edl = await generateEDL(
        intent,
        analysis,
        ai,
        normalizedReferenceStyle,
        body.referenceMode ?? (normalizedReferenceStyle ? "strict_replication" : "inspired")
      );

      // Add metadata
      edl.metadata = {
        title: `Edit for ${body.projectId}`,
        createdAt: Date.now(),
        aiModel,
        prompt: intent.intent.goal.primary,
        intentId: body.intentId,
        analysisId: body.analysisId,
      };

      if (normalizedReferenceStyle) {
        edl = enforceReferenceStyleOnEDL(
          edl,
          normalizedReferenceStyle,
          body.referenceMode ?? "strict_replication"
        );
      }
    } catch (error) {
      console.error("LLM EDL generation failed, using deterministic fallback:", error);

      // FALLBACK: Deterministic EDL (no LLM dependency)
      edl = generateDeterministicEDL(intent, analysis, {
        intentId: body.intentId,
        analysisId: body.analysisId,
        projectId: body.projectId,
      });

      if (normalizedReferenceStyle) {
        edl = enforceReferenceStyleOnEDL(
          edl,
          normalizedReferenceStyle,
          body.referenceMode ?? "strict_replication"
        );
      }

      usedFallback = true;
    }

    // Score the EDL
    edl = ensureBeatLocksForMusic(edl);
    const scores = scoreEDL(edl, analysis, intent);

    // Store EDL in D1 (if DB available)
    const edlId = env?.DB
      ? await storeEDL(env.DB, body.projectId, body.intentId, body.analysisId, edl, scores, aiModel)
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
  ai: ReturnType<typeof getAIService>,
  referenceStyle?: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired" = "inspired"
): Promise<MonetEDL> {
  // Load prompt template
  const promptTemplate = loadPromptTemplate("generate-edl.txt");

  // Build reference director section — the secret sauce
  const referenceSection = referenceStyle
    ? buildReferenceDirectorSection(
        referenceStyle,
        referenceMode,
        intent.intent.structure.duration
      )
    : "";
  const openreelContract = getOpenReelCapabilityContract();

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
${referenceSection}
${openreelContract}
## Your Task

Based on the intent and analysis above, generate a complete EDL (Edit Decision List).

Target duration: ${intent.intent.structure.duration} seconds
Pacing: ${intent.intent.style.pacing}
Mood: ${intent.intent.style.mood.join(", ")}
Beat sync: ${intent.intent.technical.syncToBeat ? "REQUIRED" : "Optional"}
${intent.intent.technical.syncToBeat ? `Beat sync strength: ${intent.intent.technical.beatSyncStrength}` : ""}
Reference replication mode: ${referenceStyle ? referenceMode : "none"}

Generate the EDL now.
`;

  const fullPrompt = promptTemplate + "\n\n" + contextPrompt;

  // Call AI service with JSON mode
  const edlData = await withTimeout(
    ai.generateContentJSON<Partial<MonetEDL>>({
      prompt: fullPrompt,
      temperature: 0.8, // Higher temp for creative choices
      schema: EDL_JSON_SCHEMA,
    }),
    GENERATE_TIMEOUT_MS,
    "EDL generation timed out"
  );

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

/**
 * Build the "Reference Director" section injected into the EDL generation prompt.
 *
 * This is what makes Monet actually edit LIKE that creator.
 * We convert the analyzed ReferenceStyle into concrete, imperative
 * instructions that override Gemini's defaults and force it to think
 * like the reference editor — not generically.
 *
 * Philosophy: give Gemini the editor's CONTRACT, not just their numbers.
 */
function buildReferenceDirectorSection(
  rs: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired",
  targetDurationSec: number
): string {
  const im = rs.intentMapping;
  const ph = rs.editingPhilosophy;
  const sl = rs.shotLanguage;
  const pa = rs.pacing;
  const ef = rs.effects;
  const em = rs.emotionalArc;

  // Energy curve as human-readable description
  const curveDesc = pa.energyCurve
    .map((v, i) => `${i * 10}%: ${v >= 0.8 ? "🔥 intense" : v >= 0.5 ? "➡️ moderate" : "💧 calm"} (${v.toFixed(1)})`)
    .join(", ");

  const replicationContract = buildReferenceReplicationContract(
    rs,
    referenceMode,
    targetDurationSec
  );

  return `

## REFERENCE DIRECTOR STYLE — OVERRIDE DEFAULTS WITH THIS

You have analyzed a reference video from a specific editor. You must edit like THEM, not generically.
Deviate from this only if the footage physically cannot support it.

### The Editor's Philosophy

"${ph.summary}"

Their rhythm contract: "${ph.rhythmContract}"

Restraint level: ${ph.restraintLevel} (${
  ph.restraintLevel === "minimal"
      ? "hold back — silence and negative space are intentional"
      : ph.restraintLevel === "heavy"
      ? "maximum stimulation — every frame has purpose and energy"
      : "balanced — controlled intensity, not maximalist"
  })

Their signature move: ${ph.signatureMove}

### Concrete Rules You MUST Follow

**Shot timing**:
- Average shot duration: **${im.avgShotDuration.toFixed(1)}s** (hard target — measure your output)
- Vary by ±${Math.round(rs.rhythm.avgShotDuration * 0.3 * 10) / 10}s around that center
- Pacing type: ${im.pacing}

**Beat sync**:
- Cut alignment: **${rs.rhythm.cutAlignment}** (${
    rs.rhythm.cutAlignment === "strict"
      ? "EVERY cut must land within 50ms of a beat grid point"
      : rs.rhythm.cutAlignment === "loose"
      ? "cuts near beats preferred but can anticipate or delay by up to 200ms"
      : "ignore beat grid — this editor cuts for visual rhythm, not musical"
  })
- Beats per cut ratio: ${rs.rhythm.beatsPerCut.toFixed(1)} beats between cuts on average

**Energy curve** — your edit's energy must match this shape:
${curveDesc}
- Climax position: ${Math.round(pa.climaxPosition * 100)}% through the video
${pa.breathingMoments.length > 0 ? `- Breathing moments (deliberate slowdowns): around ${pa.breathingMoments.map(t => `${t.toFixed(1)}s`).join(", ")}` : ""}

**Shot selection — what this editor chooses**:
- Subject focus: ${sl.subjectFocus.join(", ")} (prioritize footage segments showing THESE subjects)
- Closeup ratio: ${Math.round(sl.closeupRatio * 100)}% of shots should be closeups
- Camera motion preference: ${sl.motionPreference === "moving" ? "favor footage with camera movement" : sl.motionPreference === "static" ? "favor static, composed shots" : "mix of moving and static"}
- Sequence grammar to apply: ${sl.sequencePatterns.length > 0 ? sl.sequencePatterns.join(", ") : "no specific sequence pattern required"}

**Effects**:
- ${Math.round(ef.effectsFrequency * 100)}% of shots should have an effect
- Effects used by this editor: ${ef.commonEffects.length > 0 ? ef.commonEffects.join(", ") : "minimal effects"}
- Transitions: ${Math.round(ef.transitionsBreakdown.cutPercentage * 100)}% cuts / ${Math.round(ef.transitionsBreakdown.crossfadePercentage * 100)}% crossfades / ${Math.round(ef.transitionsBreakdown.otherPercentage * 100)}% other

**Visual style**:
- Color grade: ${im.colorTreatment}
- Color temperature: ${rs.visualStyle.colorTemperature}
- Contrast: ${rs.visualStyle.contrastLevel}

**Emotional architecture**:
- Open with: ${em.openingMood} energy
- Peak at: ${em.peakMood}
- Close with: ${em.closingMood}
- Overall arc: ${em.emotionalContour}

### aiRationale Instructions

Write each shot's aiRationale the way THIS editor would think.
- Reference their philosophy: why would THEY choose this moment?
- Be specific: "This closeup of [action] at the ${Math.round(pa.climaxPosition * 100)}% climax point mirrors the reference editor's signature move of ${ph.signatureMove.toLowerCase()}"
- Not generic: never write "high motion score" — write what a human editor would say

${replicationContract}

---
`;
}

function buildReferenceReplicationContract(
  rs: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired",
  targetDurationSec: number
): string {
  const transitionCuts = Math.round(rs.effects.transitionsBreakdown.cutPercentage * 100);
  const transitionCrossfades = Math.round(
    rs.effects.transitionsBreakdown.crossfadePercentage * 100
  );
  const effectsFrequency = Math.round(rs.effects.effectsFrequency * 100);
  const targetShots = Math.max(1, Math.round(targetDurationSec / rs.rhythm.avgShotDuration));
  const strict = referenceMode === "strict_replication";

  return `
### Reference Replication Contract (${referenceMode})

Apply the reference to new footage as a structural clone, not a content clone.
Never copy specific frames/shots from the reference source; map the same editing logic onto available footage.

${strict ? "STRICT REQUIREMENTS (hard constraints):" : "INSPIRED REQUIREMENTS (soft constraints):"}
- Target shot count around ${targetShots} (duration ${targetDurationSec.toFixed(1)}s / avg shot ${rs.rhythm.avgShotDuration.toFixed(2)}s)
- Keep average shot duration within ${strict ? "±15%" : "±30%"} of ${rs.rhythm.avgShotDuration.toFixed(2)}s
- Keep transition mix near ${transitionCuts}% cuts and ${transitionCrossfades}% crossfades (${strict ? "±8pp" : "±15pp"} tolerance)
- Keep effects frequency near ${effectsFrequency}% of shots (${strict ? "±8pp" : "±15pp"} tolerance)
- Match macro energy curve and climax timing at ${Math.round(rs.pacing.climaxPosition * 100)}% timeline position
- Preserve subject focus priorities: ${rs.shotLanguage.subjectFocus.join(", ") || "none"}

Deliverable behavior:
- If reference says strict beat alignment, lock cuts to beats wherever musically possible.
- If footage quality or coverage is insufficient, degrade gracefully and explain deviations in aiRationale.
- In strict mode, prioritize preserving reference rhythm over adding extra novelty.
`;
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

  // Music exists but no beat locks means sync metadata is missing.
  if (beatLockedShots === 0) return 0;

  return hits / beatLockedShots;
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
        targetAudience: { platform: "youtube" },
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
  const inMemory = getAnalysisResult(analysisId);
  if (inMemory) {
    return inMemory;
  }

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

/**
 * Store EDL in D1
 */
async function storeEDL(
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
