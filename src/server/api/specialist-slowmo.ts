// POST /api/specialist/slowmo

import type { Env } from "../types/env";
import { interpolateFrames } from "../services/rife-service";

export async function handleSpecialistSlowmo(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json() as any;
    const userTier = (request.headers.get("X-User-Tier") ?? "free").toLowerCase();

    if (!body.videoUrl) {
      return jsonResponse({ success: false, error: "videoUrl required" }, 400);
    }

    const result = await interpolateFrames(env, {
      videoUrl: body.videoUrl,
      targetFps: body.targetFps,
      interpolationFactor: body.interpolationFactor,
    });

    // If FFmpeg fallback used and user is free, suggest upgrade for true RIFE
    const usingFallback = (result as any).useFFmpegFilter === true;
    return jsonResponse({
      success: true,
      ...result,
      ...(usingFallback && userTier === "free" && {
        upgradeCta: {
          headline: "Pro slow-mo unlocked",
          body: "Free tier uses fast frame interpolation. Pro tier uses RIFE AI for cinematic smoothness.",
          action: "Try Pro slow-mo",
          url: "/pricing",
          currentTier: userTier,
        },
      }),
    });
  } catch (err: any) {
    return jsonResponse(
      { success: false, error: err.message ?? "Slowmo failed" },
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
