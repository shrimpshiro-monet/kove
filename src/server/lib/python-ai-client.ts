/**
 * HTTP client for the Python AI worker (Whisper transcription, depth, segmentation).
 *
 * The worker runs at PYTHON_AI_URL (default http://localhost:8102)
 * and exposes POST /transcribe for real word-level transcription via faster-whisper.
 */

import type { Env } from "../types/env";

const AI_WORKER_URL = (env: Env) =>
  env.PYTHON_AI_URL ?? "http://localhost:8102";

export interface WhisperWord {
  word: string;
  start: number; // seconds
  end: number;   // seconds
  probability: number;
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface WhisperResult {
  language: string;
  languageProbability: number;
  duration: number;
  segments: WhisperSegment[];
  words: WhisperWord[];
  summary: {
    segmentCount: number;
    wordCount: number;
  };
}

/**
 * Call the Python AI worker to transcribe an audio/video file on disk.
 */
export async function transcribeWithWhisper(
  env: Env,
  filePath: string,
  options?: {
    modelName?: string;
    device?: string;
    computeType?: string;
    language?: string;
  }
): Promise<WhisperResult> {
  const url = `${AI_WORKER_URL(env)}/transcribe`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath,
      modelName: options?.modelName,
      device: options?.device,
      computeType: options?.computeType,
      language: options?.language,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(
      `Python AI worker transcription failed (${res.status}): ${text}`
    );
  }

  const body = (await res.json()) as {
    success: boolean;
    data: WhisperResult;
  };

  if (!body.success || !body.data) {
    throw new Error("Python AI worker returned unsuccessful response");
  }

  return body.data;
}

/**
 * Check if the Python AI worker is reachable.
 */
export async function isPythonAIWorkerAvailable(
  env: Env
): Promise<boolean> {
  try {
    const res = await fetch(`${AI_WORKER_URL(env)}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
