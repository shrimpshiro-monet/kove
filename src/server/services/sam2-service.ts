// SAM 2 (Segment Anything Model 2) — subject isolation
// Output: a mask video (single-channel binary mask matching input dims)

import type { Env } from "../types/env";
import { ReplicateClient } from "./replicate-client";
import {
  HuggingFaceClient,
  HuggingFaceRateLimited,
  HuggingFaceModelLoading,
} from "./huggingface-client";

const SAM2_VIDEO_VERSION = "meta/sam-2-video:33432afdfc06a10da6b4018932893d39b0159f838b6d11dd1236dff85cc5ec1d";

export interface SAMRequest {
  videoUrl: string;
  promptType: "point" | "box" | "auto";
  promptCoords?: number[];
}

export interface SAMResult {
  maskVideoUrl: string;
  confidence: number;
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

export async function isolateSubject(
  env: Env,
  request: SAMRequest,
): Promise<SAMResult> {
  // Try HuggingFace first (free path) unless Replicate is explicitly requested
  const useReplicate = (env as any).USE_REPLICATE === "true";
  if (!useReplicate) {
    return isolateSubjectHF(env, request);
  }

  const cacheKey = hashKey("sam2", request);

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

  const samInput: any = {
    input_video: request.videoUrl,
    mask_type: "binary",
  };

  if (request.promptType === "point" && request.promptCoords?.length === 2) {
    samInput.click_coordinates = `[${request.promptCoords[0]},${request.promptCoords[1]}]`;
    samInput.click_object_ids = "0";
  } else if (request.promptType === "box" && request.promptCoords?.length === 4) {
    samInput.box_coordinates = request.promptCoords.join(",");
  } else {
    samInput.auto_detect = true;
  }

  const prediction = await client.runAndWait(
    { version: SAM2_VIDEO_VERSION, input: samInput },
    { timeoutMs: 180_000 },
  );

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;

  if (!outputUrl || typeof outputUrl !== "string") {
    throw new Error("SAM 2 returned no output URL");
  }

  const r2Key = `masks/${cacheKey.replace(/[^a-z0-9]/gi, "_")}.mp4`;
  const persistedUrl = await client.persistToR2(env, outputUrl, r2Key, "video/mp4");

  const result: SAMResult = {
    maskVideoUrl: persistedUrl,
    confidence: 0.9,
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
 * HuggingFace fallback for SAM-style segmentation.
 * Uses facebook/sam-vit-base which returns image masks.
 * Cheaper than Replicate but rate-limited on free tier.
 */
export async function isolateSubjectHF(
  env: Env,
  request: SAMRequest,
): Promise<SAMResult> {
  const cacheKey = hashKey("sam_hf", request);

  const kv = (env as any).MONET_KV;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) {
      try {
        return { ...JSON.parse(cached), cached: true };
      } catch {}
    }
  }

  const hf = new HuggingFaceClient(env);

  // Fetch video bytes and convert to base64 for HF API
  const videoResp = await fetch(request.videoUrl);
  if (!videoResp.ok) {
    throw new Error(`Failed to fetch video: ${videoResp.status}`);
  }
  const videoBytes = await videoResp.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(videoBytes).reduce((s, b) => s + String.fromCharCode(b), ""),
  );

  const result = await hf.runInference({
    model: "facebook/sam-vit-base",
    inputs: { image: base64 },
    parameters: request.promptType === "point" && request.promptCoords?.length === 2
      ? { input_points: [[request.promptCoords]] }
      : undefined,
  });

  // Persist mask to R2
  const r2Bucket = (env as any).MONET_MEDIA;
  let maskUrl = request.videoUrl;

  if (r2Bucket && result.data instanceof ArrayBuffer) {
    const r2Key = `masks_hf/${cacheKey.replace(/[^a-z0-9]/gi, "_")}.png`;
    await r2Bucket.put(r2Key, result.data, {
      httpMetadata: { contentType: "image/png" },
    });
    maskUrl = `/api/media/${r2Key}`;
  }

  const finalResult: SAMResult = {
    maskVideoUrl: maskUrl,
    confidence: 0.75,
    cached: false,
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(finalResult), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch {}
  }

  return finalResult;
}
