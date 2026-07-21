import { z } from "zod";
import { analyzeVideo } from "../lib/analysis-engine.js";
import { compileIntent, type ClipManifest } from "@monet/intent-compiler/compiler";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const SYSTEM_PROMPT = `You are an expert video editor. You receive:
1. An Edit DNA JSON describing a reference video's editing patterns
2. A manifest of available clips (user's footage)
3. A user prompt describing what they want

Your job: produce an OperationPlan — a list of structured operations that the rendering engine can execute.

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

const PipelineSchema = z.object({
  filePath: z.string().min(1),
  clipPaths: z.array(z.string()).min(1),
  prompt: z.string().min(1),
  type: z.enum(["reference", "footage"]).default("reference"),
  fps: z.number().min(0.5).max(30).default(3),
});

export async function handlePipeline(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = PipelineSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid request",
        400,
        parsed.error.flatten(),
      );
    }

    // Step 1: Analyze reference video
    const analysis = await analyzeVideo(env, {
      filePath: parsed.data.filePath,
      fps: parsed.data.fps,
      type: parsed.data.type,
    });

    if (!analysis.ok) {
      return apiError(
        ApiErrorCode.AnalysisFailed,
        `Analysis failed: ${analysis.error}`,
        500,
      );
    }

    // Step 2: Build clip manifest from clip paths
    const manifest: ClipManifest = {
      clips: parsed.data.clipPaths.map((path, i) => ({
        id: `clip-${i}`,
        filePath: path,
        duration_s: 10,
        resolution: { width: 1920, height: 1080 },
        content_tags: [],
      })),
    };

    // Step 3: Compile intent via AI
    const ai = getAIService(env);

    const callLLM = async (systemPrompt: string, userMessage: string): Promise<string> => {
      const result = await ai.run("pipeline", {
        systemPrompt,
        prompt: userMessage,
        maxTokens: 4096,
      });
      if (!result.raw) {
        throw new Error("Empty LLM response");
      }
      return result.raw;
    };

    const compiled = await compileIntent(
      analysis.value,
      manifest,
      parsed.data.prompt,
      callLLM,
      SYSTEM_PROMPT,
    );

    if (!compiled.ok) {
      return apiError(
        ApiErrorCode.InternalError,
        `Compilation failed: ${compiled.error}`,
        500,
      );
    }

    return jsonResponse({
      success: true,
      data: {
        editDNA: analysis.value,
        operationPlan: compiled.value,
      },
    });
  } catch (err) {
    return apiError(
      ApiErrorCode.InternalError,
      err instanceof Error ? err.message : "Unknown error",
      500,
    );
  }
}
