// Intent Cache - THE REAL MOAT
// Cache successful intents, reuse for similar prompts
// Cost reducer + speed multiplier

import type { IntentExtractionResult } from "../types/intent";

interface CacheEntry {
  prompt: string;
  promptNormalized: string;
  result: IntentExtractionResult;
  timestamp: number;
  hits: number;
}

// In-memory cache (will move to KV for production)
const cache = new Map<string, CacheEntry>();

const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const SIMILARITY_THRESHOLD = 0.8; // 80% similar = reuse

/**
 * Normalize prompt for similarity matching
 */
function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two prompts
 * Simple word overlap for MVP (can upgrade to embeddings later)
 */
function calculateSimilarity(prompt1: string, prompt2: string): number {
  const words1 = new Set(prompt1.split(" "));
  const words2 = new Set(prompt2.split(" "));

  // Jaccard similarity
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Get cached intent if similar prompt exists
 * THE COST SAVER - reuse intent, skip Gemini call
 */
export function getCachedIntent(
  prompt: string
): IntentExtractionResult | null {
  const normalized = normalizePrompt(prompt);

  // Exact match (fastest)
  if (cache.has(normalized)) {
    const entry = cache.get(normalized)!;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(normalized);
      return null;
    }

    entry.hits++;
    console.log(`Intent cache HIT: "${prompt.slice(0, 50)}..." (${entry.hits} hits)`);
    return entry.result;
  }

  // Similarity match (slower but worth it)
  for (const [key, entry] of cache.entries()) {
    // Check TTL first
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
      continue;
    }

    const similarity = calculateSimilarity(normalized, entry.promptNormalized);

    if (similarity >= SIMILARITY_THRESHOLD) {
      entry.hits++;
      console.log(
        `Intent cache SIMILAR HIT: "${prompt.slice(0, 50)}..." (${Math.round(similarity * 100)}% match, ${entry.hits} hits)`
      );
      return entry.result;
    }
  }

  console.log(`Intent cache MISS: "${prompt.slice(0, 50)}..."`);
  return null;
}

/**
 * Store successful intent
 */
export function cacheIntent(
  prompt: string,
  result: IntentExtractionResult
): void {
  const normalized = normalizePrompt(prompt);

  cache.set(normalized, {
    prompt,
    promptNormalized: normalized,
    result,
    timestamp: Date.now(),
    hits: 0,
  });

  console.log(`Intent cached: "${prompt.slice(0, 50)}..."`);

  // Cleanup old entries (keep cache bounded)
  if (cache.size > 1000) {
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
 * Get cache stats (for monitoring)
 */
export function getCacheStats() {
  const entries = Array.from(cache.values());
  const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
  const avgHits = entries.length > 0 ? totalHits / entries.length : 0;

  return {
    size: cache.size,
    totalHits,
    avgHits: Math.round(avgHits * 100) / 100,
    oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : null,
  };
}

/**
 * Clear cache (for testing)
 */
export function clearIntentCache(): void {
  cache.clear();
  console.log("Intent cache cleared");
}
