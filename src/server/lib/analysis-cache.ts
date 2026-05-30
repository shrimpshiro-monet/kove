// Analysis Cache - Cost saver for refinements
// Cache analysis results to avoid re-analyzing footage on every refinement

import type { AnalysisResult } from "../types/analysis";

interface CacheEntry {
  key: string; // Hash of footageIds + musicId
  result: AnalysisResult;
  timestamp: number;
  hits: number;
}

// In-memory cache (will move to KV for production)
const cache = new Map<string, CacheEntry>();

const CACHE_TTL = 1000 * 60 * 60; // 1 hour (shorter than intent cache)

/**
 * Generate cache key from media IDs
 */
function generateCacheKey(footageIds: string[], musicId?: string): string {
  const sorted = [...footageIds].sort();
  return `${sorted.join(",")}:${musicId || ""}`;
}

/**
 * Get cached analysis if available
 */
export function getCachedAnalysis(
  footageIds: string[],
  musicId?: string
): AnalysisResult | null {
  const key = generateCacheKey(footageIds, musicId);

  if (cache.has(key)) {
    const entry = cache.get(key)!;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }

    entry.hits++;
    console.log(`Analysis cache HIT: "${key}" (${entry.hits} hits)`);
    return entry.result;
  }

  console.log(`Analysis cache MISS: "${key}"`);
  return null;
}

/**
 * Store analysis result
 */
export function cacheAnalysis(
  footageIds: string[],
  musicId: string | undefined,
  result: AnalysisResult
): void {
  const key = generateCacheKey(footageIds, musicId);

  cache.set(key, {
    key,
    result,
    timestamp: Date.now(),
    hits: 0,
  });

  console.log(`Analysis cached: "${key}"`);

  // Cleanup old entries (keep cache bounded)
  if (cache.size > 100) {
    const sorted = Array.from(cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    // Remove oldest 20%
    const toRemove = Math.floor(cache.size * 0.2);
    for (let i = 0; i < toRemove; i++) {
      cache.delete(sorted[i][0]);
    }
  }
}

/**
 * Get cache stats
 */
export function getAnalysisCacheStats() {
  const entries = Array.from(cache.values());
  const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
  const avgHits = entries.length > 0 ? totalHits / entries.length : 0;

  return {
    size: cache.size,
    totalHits,
    avgHits: Math.round(avgHits * 100) / 100,
    oldestEntry:
      entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : null,
  };
}

/**
 * Clear cache (for testing)
 */
export function clearAnalysisCache(): void {
  cache.clear();
  console.log("Analysis cache cleared");
}
