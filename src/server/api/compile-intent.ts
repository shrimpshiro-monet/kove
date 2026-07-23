import { z } from "zod";
import { compileIntent, type ClipManifest } from "@monet/intent-compiler/compiler";
import { validateEditDNA } from "@monet/edit-dna";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const SYSTEM_PROMPT = `You are an expert video editor. You receive:
1. An Edit DNA JSON describing a reference video's editing patterns
2. A manifest of available clips (user's footage)
3. A user prompt describing what they want

Your job: produce an OperationPlan — a list of structured operations that Jalebi Advanced's rendering engine can execute.

RULES:
- You ONLY emit operations from this list: place_clip, apply_speed, apply_transition, apply_color, apply_effect
- You NEVER emit pixels, raw effect code, or render decisions
- Every place_clip operation must reference a clip_id from the manifest
- Clip durations must not exceed the available clip duration
- The sum of all place_clip durations must approximately match the target duration
- Apply speed changes via SpeedCurve (keyframes with time_s and speed multiplier)
- Apply transitions between consecutive clips
- Apply color effects as global grade (not per-clip)

OUTPUT: Valid JSON matching the OperationPlan schema. No markdown fences, no explanation, just JSON.`;

const CompileIntentSchema = z.object({
  editDNA: z.unknown(),
  manifest: z.object({
    clips: z.array(
      z.object({
        id: z.string(),
        filePath: z.string(),
        duration_s: z.number(),
        resolution: z.object({ width: z.number(), height: z.number() }),
        content_tags: z.array(z.string()).optional(),
      })
    ),
  }),
  prompt: z.string().min(1),
});

export async function handleCompileIntent(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = CompileIntentSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid request",
        400,
        parsed.error.flatten(),
      );
    }

    const dnaValidation = validateEditDNA(parsed.data.editDNA);
    if (!dnaValidation.ok) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid Edit DNA",
        400,
        { details: dnaValidation.error.message },
      );
    }

    const ai = getAIService(env);

    const callLLM = async (systemPrompt: string, userMessage: string): Promise<string> => {
      const result = await ai.run("compile-intent", {
        systemPrompt,
        prompt: userMessage,
        maxTokens: 4096,
      });
      if (!result.raw) {
        throw new Error("Empty LLM response");
      }
      return result.raw;
    };

    const manifest: ClipManifest = parsed.data.manifest;

    const result = await compileIntent(
      dnaValidation.value,
      manifest,
      parsed.data.prompt,
      callLLM,
      SYSTEM_PROMPT,
    );

    if (!result.ok) {
      return apiError(
        ApiErrorCode.InternalError,
        result.error,
        500,
      );
    }

    return jsonResponse({ success: true, data: result.value });
  } catch (err) {
    return apiError(
      ApiErrorCode.InternalError,
      err instanceof Error ? err.message : "Unknown error",
      500,
    );
  }
}
