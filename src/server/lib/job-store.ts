// src/server/lib/job-store.ts
// Persistent job store backed by Cloudflare KV.
// Replaces the in-memory Map that loses state between Worker isolates.
// KV provides: automatic replication, 24h TTL, no cold-start data loss.

import type { Env } from "../types/env";

export interface JobData {
  jobId: string;
  status: "queued" | "analyzing" | "generating" | "complete" | "failed";
  progress: number;
  message: string;
  startTime: number;
  result?: { edl: unknown };
  error?: string;
}

const KV_KEY_PREFIX = "refine_job:";
const JOB_TTL_SECONDS = 86400; // 24 hours — auto-expire stale jobs

/**
 * Create a job store instance backed by Cloudflare KV.
 * Falls back to in-memory Map if KV is unavailable (local dev without wrangler).
 */
export function createJobStore(env: Env) {
  const kv = (env as any).MONET_KV as KVNamespace | undefined;
  const fallback = new Map<string, JobData>();

  if (kv) {
    return createKVJobStore(kv, fallback);
  }

  console.warn("[job-store] KV not available — falling back to in-memory store (data will not persist across isolates)");
  return createMemoryJobStore(fallback);
}

// ─── KV-BACKED STORE ──────────────────────────────────────────────

function createKVJobStore(kv: KVNamespace, fallback: Map<string, JobData>) {
  return {
    async get(jobId: string): Promise<JobData | null> {
      // Try KV first
      const data = await kv.get(`${KV_KEY_PREFIX}${jobId}`, "json");
      if (data) return data as JobData;

      // Fallback for jobs created in the same isolate
      return fallback.get(jobId) ?? null;
    },

    async set(jobId: string, data: JobData): Promise<void> {
      // Write to both KV and fallback
      fallback.set(jobId, data);
      await kv.put(`${KV_KEY_PREFIX}${jobId}`, JSON.stringify(data), {
        expirationTtl: JOB_TTL_SECONDS,
      });
    },

    async delete(jobId: string): Promise<void> {
      fallback.delete(jobId);
      await kv.delete(`${KV_KEY_PREFIX}${jobId}`);
    },
  };
}

// ─── IN-MEMORY FALLBACK STORE ─────────────────────────────────────

function createMemoryJobStore(store: Map<string, JobData>) {
  return {
    async get(jobId: string): Promise<JobData | null> {
      return store.get(jobId) ?? null;
    },

    async set(jobId: string, data: JobData): Promise<void> {
      store.set(jobId, data);
    },

    async delete(jobId: string): Promise<void> {
      store.delete(jobId);
    },
  };
}

export type JobStore = ReturnType<typeof createJobStore>;
