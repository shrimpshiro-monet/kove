// Cloudflare Workers environment bindings

export interface Env {
  // Environment variables
  ENVIRONMENT: string;
  GEMINI_API_KEY: string;

  // R2 Buckets
  MONET_MEDIA: R2Bucket;
  MONET_RENDERS: R2Bucket;

  // D1 Database
  DB: D1Database;

  // KV Namespace
  MONET_KV: KVNamespace;
}

// Helper to generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to get current timestamp
export function now(): number {
  return Date.now();
}
