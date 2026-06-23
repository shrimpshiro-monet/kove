// Client for the Monet AI Services GPU layer (Pro-tier specialists).
// Lives in Cloudflare Workers. Calls Python FastAPI service via HTTP.
// Edge-cached via KV before hitting the GPU service.

import type { Env } from "../types/env";

export interface IsolateSubjectOptions {
  genre?: string;
  autoDetect?: boolean;
  textPrompt?: string;
  edgeSoftness?: number;
  refineMatting?: boolean;
}

export interface IsolateSubjectResult {
  jobId: string;
  status: "processing" | "completed" | "failed";
  maskVideoUrl?: string;
  durationSeconds?: number;
  confidence?: number;
  method?: string;
  costUsd?: number;
  cacheStatus: "hit" | "miss";
}

export interface DepthOptions {
  genre?: string;
  modelSize?: "small" | "base" | "large";
  enhanceEdges?: boolean;
}

export interface DepthResult {
  jobId: string;
  status: "processing" | "completed" | "failed";
  depthMapUrl?: string;
  resolution?: [number, number];
  costUsd?: number;
  cacheStatus: "hit" | "miss";
}

export interface FaceTrackOptions {
  genre?: string;
  trackPose?: boolean;
  meshLandmarks?: boolean;
  maxFaces?: number;
  smoothing?: number;
}

export interface FaceTrackResult {
  jobId: string;
  status: "processing" | "completed" | "failed";
  trackingDataUrl?: string;
  totalFrames?: number;
  facesTracked?: number;
  costUsd?: number;
  cacheStatus: "hit" | "miss";
}

const KV_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — masks rarely change

// Fast non-crypto hash for cache keys
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function hashKey(prefix: string, payload: unknown): string {
  return `ai:${prefix}:${fnv1a(JSON.stringify(payload))}`;
}

export class MonetAIServicesClient {
  private baseUrl: string;
  private apiKey: string;
  private kv?: KVNamespace;

  constructor(env: Env) {
    this.baseUrl = (env.MONET_AI_SERVICE_URL ?? "").replace(/\/$/, "");
    this.apiKey = env.MONET_AI_SERVICE_KEY ?? "";
    this.kv = env.MONET_KV;

    if (!this.baseUrl) {
      console.warn("[ai-services] MONET_AI_SERVICE_URL not configured — Pro specialists disabled");
    }
  }

  isEnabled(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  async isolateSubject(
    videoUrl: string,
    options: IsolateSubjectOptions = {},
  ): Promise<IsolateSubjectResult> {
    if (!this.isEnabled()) {
      throw new Error("AI Services not configured");
    }

    const cacheKey = hashKey("isolate", { videoUrl, ...options });
    const cached = await this.kvGet<IsolateSubjectResult>(cacheKey);
    if (cached?.status === "completed") {
      return { ...cached, cacheStatus: "hit" };
    }

    const fd = new FormData();
    fd.append("video_url", videoUrl);
    if (options.genre) fd.append("genre", options.genre);
    fd.append("auto_detect", String(options.autoDetect ?? true));
    if (options.textPrompt) fd.append("text_prompt", options.textPrompt);
    if (options.edgeSoftness != null) {
      fd.append("edge_softness", String(options.edgeSoftness));
    }
    fd.append("refine_with_matting", String(options.refineMatting ?? true));

    const raw = await this.post<any>("/api/v1/isolate-subject", fd);

    const result: IsolateSubjectResult = {
      jobId: raw.job_id,
      status: raw.status,
      maskVideoUrl: raw.mask_video_url,
      durationSeconds: raw.duration_seconds,
      confidence: raw.confidence_score,
      method: raw.method_used,
      costUsd: raw.cost_usd,
      cacheStatus: "miss",
    };

    if (result.status === "completed") {
      await this.kvPut(cacheKey, result, KV_TTL_SECONDS);
    }
    return result;
  }

  async extractDepth(
    videoUrl: string,
    options: DepthOptions = {},
  ): Promise<DepthResult> {
    if (!this.isEnabled()) throw new Error("AI Services not configured");

    const cacheKey = hashKey("depth", { videoUrl, ...options });
    const cached = await this.kvGet<DepthResult>(cacheKey);
    if (cached?.status === "completed") {
      return { ...cached, cacheStatus: "hit" };
    }

    const fd = new FormData();
    fd.append("video_url", videoUrl);
    if (options.genre) fd.append("genre", options.genre);
    if (options.modelSize) fd.append("model_variant", `depth_anything_v2_${options.modelSize[0]}`);
    if (options.enhanceEdges != null) {
      fd.append("enhance_edges", String(options.enhanceEdges));
    }

    const raw = await this.post<any>("/api/v1/extract-depth", fd);
    const result: DepthResult = {
      jobId: raw.job_id,
      status: raw.status,
      depthMapUrl: raw.depth_map_url,
      resolution: raw.resolution,
      costUsd: raw.cost_usd,
      cacheStatus: "miss",
    };

    if (result.status === "completed") {
      await this.kvPut(cacheKey, result, KV_TTL_SECONDS);
    }
    return result;
  }

  async trackFace(
    videoUrl: string,
    options: FaceTrackOptions = {},
  ): Promise<FaceTrackResult> {
    if (!this.isEnabled()) throw new Error("AI Services not configured");

    const cacheKey = hashKey("face", { videoUrl, ...options });
    const cached = await this.kvGet<FaceTrackResult>(cacheKey);
    if (cached?.status === "completed") {
      return { ...cached, cacheStatus: "hit" };
    }

    const fd = new FormData();
    fd.append("video_url", videoUrl);
    if (options.genre) fd.append("genre", options.genre);
    fd.append("track_pose", String(options.trackPose ?? true));
    fd.append("mesh_landmarks", String(options.meshLandmarks ?? true));
    fd.append("max_faces", String(options.maxFaces ?? 5));
    fd.append("smoothing", String(options.smoothing ?? 0.5));

    const raw = await this.post<any>("/api/v1/track-face", fd);
    const result: FaceTrackResult = {
      jobId: raw.job_id,
      status: raw.status,
      trackingDataUrl: raw.tracking_data_url,
      totalFrames: raw.total_frames,
      facesTracked: raw.faces_tracked,
      costUsd: raw.cost_usd,
      cacheStatus: "miss",
    };

    if (result.status === "completed") {
      await this.kvPut(cacheKey, result, KV_TTL_SECONDS);
    }
    return result;
  }

  // ---- internals ----

  private async post<T>(path: string, body: FormData): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`AI Services ${path} failed: ${resp.status} ${text.slice(0, 200)}`);
    }
    return resp.json() as Promise<T>;
  }

  private async kvGet<T>(key: string): Promise<T | null> {
    if (!this.kv) return null;
    const raw = await this.kv.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  private async kvPut(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.kv) return;
    try {
      await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSec });
    } catch (e) {
      console.warn("[ai-services] KV put failed:", e);
    }
  }
}
