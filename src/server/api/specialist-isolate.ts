// POST /api/specialist/isolate

import type { Env } from "../types/env";
import { isolateSubject } from "../services/sam2-service";
import {
  HuggingFaceRateLimited,
  HuggingFaceModelLoading,
} from "../services/huggingface-client";
import { markQueueBusy } from "../services/queue-status";

export async function handleSpecialistIsolate(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json() as any;
    const userTier = (request.headers.get("X-User-Tier") ?? "free").toLowerCase();

    if (!body.videoUrl) {
      return jsonResponse({ success: false, error: "videoUrl required" }, 400);
    }

    try {
      const result = await isolateSubject(env, {
        videoUrl: body.videoUrl,
        promptType: body.promptType ?? "auto",
        promptCoords: body.promptCoords,
      });
      return jsonResponse({ success: true, ...result });
    } catch (err: any) {
      if (err instanceof HuggingFaceRateLimited || err.name === "HuggingFaceRateLimited") {
        await markQueueBusy(env, err.retryAfterSec ?? 30);
        return jsonResponse({
          success: false,
          error: "Free queue is at capacity",
          code: "QUEUE_FULL",
          upgradeReason: "free_queue_full",
          retryAfterSec: err.retryAfterSec ?? 30,
          upgradeCta: {
            headline: "Free AI queue is busy",
            body: "Upgrade to Pro for priority — your edits skip the line.",
            action: "Upgrade to Pro ($59/mo)",
            url: "/pricing",
            currentTier: userTier,
          },
        }, 429);
      }
      if (err instanceof HuggingFaceModelLoading || err.name === "HuggingFaceModelLoading") {
        return jsonResponse({
          success: false,
          error: "Model warming up",
          code: "MODEL_LOADING",
          retryAfterSec: err.estimatedTimeSec ?? 20,
          upgradeCta: {
            headline: "Model warming up",
            body: "Free AI takes a moment to spin up. Pro tier keeps models always-hot.",
            action: "Upgrade for instant edits",
            url: "/pricing",
            currentTier: userTier,
          },
        }, 503);
      }
      throw err;
    }
  } catch (err: any) {
    console.error("[specialist-isolate] error:", err);
    return jsonResponse(
      { success: false, error: err.message ?? "Isolation failed" },
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
