/**
 * Transcription service.
 * Handles Whisper transcription via Python AI worker, schema bridging, and KV caching.
 * Used by transcribe.ts.
 */

import type { Env } from "../types/env";
import { getLocalMediaPath } from "../lib/local-media-cache";
import {
  transcribeWithWhisper,
  isPythonAIWorkerAvailable,
} from "../lib/python-ai-client";

export interface TranscriptWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  intensity: number;
}

export interface TranscriptResult {
  mediaId: string;
  words: TranscriptWord[];
  fullText: string;
  duration_ms: number;
  language: string;
}

/**
 * Transcribe media to word-level timestamps.
 * Tries Whisper via Python AI worker, falls back to empty transcript.
 * Never returns hallucinated text.
 */
export async function transcribeMedia(
  env: Env,
  mediaId: string
): Promise<TranscriptResult> {
  const localPath = getLocalMediaPath(mediaId);

  if (localPath) {
    try {
      const workerAvailable = await isPythonAIWorkerAvailable(env);
      if (workerAvailable) {
        const whisperResult = await transcribeWithWhisper(env, localPath);

        const words: TranscriptWord[] = whisperResult.words.map((w) => ({
          text: w.word,
          start_ms: Math.round(w.start * 1000),
          end_ms: Math.round(w.end * 1000),
          confidence: w.probability,
          intensity: 0.5,
        }));

        const fullText = words.map((w) => w.text).join(" ");

        console.log(
          `[transcription] Whisper: ${words.length} words, ` +
          `lang=${whisperResult.language}, ` +
          `duration=${whisperResult.duration.toFixed(1)}s`
        );

        return {
          mediaId,
          words,
          fullText,
          duration_ms: Math.round(whisperResult.duration * 1000),
          language: whisperResult.language,
        };
      }
    } catch (e) {
      console.warn(
        `[transcription] Whisper failed, returning empty transcript:`,
        (e as Error).message
      );
    }
  }

  return emptyTranscript(mediaId);
}

/**
 * Get cached transcript from KV, or transcribe and cache.
 */
export async function getOrTranscribe(
  env: Env,
  mediaId: string
): Promise<{ transcript: TranscriptResult; cached: boolean }> {
  const cacheKey = `transcript:${mediaId}`;

  if (env.MONET_KV) {
    const cached = await env.MONET_KV.get(cacheKey);
    if (cached) {
      return { transcript: JSON.parse(cached) as TranscriptResult, cached: true };
    }
  }

  const transcript = await transcribeMedia(env, mediaId);

  if (env.MONET_KV) {
    await env.MONET_KV.put(cacheKey, JSON.stringify(transcript), {
      expirationTtl: 86400,
    });
  }

  return { transcript, cached: false };
}

function emptyTranscript(mediaId: string): TranscriptResult {
  console.warn(`[transcription] No local file or worker unavailable for ${mediaId}, returning empty transcript`);
  return {
    mediaId,
    words: [],
    fullText: "",
    duration_ms: 0,
    language: "en",
  };
}
