// POST /api/decode-intent - Extract creative intent from user prompt
// THE MOAT - This is what makes Monet a creative intelligence system

import { z } from "zod";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type { IntentExtractionResult } from "../types/intent";
import { INTENT_JSON_SCHEMA } from "../types/intent";
import { now } from "../types/env";
import { getCachedIntent, cacheIntent } from "../lib/intent-cache";
import type { ReferenceStyle } from "../types/reference-style";
import { normalizeReferenceStyle } from "../types/reference-style";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { withRetry } from "../lib/retry";
import { loadPromptTemplate } from "../prompts";
import { ensureCompleteIntent } from "../services/intent-service";

const DecodeIntentRequestSchema = z.object({
  prompt: z.string().min(1).max(10000),
  projectId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  context: z
    .object({
      hasMusic: z.boolean().optional(),
      hasFootage: z.boolean().optional(),
      hasReference: z.boolean().optional(),
      estimatedFootageDuration: z.number().optional(),
      referenceStyle: z.unknown().optional(),
    })
    .optional(),
}).refine(
  (data) => !!(data.projectId || data.threadId),
  { message: "Either projectId or threadId is required" }
);

const UpdateIntentRequestSchema = z.object({
  intentId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

const SimplifiedIntentSchema = z.object({
  version: z.string().optional(),
  goal: z.object({
    primary: z.string(),
  }),
  style: z.object({
    genre: z.string().optional(),
    pacing: z.enum(["slow", "medium", "fast", "aggressive"]),
    mood: z.array(z.string()).optional(),
  }),
  structure: z.object({
    duration: z.number(),
    energyCurve: z.array(z.number()),
  }),
  technical: z.object({
    syncToBeat: z.boolean(),
    beatSyncStrength: z.number(),
    transitionStyle: z.enum(["cut", "smooth", "dynamic"]),
    colorTreatment: z.string(),
    effectsIntensity: z.number(),
  }),
  contentPreferences: z.object({
    focusOn: z.array(z.string()),
  }),
});

type SimplifiedIntent = z.infer<typeof SimplifiedIntentSchema>;

function parseSimplifiedIntent(raw: string):
  | { ok: true; value: SimplifiedIntent }
  | { ok: false; error: unknown } {
  try {
    const parsed: unknown = JSON.parse(raw);
    const validation = SimplifiedIntentSchema.safeParse(parsed);

    if (!validation.success) {
      return {
        ok: false,
        error: validation.error,
      };
    }

    return {
      ok: true,
      value: validation.data,
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

/**
 * Extract creative intent from user prompt
 *
 * This is THE differentiator. Not templates. Not presets. Creative understanding.
 *
 * Flow:
 * 1. User provides natural language prompt
 * 2. Gemini extracts structured creative intent
 * 3. Generates clarifying questions if confidence < 0.7
 * 4. Stores intent in D1 for refinement reuse
 * 5. Returns intent + questions to frontend
 */
export async function handleDecodeIntent(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const validation = DecodeIntentRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid intent request",
        400,
        validation.error
      );
    }

    const { prompt, context: rawContext } = validation.data;
    const projectId = validation.data.projectId || validation.data.threadId!;

    // Check cache first (THE COST SAVER)
    const cached = getCachedIntent(prompt);
    if (cached) {
      console.info("🚀 Intent cache hit - skipping Gemini call");
      return jsonResponse({
        success: true,
        intentId: `cached-${Date.now()}`,
        result: cached,
        cached: true,
      });
    }

    // Load intent extraction prompt template (bundled)
    const promptTemplate = loadPromptTemplate("decode-intent.txt");

    // Build context string
    const normalizedReferenceStyle = rawContext?.referenceStyle
      ? normalizeReferenceStyle(rawContext.referenceStyle)
      : undefined;

    const normalizedContext = rawContext
      ? {
          ...rawContext,
          referenceStyle: normalizedReferenceStyle,
        }
      : undefined;

    const contextStr = buildContextString(normalizedContext);

    // Replace placeholders
    const fullPrompt = promptTemplate
      .replace("{USER_PROMPT}", prompt)
      .replace("{CONTEXT}", contextStr);

    // Call AI service (Vertex or Gemini) with JSON mode for structured output
    const ai = getAIService(env);

    const systemInstruction =
      "You are Monet, an AI video director. Extract creative intent from user prompts with professional editor instincts.";

    // Use the SDK's JSON mode
    const rawResult = await withRetry(() =>
      ai.generateContentJSON<IntentExtractionResult>({
        prompt: fullPrompt,
        systemInstruction,
        temperature: 0.7,
        schema: INTENT_JSON_SCHEMA,
      })
    );
    const result = ensureCompleteIntent(rawResult);

    // Validate confidence threshold
    if (result.confidence < 0.3) {
      return apiError(
        ApiErrorCode.IntentDecodeFailed,
        "Unable to understand prompt. Please provide more details about what you want to create.",
        400
      );
    }

    // Cache successful intent
    cacheIntent(prompt, result);

    // Store intent in database (if DB available)
    const intentId = env?.DB
      ? await storeIntent(env.DB, projectId, prompt, result)
      : `intent-${Date.now()}`;

    // Return result
    return jsonResponse({
      success: true,
      intentId,
      result,
      cached: false,
    });
  } catch (error) {
    console.error("Decode intent error:", error);
    return apiError(
      ApiErrorCode.IntentDecodeFailed,
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
}

/**
 * Build context string from uploaded media info
 */
function buildContextString(context?: {
  hasMusic?: boolean;
  hasFootage?: boolean;
  hasReference?: boolean;
  estimatedFootageDuration?: number;
  referenceStyle?: ReferenceStyle;
}): string {
  if (!context) {
    return "No media uploaded yet.";
  }

  const parts: string[] = [];

  if (context.hasMusic) {
    parts.push("- User has uploaded a music track (beat sync is likely desired)");
  }

  if (context.hasFootage) {
    if (context.estimatedFootageDuration) {
      parts.push(
        `- User has uploaded footage (approximately ${Math.round(context.estimatedFootageDuration)}s total)`
      );
    } else {
      parts.push("- User has uploaded footage");
    }
  }

  if (context.hasReference && !context.referenceStyle) {
    parts.push(
      "- User has provided a reference video (match this style/pacing)"
    );
  }

  if (context.referenceStyle) {
    const rs = context.referenceStyle;
    const im = rs.intentMapping;
    parts.push("- User has provided a REFERENCE VIDEO that has been analyzed. Replicate this editing style:");
    parts.push(`  Genre: ${im.genre}`);
    parts.push(`  Pacing: ${im.pacing} (avg shot ${im.avgShotDuration.toFixed(1)}s)`);
    parts.push(`  Beat sync: ${im.syncToBeat ? `YES (strength: ${im.beatSyncStrength})` : "no"}`);
    parts.push(`  Color treatment: ${im.colorTreatment}`);
    parts.push(`  Effects intensity: ${im.effectsIntensity}`);
    parts.push(`  Transition style: ${im.transitionStyle}`);
    parts.push(`  Mood: ${im.mood.join(", ")}`);
    parts.push(`  Editor's philosophy: "${rs.editingPhilosophy.summary}"`);
    parts.push(`  Rhythm contract: "${rs.editingPhilosophy.rhythmContract}"`);
    parts.push("  IMPORTANT: The user wants the final edit to FEEL like this reference. Use these values as strong priors when extracting intent.");
  }

  return parts.length > 0
    ? "Media context:\n" + parts.join("\n")
    : "No media uploaded yet";
}

/**
 * Store intent in D1 database
 */
async function storeIntent(
  db: D1Database,
  projectId: string,
  userPrompt: string,
  result: IntentExtractionResult
): Promise<string> {
  const intentId = crypto.randomUUID();

  // Ensure the project exists in the projects table first (satisfies foreign key constraint)
  await db
    .prepare(
      `INSERT INTO projects (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    )
    .bind(projectId, "Untitled Project", now(), now())
    .run();

  const intentToStore = {
    ...result.intent,
    pillarWeights: result.pillarWeights,
    directorParams: result.directorParams,
  };

  await db
    .prepare(
      `INSERT INTO edit_intents (
        id, project_id, version, user_prompt, intent_data,
        confidence, has_clarifying_questions, clarifying_questions, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      intentId,
      projectId,
      result.intent.version,
      userPrompt,
      JSON.stringify(intentToStore),
      result.confidence,
      result.clarifyingQuestions && result.clarifyingQuestions.length > 0 ? 1 : 0,
      result.clarifyingQuestions
        ? JSON.stringify(result.clarifyingQuestions)
        : null,
      now()
    )
    .run();

  return intentId;
}

/**
 * Update intent with user's answers to clarifying questions
 */
export async function handleUpdateIntent(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const validation = UpdateIntentRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid update intent request",
        400,
        validation.error
      );
    }

    const { intentId, answers } = validation.data;

    const result = await env.DB.prepare(
      "SELECT intent_data, user_prompt FROM edit_intents WHERE id = ?"
    )
      .bind(intentId)
      .first<{ intent_data: string; user_prompt: string }>();

    if (!result) {
      return apiError(ApiErrorCode.IntentNotFound, "Intent not found", 404);
    }

    const originalIntentResult = parseSimplifiedIntent(result.intent_data);
    if (!originalIntentResult.ok) {
      console.error("[intent/update] Stored intent failed validation", {
        operation: "handleUpdateIntent",
        intentId,
        error: originalIntentResult.error,
      });

      return apiError(
        ApiErrorCode.ValidationFailed,
        "Stored intent is invalid",
        500
      );
    }

    const refinedIntent = applyAnswersToIntent(
      originalIntentResult.value,
      answers
    );

    await env.DB.prepare(
      "UPDATE edit_intents SET intent_data = ?, has_clarifying_questions = 0, clarifying_questions = NULL WHERE id = ?"
    )
      .bind(JSON.stringify(refinedIntent), intentId)
      .run();

    return jsonResponse({
      success: true,
      intent: refinedIntent,
    });
  } catch (error) {
    console.error("[intent/update] Update intent failed", {
      operation: "handleUpdateIntent",
      error,
    });

    return apiError(
      ApiErrorCode.IntentUpdateFailed,
      "Failed to update intent",
      500
    );
  }
}

/**
 * Apply user answers to refine intent.
 */
function applyAnswersToIntent(
  intent: SimplifiedIntent,
  answers: Record<string, string>
): SimplifiedIntent {
  const refined: SimplifiedIntent = structuredClone(intent);

  for (const [question, answer] of Object.entries(answers)) {
    if (question.includes("action") || question.includes("emotional")) {
      if (answer.includes("Action")) {
        refined.contentPreferences.focusOn = [
          "action_scenes",
          "dynamic_movement",
        ];
        refined.style.pacing = "aggressive";
      } else if (answer.includes("Emotional")) {
        refined.contentPreferences.focusOn = [
          "emotional_moments",
          "face_closeups",
        ];
        refined.style.pacing = "medium";
      }
    }

    if (question.includes("pacing")) {
      if (answer.includes("Fast")) {
        refined.style.pacing = "fast";
      } else if (answer.includes("Slow")) {
        refined.style.pacing = "slow";
      }
    }
  }

  return refined;
}
