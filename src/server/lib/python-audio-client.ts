/**
 * HTTP client for the Python audio worker (librosa-based analysis).
 *
 * The worker runs at PYTHON_AUDIO_URL (default http://localhost:8101)
 * and exposes POST /analyze-audio which returns real BPM, beats,
 * transients, energy curve, onset curve, and spectral centroid.
 */

import type { Env } from "../types/env";

const AUDIO_WORKER_URL = (env: Env) =>
  env.PYTHON_AUDIO_URL ?? "http://localhost:8101";

export interface PythonAudioAnalysis {
  duration: number;
  sampleRate: number;
  tempo: number;
  beats: number[];
  transients: number[];
  energyCurve: Array<{ time: number; value: number }>;
  onsetCurve: Array<{ time: number; value: number }>;
  spectralCentroidCurve: Array<{ time: number; value: number }>;
  summary: {
    beatCount: number;
    transientCount: number;
    averageEnergy: number;
    maxEnergy: number;
  };
}

export interface AudioFeatures {
  bpm: number;
  duration: number;
  onsets: number[];
  beatGrid: number[];
  energyEnvelope: number[];
}

/**
 * Call the Python audio worker to analyze an audio file on disk.
 * The file must be accessible from the worker's filesystem
 * (e.g. written to /tmp/monet-media-dev/ by the local media cache).
 */
export async function analyzeAudioWithPython(
  env: Env,
  filePath: string
): Promise<PythonAudioAnalysis> {
  const url = `${AUDIO_WORKER_URL(env)}/analyze-audio`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath,
      sampleRate: 22050,
      hopLength: 512,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(
      `Python audio worker failed (${res.status}): ${text}`
    );
  }

  const body = (await res.json()) as {
    success: boolean;
    data: PythonAudioAnalysis;
  };

  if (!body.success || !body.data) {
    throw new Error("Python audio worker returned unsuccessful response");
  }

  return body.data;
}

/**
 * Convert Python audio analysis to the AudioFeatures format
 * used by the existing pipeline (analyze.ts, generate-edl.ts, etc.).
 */
export function pythonAnalysisToAudioFeatures(
  analysis: PythonAudioAnalysis
): AudioFeatures {
  return {
    bpm: analysis.tempo,
    duration: analysis.duration,
    onsets: analysis.transients,
    beatGrid: analysis.beats,
    energyEnvelope: analysis.energyCurve.map((p) => p.value),
  };
}

/**
 * Check if the Python audio worker is reachable.
 */
export async function isPythonAudioWorkerAvailable(
  env: Env
): Promise<boolean> {
  try {
    const res = await fetch(`${AUDIO_WORKER_URL(env)}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
