// RIFE — Real-Time Intermediate Flow Estimation
// Generates new intermediate frames between source frames for smooth slow-mo.

import type { Env } from "../types/env";
import { ReplicateClient } from "./replicate-client";

const RIFE_VERSION = "zsxkib/rife-video-frame-interpolation:e731f6e8a7d62a8ce28aebcf9c8d40c3c5e8b29b8e6a9f0a1d8f7e6c5b4a3928";

export interface RIFERequest {
  videoUrl: string;
  targetFps?: number;
  interpolationFactor?: number;
}

export interface RIFEResult {
  smoothVideoUrl: string;
  originalFps: number;
  newFps: number;
  cached: boolean;
}

function hashKey(prefix: string, payload: unknown): string {
  const str = JSON.stringify(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${prefix}:${h.toString(36)}`;
}

export async function interpolateFrames(
  env: Env,
  request: RIFERequest,
): Promise<RIFEResult> {
  // Try HuggingFace/free path first unless Replicate is explicitly requested
  const useReplicate = (env as any).USE_REPLICATE === "true";
  if (!useReplicate) {
    return interpolateFramesFFmpeg(env, request);
  }

  const cacheKey = hashKey("rife", request);

  const kv = (env as any).MONET_KV;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        return { ...JSON.parse(cached), cached: true };
      } catch {}
    }
  }

  const client = new ReplicateClient(env);

  const prediction = await client.runAndWait(
    {
      version: RIFE_VERSION,
      input: {
        video: request.videoUrl,
        target_fps: request.targetFps ?? 60,
        interpolation_factor: request.interpolationFactor ?? 2,
      },
    },
    { timeoutMs: 180_000 },
  );

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;

  if (!outputUrl || typeof outputUrl !== "string") {
    throw new Error("RIFE returned no output URL");
  }

  const r2Key = `slowmo/${cacheKey.replace(/[^a-z0-9]/gi, "_")}.mp4`;
  const persistedUrl = await client.persistToR2(env, outputUrl, r2Key, "video/mp4");

  const result: RIFEResult = {
    smoothVideoUrl: persistedUrl,
    originalFps: 30,
    newFps: request.targetFps ?? 60,
    cached: false,
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch {}
  }

  return result;
}

/**
 * FFmpeg-native frame interpolation fallback.
 * Uses minterpolate filter — not as smooth as RIFE but free and serverless.
 * Returns the SAME video URL with a flag indicating the EDL should add
 * the minterpolate filter at render time.
 */
export async function interpolateFramesFFmpeg(
  env: Env,
  request: RIFERequest,
): Promise<RIFEResult & { useFFmpegFilter: true }> {
  // For FFmpeg path, we DON'T pre-render. We attach a filter directive
  // that the FFmpeg renderer picks up at export time.
  return {
    smoothVideoUrl: request.videoUrl,
    originalFps: 30,
    newFps: request.targetFps ?? 60,
    cached: false,
    useFFmpegFilter: true as const,
  };
}
