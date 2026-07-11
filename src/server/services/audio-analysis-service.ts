/**
 * Audio analysis service.
 * Handles Python audio worker calls, music analysis with AI, and fallback chains.
 * Used by analyze.ts and upload-and-detect.ts.
 */

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import {
  analyzeAudioWithPython,
  pythonAnalysisToAudioFeatures,
  isPythonAudioWorkerAvailable,
  type AudioFeatures,
} from "../lib/python-audio-client";
import { getLocalMediaPath } from "../lib/local-media-cache";
import {
  MusicAnalysisSchema,
  MUSIC_ANALYSIS_JSON_SCHEMA,
  type MusicAnalysis,
} from "../types/analysis";

const MUSIC_SYSTEM =
  "You are a music structure analyst. Given audio features (BPM, onsets, energy envelope), return MusicAnalysis JSON. " +
  "Set confidence based on how well you can determine structure from the provided features. " +
  "Do NOT invent onsets. The beatGrid array MUST come from the provided features, unchanged.";

export interface BeatDetectionResult {
  bpm: number;
  confidence: number;
  beats: Array<{ time: number; strength: number; index: number }>;
  duration: number;
  downbeats: number[];
}

const FALLBACK_BEATS: BeatDetectionResult = {
  bpm: 120,
  confidence: 0.5,
  beats: Array.from({ length: 10 }, (_, i) => ({ time: i * 0.5, strength: 1, index: i })),
  duration: 5,
  downbeats: [0, 2, 4],
};

/**
 * Detect beats from a local audio file using the Python audio worker.
 * Falls back to bpm:120 if worker is unavailable or fails.
 */
export async function detectBeats(
  env: Env,
  clipId: string
): Promise<BeatDetectionResult> {
  const localPath = getLocalMediaPath(clipId);
  if (!localPath) {
    console.warn(`[audio-analysis] No local file for ${clipId}, using fallback BPM`);
    return FALLBACK_BEATS;
  }

  try {
    const workerAvailable = await isPythonAudioWorkerAvailable(env);
    if (!workerAvailable) {
      console.warn("[audio-analysis] Python audio worker unavailable, using fallback BPM");
      return FALLBACK_BEATS;
    }

    const analysis = await analyzeAudioWithPython(env, localPath);
    const features = pythonAnalysisToAudioFeatures(analysis);

    console.log(
      `[audio-analysis] Real beat detection: bpm=${features.bpm.toFixed(1)}, ` +
      `beats=${features.beatGrid.length}, duration=${features.duration.toFixed(1)}s`
    );

    return {
      bpm: features.bpm,
      confidence: 0.85,
      beats: features.beatGrid.map((time, i) => ({
        time,
        strength: 1,
        index: i,
      })),
      duration: features.duration,
      downbeats: features.beatGrid.filter((_, i) => i % 4 === 0),
    };
  } catch (e) {
    console.warn("[audio-analysis] Beat detection failed, using fallback:", (e as Error).message);
    return FALLBACK_BEATS;
  }
}

/**
 * Extract audio features from a local file using the Python audio worker.
 * Returns null if the worker is unavailable or the file doesn't exist.
 */
export async function extractAudioFeatures(
  env: Env,
  mediaId: string
): Promise<AudioFeatures | null> {
  const localPath = getLocalMediaPath(mediaId);
  if (!localPath) {
    console.warn(`[audio-analysis] No local file for ${mediaId}`);
    return null;
  }

  try {
    const analysis = await analyzeAudioWithPython(env, localPath);
    const features = pythonAnalysisToAudioFeatures(analysis);
    console.log(
      `[audio-analysis] Python audio analysis: bpm=${features.bpm.toFixed(1)}, ` +
      `beats=${features.beatGrid.length}, duration=${features.duration.toFixed(1)}s`
    );
    return features;
  } catch (e) {
    console.warn(`[audio-analysis] Audio feature extraction failed for ${mediaId}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Analyze music: extract features, run AI structuring, build MusicAnalysis.
 * Falls back through 3 tiers: AI+features → features-only → bpm:120 stub.
 */
export async function analyzeMusic(
  env: Env,
  musicId: string
): Promise<MusicAnalysis> {
  const audioFeatures = await extractAudioFeatures(env, musicId);

  // Tier 1: AI structuring with real features
  if (audioFeatures?.onsets && audioFeatures.onsets.length > 0) {
    try {
      const ai = getAIService(env);
      const result = await ai.run("analyze-music", {
        systemPrompt: MUSIC_SYSTEM,
        prompt:
          `Music features for ${musicId}:\n` +
          `BPM: ${audioFeatures.bpm}\n` +
          `Onsets (seconds): ${JSON.stringify(audioFeatures.onsets)}\n` +
          `Duration: ${audioFeatures.duration}\n` +
          `Energy envelope: ${JSON.stringify(audioFeatures.energyEnvelope.slice(0, 50))}...\n\n` +
          `Return MusicAnalysis JSON. Use the EXACT onsets array provided. Identify sections, mood, structure.`,
        schema: MusicAnalysisSchema as any,
        schemaJSON: MUSIC_ANALYSIS_JSON_SCHEMA as Record<string, unknown>,
        maxTokens: 3072,
      });

      const musicResult = result.data as any;
      musicResult.beatGrid = audioFeatures.beatGrid ?? audioFeatures.onsets;
      musicResult.bpm = audioFeatures.bpm;
      musicResult.duration = audioFeatures.duration;
      return musicResult;
    } catch (e) {
      console.warn(`[audio-analysis] Music AI analysis failed: ${(e as Error).message}`);
    }
  }

  // Tier 2: Build from audio features directly
  if (audioFeatures) {
    return {
      musicId,
      duration: audioFeatures.duration,
      bpm: audioFeatures.bpm,
      beatGrid: audioFeatures.beatGrid ?? audioFeatures.onsets,
      confidence: 0.5,
      characteristics: {
        mood: ["unknown"],
        energy: 0.5,
        intensity: 0.5,
        genreHints: ["unknown"],
      },
    } as any;
  }

  // Tier 3: bpm:120 stub — beat sync will be inaccurate
  console.warn(
    `[audio-analysis] CRITICAL: No audio features available for ${musicId}. ` +
    `Falling back to bpm:120 stub. Beat sync will be inaccurate. ` +
    `Ensure the Python audio worker is running at port 8101.`
  );
  return {
    musicId,
    duration: 180,
    bpm: 120,
    beatGrid: Array.from({ length: 60 }, (_, i) => i * 0.5),
    confidence: 0.2,
    characteristics: {
      mood: ["unknown"],
      energy: 0.5,
      intensity: 0.5,
      genreHints: ["unknown"],
    },
  } as any;
}
