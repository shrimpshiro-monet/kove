/**
 * Clip Cache — stores analysis results in D1.
 *
 * Non-LLM analysis is cached so we never re-analyze the same clip.
 * LLM analysis (vision) is stored separately and only runs when needed.
 */
import type { Env } from "../types/env";
import type { ClipAnalysisResult } from "./segment-labeler";

// ── Cache Operations ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached analysis for a clip.
 */
export async function getCachedAnalysis(
  env: Env,
  clipId: string,
): Promise<ClipAnalysisResult | null> {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      "SELECT analysis_data, analyzed_at FROM clip_analysis WHERE clip_id = ?"
    )
      .bind(clipId)
      .first<{ analysis_data: string; analyzed_at: number }>();

    if (!row) return null;

    // Check if cache is still fresh
    if (Date.now() - row.analyzed_at > CACHE_TTL_MS) {
      return null; // stale
    }

    return JSON.parse(row.analysis_data);
  } catch {
    return null;
  }
}

/**
 * Store analysis result in cache.
 */
export async function cacheAnalysis(
  env: Env,
  clipId: string,
  analysis: ClipAnalysisResult,
): Promise<void> {
  if (!env.DB) return;

  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO clip_analysis (clip_id, analysis_data, analyzed_at, duration)
       VALUES (?, ?, ?, ?)`
    )
      .bind(
        clipId,
        JSON.stringify(analysis),
        analysis.analyzedAt,
        analysis.duration,
      )
      .run();
  } catch (e) {
    console.warn(`[clip-cache] Failed to cache analysis for ${clipId}: ${(e as Error).message}`);
  }
}

/**
 * Get cached vision analysis (LLM-based content understanding).
 */
export async function getCachedVisionAnalysis(
  env: Env,
  clipId: string,
): Promise<Record<string, unknown> | null> {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      "SELECT vision_data FROM clip_vision WHERE clip_id = ?"
    )
      .bind(clipId)
      .first<{ vision_data: string }>();

    return row ? JSON.parse(row.vision_data) : null;
  } catch {
    return null;
  }
}

/**
 * Store vision analysis result.
 */
export async function cacheVisionAnalysis(
  env: Env,
  clipId: string,
  visionData: Record<string, unknown>,
): Promise<void> {
  if (!env.DB) return;

  try {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO clip_vision (clip_id, vision_data, analyzed_at) VALUES (?, ?, ?)"
    )
      .bind(clipId, JSON.stringify(visionData), Date.now())
      .run();
  } catch (e) {
    console.warn(`[clip-cache] Failed to cache vision for ${clipId}: ${(e as Error).message}`);
  }
}

/**
 * Clear stale cache entries.
 */
export async function sweepStaleCache(env: Env): Promise<number> {
  if (!env.DB) return 0;

  try {
    const result = await env.DB.prepare(
      "DELETE FROM clip_analysis WHERE analyzed_at < ?"
    )
      .bind(Date.now() - CACHE_TTL_MS)
      .run();

    return result.meta?.changes ?? 0;
  } catch {
    return 0;
  }
}
