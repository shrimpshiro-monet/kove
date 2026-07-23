/**
 * Vectorize Service — semantic search using Cloudflare Vectorize.
 *
 * Stores clip embeddings for finding similar moments,
 * matching reference styles, and smart clip selection.
 */
import type { Env } from "../types/env";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ClipEmbedding {
  id: string;
  clipId: string;
  timestamp: number;
  description: string;
  label: string;
  values: number[];
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ── Embedding Generation ────────────────────────────────────────────────────

/**
 * Generate embeddings for text using Cloudflare Workers AI.
 */
export async function generateEmbedding(
  env: Env,
  text: string,
): Promise<number[]> {
  if (!env.AI) {
    throw new Error("Cloudflare Workers AI not available");
  }

  const result = await env.AI.run("@cf/baai/bge-large-en-v1.5", {
    text: [text],
  });

  return result.data[0];
}

/**
 * Generate embeddings for multiple texts in batch.
 */
export async function generateEmbeddings(
  env: Env,
  texts: string[],
): Promise<number[][]> {
  if (!env.AI) {
    throw new Error("Cloudflare Workers AI not available");
  }

  const result = await env.AI.run("@cf/baai/bge-large-en-v1-5", {
    text: texts,
  });

  return result.data;
}

// ── Vectorize Operations ────────────────────────────────────────────────────

/**
 * Store clip embeddings in Vectorize.
 */
export async function storeClipEmbeddings(
  env: Env,
  embeddings: ClipEmbedding[],
): Promise<void> {
  if (!env.VECTORIZE) {
    console.warn("[vectorize] VECTORIZE binding not available, skipping");
    return;
  }

  const vectors = embeddings.map((e) => ({
    id: e.id,
    values: e.values,
    metadata: {
      clipId: e.clipId,
      timestamp: e.timestamp,
      description: e.description,
      label: e.label,
    },
  }));

  // Vectorize has a 1000 vector limit per upsert
  const BATCH_SIZE = 500;
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await env.VECTORIZE.upsert(batch);
  }

  console.log(`[vectorize] Stored ${embeddings.length} embeddings`);
}

/**
 * Search for similar clips by text query.
 */
export async function searchByQuery(
  env: Env,
  query: string,
  topK = 10,
): Promise<SearchResult[]> {
  if (!env.VECTORIZE) {
    return [];
  }

  const queryEmbedding = await generateEmbedding(env, query);

  const results = await env.VECTORIZE.query(queryEmbedding, {
    topK,
    returnMetadata: true,
  });

  return results.map((r: any) => ({
    id: r.id,
    score: r.score,
    metadata: r.metadata ?? {},
  }));
}

/**
 * Search for similar clips by vector.
 */
export async function searchByVector(
  env: Env,
  vector: number[],
  topK = 10,
): Promise<SearchResult[]> {
  if (!env.VECTORIZE) {
    return [];
  }

  const results = await env.VECTORIZE.query(vector, {
    topK,
    returnMetadata: true,
  });

  return results.map((r: any) => ({
    id: r.id,
    score: r.score,
    metadata: r.metadata ?? {},
  }));
}

/**
 * Find clips similar to a reference description.
 */
export async function findSimilarClips(
  env: Env,
  referenceDescription: string,
  clipIds?: string[],
  topK = 5,
): Promise<SearchResult[]> {
  const results = await searchByQuery(env, referenceDescription, topK * 2);

  // Filter by clip IDs if provided
  if (clipIds && clipIds.length > 0) {
    const clipIdSet = new Set(clipIds);
    return results.filter((r) => clipIdSet.has(r.metadata.clipId as string)).slice(0, topK);
  }

  return results.slice(0, topK);
}

/**
 * Delete embeddings by ID.
 */
export async function deleteEmbeddings(
  env: Env,
  ids: string[],
): Promise<void> {
  if (!env.VECTORIZE) return;
  await env.VECTORIZE.deleteByIds(ids);
}
