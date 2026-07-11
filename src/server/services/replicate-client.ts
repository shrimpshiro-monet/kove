// Generic Replicate API wrapper with polling, caching, and graceful fallback.
// All specialist services (SAM, Depth, RIFE) flow through here.

import type { Env } from "../types/env";

export interface ReplicatePredictionInput {
  version: string;
  input: Record<string, any>;
}

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: any;
  error: string | null;
  metrics?: { predict_time?: number };
}

const REPLICATE_BASE = "https://api.replicate.com/v1";

export class ReplicateClient {
  private apiKey: string;

  constructor(env: Env) {
    this.apiKey = env.REPLICATE_API_TOKEN || "";
    if (!this.apiKey) {
      throw new Error("REPLICATE_API_TOKEN not configured");
    }
  }

  async runAndWait(
    input: ReplicatePredictionInput,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<ReplicatePrediction> {
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const pollIntervalMs = opts.pollIntervalMs ?? 2_000;

    const createResp = await fetch(`${REPLICATE_BASE}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: input.version, input: input.input }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text().catch(() => "");
      throw new Error(`Replicate create failed: ${createResp.status} ${errText.slice(0, 300)}`);
    }

    let pred = (await createResp.json()) as ReplicatePrediction;
    const startTime = Date.now();

    while (pred.status === "starting" || pred.status === "processing") {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Replicate prediction timed out after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const pollResp = await fetch(`${REPLICATE_BASE}/predictions/${pred.id}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!pollResp.ok) {
        throw new Error(`Replicate poll failed: ${pollResp.status}`);
      }
      pred = (await pollResp.json()) as ReplicatePrediction;
    }

    if (pred.status === "failed" || pred.status === "canceled") {
      throw new Error(`Replicate prediction ${pred.status}: ${pred.error ?? "unknown"}`);
    }

    return pred;
  }

  async persistToR2(
    env: Env,
    sourceUrl: string,
    r2Key: string,
    contentType: string,
  ): Promise<string> {
    const r2Bucket = env.MONET_MEDIA;
    const r2PublicBase = env.R2_PUBLIC_BASE || "";

    if (!r2Bucket) {
      console.warn("[replicate-client] no R2 configured, using source URL");
      return sourceUrl;
    }

    const sourceResp = await fetch(sourceUrl);
    if (!sourceResp.ok) {
      throw new Error(`Failed to fetch source for R2 persist: ${sourceResp.status}`);
    }

    await r2Bucket.put(r2Key, sourceResp.body, {
      httpMetadata: { contentType },
    });

    return r2PublicBase ? `${r2PublicBase}/${r2Key}` : sourceUrl;
  }
}
