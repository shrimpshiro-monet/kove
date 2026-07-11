// Tracks rate limits and queue status across HF calls.
// Drives the "upgrade to skip queue" CTA on the frontend.

import type { Env } from "../types/env";

export interface QueueStatus {
  tier: "free" | "priority";
  isBusy: boolean;
  estimatedWaitSec: number;
  recentFailures: number;
}

const STATUS_KEY = "queue:hf:status";

export async function getQueueStatus(env: Env): Promise<QueueStatus> {
  const kv = env.MONET_KV;
  if (!kv) {
    return { tier: "free", isBusy: false, estimatedWaitSec: 0, recentFailures: 0 };
  }
  const raw = await kv.get(STATUS_KEY);
  if (!raw) {
    return { tier: "free", isBusy: false, estimatedWaitSec: 0, recentFailures: 0 };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[queue] status parse failed:", e);
    return { tier: "free", isBusy: false, estimatedWaitSec: 0, recentFailures: 0 };
  }
}

export async function markQueueBusy(
  env: Env,
  estimatedWaitSec: number,
): Promise<void> {
  const kv = env.MONET_KV;
  if (!kv) return;
  const status: QueueStatus = {
    tier: "free",
    isBusy: true,
    estimatedWaitSec,
    recentFailures: 1,
  };
  try {
    await kv.put(STATUS_KEY, JSON.stringify(status), {
      expirationTtl: 60,
    });
  } catch (e) {
    console.warn("[queue] markBusy failed:", e);
  }
}

export async function clearQueueStatus(env: Env): Promise<void> {
  const kv = env.MONET_KV;
  if (!kv) return;
  try {
    await kv.delete(STATUS_KEY);
  } catch (e) {
    console.warn("[queue] clearStatus failed:", e);
  }
}
