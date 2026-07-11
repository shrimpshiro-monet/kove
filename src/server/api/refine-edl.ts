import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { scoreNewPipelineEDL } from "../lib/edl-scoring";
import { apiError, ApiErrorCode } from "../lib/api-response";
import { z } from "zod";

const EDLSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  timeline: z.object({
    duration: z.number(),
    tracks: z.array(z.any()),
    markers: z.array(z.any()).optional(),
  }),
  assets: z.object({ media: z.record(z.string(), z.any()) }).optional(),
  music: z.any().optional(),
});

const REFINE_SYSTEM =
  "You refine an existing EDL based on user feedback. " +
  "Return the COMPLETE updated EDL as JSON matching the EDL schema. Preserve shot ids when possible. " +
  'If feedback is vague, ask a clarifying question by returning {"clarification":"..."} instead of an EDL.';

export async function handleRefineEDL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      edlId?: string;
      edl: any;
      feedback: string;
    };

    const { projectId, edl, feedback } = body;
    if (!edl || !feedback) {
      return apiError(ApiErrorCode.InvalidRequest, "edl and feedback are required", 400);
    }

    const ai = getAIService(env);
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25_000);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = (obj: any) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        let accumulated = "";

        try {
          for await (const chunk of ai.runStream({
            systemPrompt: REFINE_SYSTEM,
            prompt:
              `Current EDL:\n${JSON.stringify(edl)}\n\n` +
              `User feedback: "${feedback}"\n\nReturn updated EDL JSON.`,
            maxTokens: 6144,
            signal: abortController.signal,
          })) {
            accumulated += chunk;
            enc({ chunk });
          }
          clearTimeout(timeoutId);

          let parsed: any;
          try {
            const trimmed = accumulated.trim();
            const match = trimmed.match(/```json?\s*([\s\S]*?)```/);
            parsed = JSON.parse(match ? match[1] : trimmed);
          } catch {
            enc({ error: "PARSE_FAILED", message: "AI returned invalid JSON" });
            controller.close();
            return;
          }

          if (parsed.clarification) {
            enc({ clarification: parsed.clarification });
            controller.close();
            return;
          }

          const validation = EDLSchema.safeParse(parsed);
          if (!validation.success) {
            enc({
              error: "SCHEMA_INVALID",
              message: validation.error.message.slice(0, 500),
            });
            controller.close();
            return;
          }

          let scores: any = null;
          try {
            scores = scoreNewPipelineEDL(parsed, parsed.music ?? edl.music);
          } catch (e) {
            enc({ error: "SCORE_FAILED", message: (e as Error).message });
          }

          const edlId = crypto.randomUUID();
          let persisted = true;
          if (env.DB) {
            try {
              await env.DB.prepare(
                `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
                .bind(
                  edlId,
                  projectId,
                  JSON.stringify(parsed),
                  scores?.beatSyncScore ?? null,
                  scores?.pacingVariance ?? null,
                  scores?.overallConfidence ?? null,
                  0,
                  feedback,
                  Date.now()
                )
                .run();
            } catch (e) {
              persisted = false;
              console.warn("[refine-edl] D1 insert failed:", (e as Error).message);
            }
          }

          enc({
            done: true,
            edlId,
            edl: parsed,
            scores,
            persisted,
            generationMode: "ai_director",
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          clearTimeout(timeoutId);
          enc({ error: "REFINE_FAILED", message: (err as Error).message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[refine-edl] Error:", error);
    return apiError(
      ApiErrorCode.EDLGenerationFailed,
      error.message || "Refine failed",
      500
    );
  }
}
