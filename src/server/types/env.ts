// Cloudflare Workers environment bindings

export interface Env {
  // Environment variables
  ENVIRONMENT: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  MONET_API_URL?: string;
  MONET_AI_SERVICE_URL?: string;
  MONET_AI_SERVICE_KEY?: string;
  
  // GCP Vertex AI credentials
  GCP_PROJECT_ID?: string;
  GCP_LOCATION?: string;
  GCP_CREDENTIALS?: string;
  VERTEX_GEMINI_MODEL?: string;
  GCS_BUCKET?: string;

  // Azure OpenAI (Foundry) credentials
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_DEPLOYMENT?: string;
  AZURE_OPENAI_API_KEY?: string;

  // Azure AI Foundry (per-stage model routing)
  AZURE_FOUNDRY_ENDPOINT?: string;
  AZURE_FOUNDRY_KEY?: string;

  // R2 Buckets
  MONET_MEDIA: R2Bucket;
  MONET_RENDERS: R2Bucket;

  // D1 Database
  DB: D1Database;

  // KV Namespace
  MONET_KV: KVNamespace;

  // Render queue — server-side export fallback for non-WebCodecs browsers
  RENDER_QUEUE?: Queue;
}

// Helper to generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to get current timestamp
export function now(): number {
  return Date.now();
}
