// POST /api/specialist/depth

import type { Env } from "../types/env";
import { extractDepth } from "../services/depth-anything-service";
import {
  HuggingFaceRateLimited,
  HuggingFaceModelLoading,
} from "../services/huggingface-client";
import { markQueueBusy } from "../services/queue-status";

export async function handleSpecialistDepth(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as { videoUrl?: string; modelSize?: "small" | "base" | "large" };
    const userTier = (request.headers.get("X-User-Tier") ?? "free").toLowerCase();

    if (!body.videoUrl) {
      return jsonResponse({ success: false, error: "videoUrl required" }, 400);
    }

    try {
      const result = await extractDepth(env, {
        videoUrl: body.videoUrl,
        modelSize: body.modelSize,
      });
      return jsonResponse({ success: true, ...result });
    } catch (err: any) {
      if (err instanceof HuggingFaceRateLimited || err.name === "HuggingFaceRateLimited") {
        await markQueueBusy(env, err.retryAfterSec ?? 30);
        return jsonResponse({
          success: false,
          error: "Depth queue at capacity",
          code: "QUEUE_FULL",
          upgradeReason: "free_queue_full",
          retryAfterSec: err.retryAfterSec ?? 30,
          upgradeCta: {
            headline: "Depth AI is busy",
            body: "Upgrade to Pro for instant depth maps + cinematic focus.",
            action: "Upgrade to Pro",
            url: "/pricing",
            currentTier: userTier,
          },
        }, 429);
      }
      if (err instanceof HuggingFaceModelLoading || err.name === "HuggingFaceModelLoading") {
        return jsonResponse({
          success: false,
          error: "Model warming",
          code: "MODEL_LOADING",
          retryAfterSec: err.estimatedTimeSec ?? 20,
        }, 503);
      }
      throw err;
    }
  } catch (err: any) {
    return jsonResponse(
      { success: false, error: err.message ?? "Depth failed" },
      500,
    );
  }
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
