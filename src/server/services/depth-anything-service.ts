// Depth Anything V2 — monocular depth estimation
// Output: per-pixel depth map video (grayscale, near=bright, far=dark)

import type { Env } from "../types/env";
import { ReplicateClient } from "./replicate-client";
import {
  HuggingFaceClient,
  HuggingFaceRateLimited,
  HuggingFaceModelLoading,
} from "./huggingface-client";

const DEPTH_VERSION = "chenxwh/depth-anything-v2:4e3b07d2d22e7a7e95b80b1f8e9a8de5da0a8a9bb8cce03e8f5ea51e6e5fcfa3";

export interface DepthRequest {
  videoUrl: string;
  modelSize?: "small" | "base" | "large";
}

export interface DepthResult {
  depthVideoUrl: string;
  nearValue: number;
  farValue: number;
  cached: boolean;
}

import { hashKey } from "../lib/hash";

export async function extractDepth(
  env: Env,
  request: DepthRequest,
): Promise<DepthResult> {
  // Try HuggingFace first (free path) unless Replicate is explicitly requested
  const useReplicate = env.USE_REPLICATE === "true";
  if (!useReplicate) {
    return extractDepthHF(env, request);
  }

  const cacheKey = hashKey("depth", request);

  const kv = env.MONET_KV;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        return { ...JSON.parse(cached), cached: true };
      } catch (e) {
        console.warn("[depth] cache parse failed:", e);
      }
    }
  }

  const client = new ReplicateClient(env);

  const prediction = await client.runAndWait(
    {
      version: DEPTH_VERSION,
      input: {
        video: request.videoUrl,
        model_size: request.modelSize ?? "base",
        output_grayscale: true,
      },
    },
    { timeoutMs: 120_000 },
  );

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;

  if (!outputUrl || typeof outputUrl !== "string") {
    throw new Error("Depth Anything returned no output URL");
  }

  const r2Key = `depth/${cacheKey.replace(/[^a-z0-9]/gi, "_")}.mp4`;
  const persistedUrl = await client.persistToR2(env, outputUrl, r2Key, "video/mp4");

  const result: DepthResult = {
    depthVideoUrl: persistedUrl,
    nearValue: 255,
    farValue: 0,
    cached: false,
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch (e) {
      console.warn("[depth] cache write failed:", e);
    }
  }

  return result;
}

/**
 * HuggingFace fallback for depth estimation.
 * Uses Depth-Anything-V2-Small — free but rate-limited.
 */
export async function extractDepthHF(
  env: Env,
  request: DepthRequest,
): Promise<DepthResult> {
  const cacheKey = hashKey("depth_hf", request);

  const kv = env.MONET_KV;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        return { ...JSON.parse(cached), cached: true };
      } catch (e) {
        console.warn("[depth-hf] cache parse failed:", e);
      }
    }
  }

  const hf = new HuggingFaceClient(env);

  const videoResp = await fetch(request.videoUrl);
  if (!videoResp.ok) {
    throw new Error(`Failed to fetch video: ${videoResp.status}`);
  }
  const videoBytes = await videoResp.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(videoBytes).reduce((s, b) => s + String.fromCharCode(b), ""),
  );

  const result = await hf.runInference({
    model: "depth-anything/Depth-Anything-V2-Small-hf",
    inputs: { image: base64 },
  });

  const r2Bucket = env.MONET_MEDIA;
  let depthUrl = request.videoUrl;

  if (r2Bucket && result.data instanceof ArrayBuffer) {
    const r2Key = `depth_hf/${cacheKey.replace(/[^a-z0-9]/gi, "_")}.png`;
    await r2Bucket.put(r2Key, result.data, {
      httpMetadata: { contentType: "image/png" },
    });
    depthUrl = `/api/media/${r2Key}`;
  }

  const finalResult: DepthResult = {
    depthVideoUrl: depthUrl,
    nearValue: 255,
    farValue: 0,
    cached: false,
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(finalResult), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch (e) {
      console.warn("[depth-hf] cache write failed:", e);
    }
  }

  return finalResult;
}
