// HuggingFace Inference API client — free tier with rate limiting.
// Used as the cheap path for SAM/Depth/RIFE specialist features.

import type { Env } from "../types/env";

const HF_BASE = "https://api-inference.huggingface.co";

export interface HFRequest {
  model: string;
  inputs: any;
  parameters?: any;
  options?: { wait_for_model?: boolean; use_cache?: boolean };
}

export interface HFResult {
  data: any;
  cached: boolean;
  queueTier: "free" | "priority";
  waitMs: number;
}

export class HuggingFaceRateLimited extends Error {
  constructor(
    public retryAfterSec: number,
    public tier: "free" | "priority",
  ) {
    super(`HuggingFace ${tier} tier rate limited. Retry after ${retryAfterSec}s.`);
    this.name = "HuggingFaceRateLimited";
  }
}

export class HuggingFaceModelLoading extends Error {
  constructor(public estimatedTimeSec: number) {
    super(`Model is loading. Try again in ${estimatedTimeSec}s.`);
    this.name = "HuggingFaceModelLoading";
  }
}

export class HuggingFaceClient {
  private apiKey: string | undefined;

  constructor(env: Env) {
    this.apiKey = (env as any).HUGGINGFACE_API_KEY;
  }

  async runInference(req: HFRequest): Promise<HFResult> {
    const startedAt = Date.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Wait-For-Model": "true",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const body = JSON.stringify({
      inputs: req.inputs,
      parameters: req.parameters,
      options: req.options ?? { wait_for_model: true, use_cache: true },
    });

    const resp = await fetch(`${HF_BASE}/models/${req.model}`, {
      method: "POST",
      headers,
      body,
    });

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get("retry-after") ?? "30", 10);
      throw new HuggingFaceRateLimited(retryAfter, "free");
    }

    if (resp.status === 503) {
      const text = await resp.text();
      const match = text.match(/estimated_time\s*[:=]\s*(\d+(?:\.\d+)?)/);
      const estimatedTime = match ? parseFloat(match[1]) : 20;
      throw new HuggingFaceModelLoading(estimatedTime);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HuggingFace ${resp.status}: ${text.slice(0, 300)}`);
    }

    const contentType = resp.headers.get("content-type") ?? "";
    let data: any;
    if (contentType.includes("application/json")) {
      data = await resp.json();
    } else {
      data = await resp.arrayBuffer();
    }

    return {
      data,
      cached: resp.headers.get("x-cache") === "HIT",
      queueTier: this.apiKey ? "priority" : "free",
      waitMs: Date.now() - startedAt,
    };
  }
}
