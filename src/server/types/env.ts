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

  // Specialist AI services
  REPLICATE_API_TOKEN?: string;
  HUGGINGFACE_API_KEY?: string;
  USE_REPLICATE?: string;
  R2_PUBLIC_BASE?: string;

  // R2 API credentials for SigV4 signed URLs
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  PYTHON_AUDIO_URL?: string;
  PYTHON_AI_URL?: string;

  // DashScope / Alibaba Cloud (Qwen) — primary AI provider
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_MODEL?: string;

  // NVIDIA NIM (Kimi/GLM) — primary AI provider
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_MODEL?: string;

  // Cloudflare + Cerebras + Groq (new pipeline)
  CEREBRAS_API_KEY?: string;
  GROQ_API_KEY?: string;
  MEDIA_SIDECAR_URL?: string;

  // R2 Buckets
  MONET_MEDIA: R2Bucket;
  MONET_RENDERS: R2Bucket;

  // D1 Database
  DB: D1Database;

  // KV Namespace
  MONET_KV: KVNamespace;

  // Cloudflare Workers AI binding
  AI: any;

  // Cloudflare Analytics Engine (optional)
  ANALYTICS?: any;

  // Render queue — server-side export fallback for non-WebCodecs browsers
  RENDER_QUEUE?: Queue;

  // Clerk authentication
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;

  // Sentry error tracking
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
}

// Helper to generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to get current timestamp
export function now(): number {
  return Date.now();
}
