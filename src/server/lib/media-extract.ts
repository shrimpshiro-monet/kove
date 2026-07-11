// Frame extraction + audio feature extraction.
// FFmpeg + librosa run in an external sidecar (Cloudflare Container or external Worker).
// This module is the HTTP client for that sidecar.

import type { Env } from "../types/env";

const SIDECAR_URL = (env: Env) => env.MEDIA_SIDECAR_URL ?? "http://localhost:5005";

export async function extractFrames(
  env: Env,
  fileId: string,
  count: number
): Promise<Uint8Array[]> {
  const res = await fetch(`${SIDECAR_URL(env)}/extract-frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, count }),
  });
  if (!res.ok) throw new Error(`extractFrames failed: ${res.status}`);
  const { frames } = (await res.json()) as { frames: string[] };
  return frames.map(
    (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  );
}

export interface AudioFeatures {
  bpm: number;
  duration: number;
  onsets: number[];
  beatGrid: number[];
  energyEnvelope: number[];
}

export async function extractAudioFeatures(
  env: Env,
  fileId: string
): Promise<AudioFeatures> {
  const res = await fetch(`${SIDECAR_URL(env)}/extract-audio-features`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) throw new Error(`extractAudioFeatures failed: ${res.status}`);
  return res.json() as Promise<AudioFeatures>;
}

export interface CutFrequency {
  cutsPerSecond: number;
  avgShotDuration: number;
  variance: number;
}

export async function computeCutFrequency(
  env: Env,
  fileId: string
): Promise<CutFrequency> {
  const res = await fetch(`${SIDECAR_URL(env)}/cut-frequency`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) throw new Error(`computeCutFrequency failed: ${res.status}`);
  return res.json() as Promise<CutFrequency>;
}

export async function computeMotionEnergy(
  env: Env,
  fileId: string
): Promise<number[]> {
  const res = await fetch(`${SIDECAR_URL(env)}/motion-energy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) throw new Error(`computeMotionEnergy failed: ${res.status}`);
  const { profile } = (await res.json()) as { profile: number[] };
  return profile;
}
