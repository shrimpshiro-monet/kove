// POST /api/decode-intent - Extract creative intent from user prompt
// THE MOAT - This is what makes Monet a creative intelligence system

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type {
  IntentExtractionResult,
  SimplifiedIntent,
} from "../types/intent";
import { INTENT_JSON_SCHEMA } from "../types/intent";
import { now } from "../types/env";
import { readFileSync } from "fs";
import { join } from "path";
import { getCachedIntent, cacheIntent } from "../lib/intent-cache";
import type { ReferenceStyle } from "../types/reference-style";
import { normalizeReferenceStyle } from "../types/reference-style";

interface DecodeIntentRequest {
  prompt: string;
  projectId: string;
  context?: {
    hasMusic?: boolean;
    hasFootage?: boolean;
    hasReference?: boolean;
    estimatedFootageDuration?: number;
    referenceStyle?: ReferenceStyle;
  };
}

interface DecodeIntentResponse {
  success: boolean;
  intentId?: string;
  result?: IntentExtractionResult;
  error?: string;
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
    const workerEnvKeys = env ? Object.keys(env) : [];
    const processHasGeminiKey =
      typeof process !== "undefined" ? !!process.env.GEMINI_API_KEY : false;
    const processHasGcpProjectId =
      typeof process !== "undefined" ? !!process.env.GCP_PROJECT_ID : false;

    console.log("AI env sources:", {
      workerEnvPresent: !!env,
      workerEnvKeys,
      workerHasGeminiKey: !!env?.GEMINI_API_KEY,
      workerHasGcpProjectId: !!env?.GCP_PROJECT_ID,
      processHasGeminiKey,
      processHasGcpProjectId,
      runtimeSource:
        env && workerEnvKeys.length > 0 ? "worker-bindings" : "process.env/local-dev",
    });

    const body: DecodeIntentRequest = await request.json();

    // Validate input
    if (!body.prompt || !body.projectId) {
      return jsonResponse(
        { success: false, error: "Missing prompt or projectId" },
        400
      );
    }

    // Check cache first (THE COST SAVER)
    const cached = getCachedIntent(body.prompt);
    if (cached) {
      console.log("🚀 Intent cache hit - skipping Gemini call");
      return jsonResponse({
        success: true,
        intentId: `cached-${Date.now()}`,
        result: cached,
        cached: true,
      });
    }

    // Load intent extraction prompt template
    const promptTemplate = loadPromptTemplate("decode-intent.txt");

    // Build context string
    const normalizedContext =
      body.context?.referenceStyle
        ? {
            ...body.context,
            referenceStyle: normalizeReferenceStyle(body.context.referenceStyle),
          }
        : body.context;
    const context = buildContextString(normalizedContext);

    // Replace placeholders
    const fullPrompt = promptTemplate
      .replace("{USER_PROMPT}", body.prompt)
      .replace("{CONTEXT}", context);

    // Call AI service (Vertex or Gemini) with JSON mode for structured output
    const ai = getAIService(env);

    const systemInstruction =
      "You are Monet, an AI video director. Extract creative intent from user prompts with professional editor instincts.";

    // Use the SDK's JSON mode - much cleaner!
    const result: IntentExtractionResult = await ai.generateContentJSON({
      prompt: fullPrompt,
      systemInstruction,
      temperature: 0.7,
      schema: INTENT_JSON_SCHEMA,
    });

    // Validate confidence threshold
    if (result.confidence < 0.3) {
      return jsonResponse(
        {
          success: false,
          error:
            "Unable to understand prompt. Please provide more details about what you want to create.",
        },
        400
      );
    }

    // Cache successful intent (THE REAL MOAT)
    cacheIntent(body.prompt, result);

    // Store intent in database (if DB available)
    const intentId = env?.DB
      ? await storeIntent(env.DB, body.projectId, body.prompt, result)
      : `intent-${Date.now()}`; // Fallback ID for dev without DB bindings

    // Return result
    return jsonResponse({
      success: true,
      intentId,
      result,
      cached: false,
    });
  } catch (error) {
    console.error("Decode intent error:", error);
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
 * Load prompt template from file
 */
function loadPromptTemplate(filename: string): string {
  try {
    // In production/Cloudflare Workers, prompts should be bundled
    // For now, read from filesystem
    const path = join(process.cwd(), "src", "server", "prompts", filename);
    return readFileSync(path, "utf-8");
  } catch (error) {
    console.error("Failed to load prompt template:", error);
    throw new Error(`Prompt template not found: ${filename}`);
  }
}

/**
 * Build context string from uploaded media info
 */
function buildContextString(context?: DecodeIntentRequest["context"]): string {
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
      JSON.stringify(result.intent),
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
    const body = (await request.json()) as {
      intentId?: string;
      answers?: Record<string, string>;
    };
    const { intentId, answers } = body;

    if (!intentId || !answers) {
      return jsonResponse(
        { success: false, error: "Missing intentId or answers" },
        400
      );
    }

    // Fetch original intent
    const result = await env.DB.prepare(
      "SELECT intent_data, user_prompt FROM edit_intents WHERE id = ?"
    )
      .bind(intentId)
      .first<{ intent_data: string; user_prompt: string }>();

    if (!result) {
      return jsonResponse({ success: false, error: "Intent not found" }, 404);
    }

    const originalIntent: SimplifiedIntent = JSON.parse(result.intent_data);

    // Apply answers to refine intent
    // This is a simplified version - in production, would use Gemini to interpret answers
    const refinedIntent = applyAnswersToIntent(originalIntent, answers);

    // Update in database
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
    console.error("Update intent error:", error);
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
 * Apply user answers to refine intent
 * In MVP, this is simple field updates
 * In production, could use Gemini to interpret answers
 */
function applyAnswersToIntent(
  intent: SimplifiedIntent,
  answers: Record<string, string>
): SimplifiedIntent {
  // Clone intent
  const refined = JSON.parse(JSON.stringify(intent)) as SimplifiedIntent;

  // Apply answers (simplified for MVP)
  // In production, would use JSONPath and smarter interpretation
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
