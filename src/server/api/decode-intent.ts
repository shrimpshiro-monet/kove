// POST /api/decode-intent - Extract creative intent from user prompt
// Fix 4: Uses Cerebras Llama 3.3 70B with JSON mode, sub-1s response

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const INTENT_SYSTEM =
  "You decode user prompts into structured editing intent. " +
  "Return ONLY valid JSON matching the Intent schema. Be specific about style, energy, pacing, mood. " +
  "If the prompt is vague, infer reasonable defaults — do not return empty arrays for required fields.";

export async function handleDecodeIntent(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      prompt: string;
      projectId?: string;
      threadId?: string;
      referenceStyleId?: string;
    };

    const prompt = body.prompt;
    const projectId = body.projectId || body.threadId || "default";

    if (!prompt || prompt.length > 10_000) {
      return apiError(ApiErrorCode.InvalidRequest, "Invalid prompt", 400);
    }

    const ai = getAIService(env);

    // Intent schema — simplified for Cerebras JSON mode
    const intentSchema = {
      type: "object" as const,
      properties: {
        version: { type: "string" as const },
        goal: {
          type: "object" as const,
          properties: {
            primary: { type: "string" as const },
            targetDuration: { type: "number" as const },
            targetPlatform: {
              type: "string" as const,
              enum: ["tiktok", "reels", "shorts", "youtube", "general"] as const,
            },
          },
          required: ["primary"] as const,
        },
        style: {
          type: "object" as const,
          properties: {
            descriptors: { type: "array" as const, items: { type: "string" as const } },
            energy: { type: "string" as const, enum: ["low", "medium", "high", "extreme"] as const },
            pacing: { type: "string" as const, enum: ["slow", "medium", "fast", "frantic"] as const },
            mood: { type: "string" as const },
          },
          required: ["descriptors", "energy", "pacing", "mood"] as const,
        },
        constraints: {
          type: "object" as const,
          properties: {
            mustInclude: { type: "array" as const, items: { type: "string" as const } },
            mustAvoid: { type: "array" as const, items: { type: "string" as const } },
          },
        },
        referenceStyleId: { type: "string" as const },
      },
      required: ["version", "goal", "style"] as const,
    };

    const result = await ai.run("decode-intent", {
      systemPrompt: INTENT_SYSTEM,
      prompt:
        `User prompt: "${prompt}"` +
        (body.referenceStyleId
          ? `\nReference style ID: ${body.referenceStyleId}`
          : ""),
      schema: undefined, // Use raw JSON mode for Cerebras
      schemaJSON: intentSchema as Record<string, unknown>,
      maxTokens: 1024,
    });

    if (!result.schemaValid) {
      return apiError(
        ApiErrorCode.IntentDecodeFailed,
        "Intent schema validation failed",
        422,
        { raw: result.raw.slice(0, 500) }
      );
    }

    const intent = result.data as any;
    if (body.referenceStyleId) intent.referenceStyleId = body.referenceStyleId;

    const intentId = crypto.randomUUID();
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO edit_intents (id, project_id, version, user_prompt, intent_data, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            intentId,
            projectId,
            intent.version || "1.0.0",
            prompt,
            JSON.stringify(intent),
            0.8,
            Date.now()
          )
          .run();
      } catch (e) {
        console.warn("[decode-intent] D1 insert failed:", (e as Error).message);
      }
    }

    return jsonResponse({
      success: true,
      intentId,
      intent,
    });
  } catch (error: any) {
    console.error("[decode-intent] Error:", error);
    return apiError(
      ApiErrorCode.InternalError,
      error.message || "Intent decode failed",
      500
    );
  }
}

/**
 * Update intent with user's answers to clarifying questions.
 * Stub — preserves backward compat with server.ts imports.
 */
export async function handleUpdateIntent(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      intentId: string;
      answers: Record<string, string>;
    };

    if (!body.intentId || !body.answers) {
      return apiError(ApiErrorCode.InvalidRequest, "intentId and answers required", 400);
    }

    if (!env.DB) {
      return apiError(ApiErrorCode.InternalError, "DB not available", 500);
    }

    const row = await env.DB.prepare(
      "SELECT intent_data FROM edit_intents WHERE id = ?"
    )
      .bind(body.intentId)
      .first<{ intent_data: string }>();

    if (!row) {
      return apiError(ApiErrorCode.IntentNotFound, "Intent not found", 404);
    }

    const intent = JSON.parse(row.intent_data);

    // Apply answers to style
    for (const [question, answer] of Object.entries(body.answers)) {
      if (question.includes("pacing")) {
        if (answer.toLowerCase().includes("fast")) intent.style.pacing = "fast";
        else if (answer.toLowerCase().includes("slow")) intent.style.pacing = "slow";
      }
    }

    await env.DB.prepare(
      "UPDATE edit_intents SET intent_data = ? WHERE id = ?"
    )
      .bind(JSON.stringify(intent), body.intentId)
      .run();

    return jsonResponse({ success: true, intent });
  } catch (error: any) {
    return apiError(
      ApiErrorCode.IntentUpdateFailed,
      error.message || "Failed to update intent",
      500
    );
  }
}
