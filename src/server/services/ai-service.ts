// Monet AI Service — Multi-provider router with fallback chain.
// Providers: Cloudflare Workers AI (vision + CLIP), Cerebras (reasoning), Groq (streaming refine)
// Backward-compatible: exposes legacy generateContentJSON/generateContentJSONWithFile/uploadFile
// for existing endpoints, plus new run()/runStream() for the two-pass pipeline.

import OpenAI from "openai";
import type { z } from "zod";
import type { Env } from "../types/env";

// ============================================================================
// TYPES
// ============================================================================

export type AITask =
  | "analyze-footage"
  | "analyze-music"
  | "analyze-reference"
  | "decode-intent"
  | "generate-edl-creative"
  | "refine-edl"
  | "clip-similarity"
  | "compile-intent";

export type Provider = "cloudflare" | "cerebras" | "groq" | "nvidia" | "digitalocean";

export type GenerationMode = "ai_director" | "fast_planner";

export interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  images?: Array<Uint8Array | string>;
  schema?: z.ZodSchema;
  schemaJSON?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface AICallResult<T = unknown> {
  data: T;
  raw: string;
  provider: Provider;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  schemaValid: boolean;
  generationMode: GenerationMode;
}

interface AIEnv {
  AI: any;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CEREBRAS_API_KEY?: string;
  GROQ_API_KEY?: string;
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_MODEL?: string;
  DIGITALOCEAN_API_KEY?: string;
  ANALYTICS?: any;
}

// ============================================================================
// ROUTING TABLE
//
// ONE MODEL STRATEGY: Use Cloudflare Workers AI as the single primary.
// Keeps costs minimal. Scale to Claude/MiMo when the app grows.
// ============================================================================

// The one model for everything text/reasoning
const UNIFIED_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Vision model (only when images are needed)
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
// Embedding model
const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5";

interface RouteConfig {
  primary: { provider: Provider; model: string };
  fallback?: { provider: Provider; model: string };
  lastResort?: { provider: Provider; model: string };
  timeoutMs: number;
}

const ROUTES: Record<AITask, RouteConfig> = {
  "analyze-footage": {
    primary: { provider: "cloudflare", model: VISION_MODEL },
    fallback: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 45_000,
  },
  "analyze-music": {
    primary: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 45_000,
  },
  "analyze-reference": {
    primary: { provider: "cloudflare", model: VISION_MODEL },
    fallback: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 60_000,
  },
  "decode-intent": {
    primary: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 30_000,
  },
  "generate-edl-creative": {
    primary: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 60_000,
  },
  "refine-edl": {
    primary: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 60_000,
  },
  "clip-similarity": {
    primary: { provider: "cloudflare", model: EMBEDDING_MODEL },
    timeoutMs: 10_000,
  },
  "compile-intent": {
    primary: { provider: "cloudflare", model: UNIFIED_MODEL },
    timeoutMs: 60_000,
  },
};

// ============================================================================
// PROVIDER CLIENTS
// ============================================================================

class ProviderClients {
  cerebras: OpenAI;
  groq: OpenAI;
  nvidia: OpenAI | null;
  digitalocean: OpenAI | null;
  cf: any;
  private nvidiaApiKey: string;
  private doApiKey: string;
  private cfApiToken: string;
  private cfAccountId: string;

  constructor(env: AIEnv) {
    this.cerebras = new OpenAI({
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: env.CEREBRAS_API_KEY || "not-set",
    });
    this.groq = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: env.GROQ_API_KEY || "not-set",
    });
    this.nvidiaApiKey = env.NVIDIA_NIM_API_KEY || "";
    this.nvidia = null;
    this.doApiKey = env.DIGITALOCEAN_API_KEY || "";
    this.digitalocean = null;
    this.cf = env.AI;
    this.cfApiToken = env.CLOUDFLARE_API_TOKEN || "";
    this.cfAccountId = env.CLOUDFLARE_ACCOUNT_ID || "";
  }

  getNvidia(): OpenAI {
    if (!this.nvidia && this.nvidiaApiKey) {
      this.nvidia = new OpenAI({
        baseURL: "https://integrate.api.nvidia.com/v1",
        apiKey: this.nvidiaApiKey,
      });
    }
    return this.nvidia!;
  }

  getDigitalOcean(): OpenAI {
    if (!this.digitalocean && this.doApiKey) {
      this.digitalocean = new OpenAI({
        baseURL: "https://api.digitalocean.com/v1",
        apiKey: this.doApiKey,
      });
    }
    return this.digitalocean!;
  }
}

// ============================================================================
// LOW-LEVEL PROVIDER CALLS
// ============================================================================

async function callCloudflare(
  clients: ProviderClients,
  model: string,
  opts: AICallOptions
): Promise<{ raw: string; inputTokens?: number; outputTokens?: number }> {
  const messages = [
    ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
    { role: "user", content: opts.prompt },
  ];

  const payload: Record<string, unknown> = {
    messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
  };

  if (opts.images && opts.images.length > 0) {
    payload.image = opts.images[0];
  }

  if (opts.schemaJSON) {
    payload.response_format = {
      type: "json_schema",
      json_schema: opts.schemaJSON,
    };
  }

  // Try the Workers AI binding first (works in deployed Workers)
  if (clients.cf) {
    try {
      const result: any = await clients.cf.run(model, payload);
      const raw =
        result?.response ?? result?.result?.response ?? JSON.stringify(result);
      return {
        raw,
        inputTokens: result?.usage?.prompt_tokens,
        outputTokens: result?.usage?.completion_tokens,
      };
    } catch (err) {
      console.warn(`[AI] Workers AI binding failed, trying REST API: ${(err as Error).message?.slice(0, 100)}`);
    }
  }

  // Fallback: Cloudflare REST API (works in local dev with API token from .dev.vars)
  const apiToken = clients.cfApiToken || (globalThis as any).process?.env?.CLOUDFLARE_API_TOKEN || "";
  const accountId = clients.cfAccountId || (globalThis as any).process?.env?.CLOUDFLARE_ACCOUNT_ID || "";
  if (apiToken && accountId) {
    return callCloudflareREST(apiToken, accountId, model, payload);
  }

  throw new Error("Cloudflare Workers AI not available (no binding and no API token)");
}

async function callCloudflareREST(
  apiToken: string,
  accountId: string,
  model: string,
  payload: Record<string, unknown>
): Promise<{ raw: string; inputTokens?: number; outputTokens?: number }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Cloudflare REST API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json: any = await resp.json();
  if (!json.success) {
    throw new Error(`Cloudflare REST API error: ${JSON.stringify(json.errors).slice(0, 200)}`);
  }

  // REST API returns OpenAI-compatible format: result.choices[0].message.content
  // Binding returns: result.response
  const raw =
    json?.result?.response ??
    json?.result?.choices?.[0]?.message?.content ??
    JSON.stringify(json?.result);
  return {
    raw,
    inputTokens: json?.result?.usage?.prompt_tokens,
    outputTokens: json?.result?.usage?.completion_tokens,
  };
}

async function callOpenAICompat(
  client: OpenAI,
  model: string,
  opts: AICallOptions
): Promise<{ raw: string; inputTokens?: number; outputTokens?: number }> {
  // Build user message content — include images as vision content if available
  let userContent: any;
  if (opts.images && opts.images.length > 0) {
    const content: any[] = [{ type: "text", text: opts.prompt }];
    for (const img of opts.images) {
      if (img instanceof Uint8Array) {
        // Convert raw bytes to base64 data URL
        const base64 = Buffer.from(img).toString("base64");
        content.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" },
        });
      } else if (typeof img === "string") {
        // Already a URL or base64 string
        content.push({
          type: "image_url",
          image_url: { url: img, detail: "low" },
        });
      }
    }
    userContent = content;
  } else {
    userContent = opts.prompt;
  }

  const messages: any[] = [
    ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
    { role: "user", content: userContent },
  ];

  const response_format = opts.schemaJSON
    ? { type: "json_object" as const }
    : undefined;

  const completion = await client.chat.completions.create(
    {
      model,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      ...(response_format ? { response_format } : {}),
    },
    { signal: opts.signal }
  );

  return {
    raw: completion.choices[0]?.message?.content ?? "",
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens,
  };
}

// ============================================================================
// CLIP — special case (embeddings, not chat)
// ============================================================================

export async function getClipEmbedding(
  env: AIEnv,
  imageBytes: Uint8Array
): Promise<number[]> {
  // Try the Workers AI binding first
  if (env.AI) {
    try {
      const result: any = await env.AI.run("@cf/openai/clip-vit-base-patch32", {
        image: Array.from(imageBytes),
      });
      return result?.data?.[0] ?? result?.embedding ?? [];
    } catch {
      // Fall through to REST API
    }
  }

  // Fallback: REST API
  const apiToken = (env as any).CLOUDFLARE_API_TOKEN || (globalThis as any).process?.env?.CLOUDFLARE_API_TOKEN || "";
  const accountId = (env as any).CLOUDFLARE_ACCOUNT_ID || (globalThis as any).process?.env?.CLOUDFLARE_ACCOUNT_ID || "";
  if (!apiToken || !accountId) return [];

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/clip-vit-base-patch32`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: Array.from(imageBytes) }),
    }
  );
  if (!resp.ok) return [];
  const json: any = await resp.json();
  return json?.result?.data?.[0] ?? json?.result?.embedding ?? [];
}

// ============================================================================
// CORE ROUTER WITH FALLBACK CHAIN
// ============================================================================

async function callRoute<T = unknown>(
  clients: ProviderClients,
  route: { provider: Provider; model: string },
  opts: AICallOptions
): Promise<{ raw: string; inputTokens?: number; outputTokens?: number }> {
  switch (route.provider) {
    case "cloudflare":
      return callCloudflare(clients, route.model, opts);
    case "cerebras":
      return callOpenAICompat(clients.cerebras, route.model, opts);
    case "groq":
      return callOpenAICompat(clients.groq, route.model, opts);
    case "nvidia": {
      const nvidiaClient = clients.getNvidia();
      if (!nvidiaClient) throw new Error("NVIDIA NIM API key not configured");
      return callOpenAICompat(nvidiaClient, route.model, opts);
    }
    case "digitalocean": {
      const doClient = clients.getDigitalOcean();
      if (!doClient) throw new Error("DigitalOcean API key not configured");
      return callOpenAICompat(doClient, route.model, opts);
    }
    default:
      throw new Error(`Unknown provider: ${route.provider}`);
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Aborted by caller"));
      });
    }
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ============================================================================
// JSON PARSER (shared between new and legacy paths)
// ============================================================================

function parseJSONResponse(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Try markdown code fence extraction
      const match = trimmed.match(/```json?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1]); } catch { /* fall through */ }
      }
      // Strip thinking tokens from reasoning models
      let cleaned = trimmed
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/[^\x00-\x7F]/g, "");
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      try {
        return JSON.parse(cleaned);
      } catch {
        // Fix trailing commas
        let fixed = cleaned.replace(/,\s*([\]}])/g, "$1");
        const opens = (fixed.match(/[{[]/g) || []).length;
        const closes = (fixed.match(/[}\]]/g) || []).length;
        for (let i = 0; i < opens - closes; i++) {
          const lastOpen = fixed.lastIndexOf("[");
          const lastClose = fixed.lastIndexOf("]");
          const lastBraceOpen = fixed.lastIndexOf("{");
          const lastBraceClose = fixed.lastIndexOf("}");
          if (lastOpen > lastClose) fixed += "]";
          else if (lastBraceOpen > lastBraceClose) fixed += "}";
          else fixed += "}";
        }
        try {
          return JSON.parse(fixed);
        } catch {
          // Find largest valid JSON
          for (let end = fixed.lastIndexOf("}"); end > 0; end = fixed.lastIndexOf("}", end - 1)) {
            try {
              return JSON.parse(fixed.substring(0, end + 1));
            } catch { /* continue */ }
          }
          throw new Error(`Invalid JSON from AI: ${raw.slice(0, 200)}`);
        }
      }
    }
  }
  // Not JSON-looking — return as-is (caller may not need JSON)
  return raw;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export class AIService {
  private clients: ProviderClients;
  private env: AIEnv;

  constructor(env: Env) {
    this.env = env;
    this.clients = new ProviderClients({
      AI: env.AI,
      CLOUDFLARE_API_TOKEN: (env as any).CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: (env as any).CLOUDFLARE_ACCOUNT_ID,
      CEREBRAS_API_KEY: env.CEREBRAS_API_KEY,
      GROQ_API_KEY: env.GROQ_API_KEY,
      NVIDIA_NIM_API_KEY: (env as any).NVIDIA_NIM_API_KEY,
      NVIDIA_NIM_MODEL: (env as any).NVIDIA_NIM_MODEL,
      DIGITALOCEAN_API_KEY: (env as any).DIGITALOCEAN_API_KEY,
      ANALYTICS: env.ANALYTICS,
    });
  }

  // ---- NEW PIPELINE: run() for structured tasks ----

  /**
   * Run an AI task with automatic provider fallback.
   * Throws if all providers fail — caller decides whether to use fast_planner.
   */
  async run<T = unknown>(task: AITask, opts: AICallOptions): Promise<AICallResult<T>> {
    const route = ROUTES[task];
    if (!route) throw new Error(`No route configured for task: ${task}`);

    const attempts: Array<{ provider: Provider; model: string }> = [
      route.primary,
      ...(route.fallback ? [route.fallback] : []),
      ...(route.lastResort ? [route.lastResort] : []),
    ];

    let lastError: Error | null = null;

    for (const attempt of attempts) {
      const startedAt = Date.now();
      try {
        const { raw, inputTokens, outputTokens } = await withTimeout(
          callRoute(this.clients, attempt, opts),
          route.timeoutMs,
          opts.signal
        );

        const latencyMs = Date.now() - startedAt;
        const { data, schemaValid } = this.parseAndValidate<T>(raw, opts.schema);

        if (!schemaValid && opts.schema) {
          throw new Error(`Schema validation failed on ${attempt.provider}/${attempt.model}`);
        }

        const result: AICallResult<T> = {
          data,
          raw,
          provider: attempt.provider,
          model: attempt.model,
          latencyMs,
          inputTokens,
          outputTokens,
          schemaValid,
          generationMode: "ai_director",
        };

        this.logTelemetry(task, result, null);
        return result;
      } catch (err) {
        lastError = err as Error;
        const latencyMs = Date.now() - startedAt;
        this.logTelemetry(
          task,
          {
            provider: attempt.provider,
            model: attempt.model,
            latencyMs,
            generationMode: "ai_director",
            schemaValid: false,
          } as AICallResult,
          lastError
        );
      }
    }

    throw new Error(
      `All providers failed for task "${task}". Last error: ${lastError?.message ?? "unknown"}`
    );
  }

  // ---- NEW PIPELINE: runStream() for streaming refine ----

  async *runStream(opts: AICallOptions): AsyncGenerator<string, void, unknown> {
    const route = ROUTES["refine-edl"];
    const primary = route.primary;
    const client =
      primary.provider === "groq" ? this.clients.groq : this.clients.cerebras;

    const messages: any[] = [
      ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
      { role: "user", content: opts.prompt },
    ];

    const stream = await client.chat.completions.create(
      {
        model: primary.model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        stream: true,
        ...(opts.schemaJSON
          ? { response_format: { type: "json_object" as const } }
          : {}),
      },
      { signal: opts.signal }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  // ---- LEGACY API: backward-compatible methods ----
  // These methods match the old NIMService/GeminiService interface so existing
  // endpoints (analyze.ts, generate-edl.ts, refine-edl.ts, footage-analysis.ts)
  // continue to work without modification.

  async generateContentJSON<T = unknown>(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    schema?: unknown;
    stage?: string;
  }): Promise<T> {
    // Route to the right task based on stage hint
    const task: AITask = (params.stage as AITask) || "decode-intent";

    // Determine which route to use (try all providers, not just the task-specific one)
    const providersToTry = this.getLegacyProviderChain();

    let lastError: Error | null = null;
    for (const { provider, model } of providersToTry) {
      try {
        const opts: AICallOptions = {
          prompt: params.prompt,
          systemPrompt: params.systemInstruction,
          maxTokens: params.maxOutputTokens ?? 4096,
          temperature: params.temperature ?? 0.7,
        };

        const startedAt = Date.now();
        const { raw } = await withTimeout(
          this.callLegacyProvider(provider, model, opts),
          30_000
        );
        const latencyMs = Date.now() - startedAt;

        const parsed = parseJSONResponse(raw) as T;
        this.logTelemetry(task, {
          provider,
          model,
          latencyMs,
          schemaValid: true,
          generationMode: "ai_director",
        } as AICallResult, null);
        return parsed;
      } catch (err) {
        lastError = err as Error;
        console.warn(`[AI] Legacy ${provider}/${model} failed: ${(err as Error).message?.slice(0, 100)}`);
      }
    }

    throw lastError || new Error("All AI providers failed (legacy path)");
  }

  async generateContentJSONWithFile<T = unknown>(params: {
    fileUri: string;
    mimeType: string;
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    schema?: unknown;
  }): Promise<T> {
    // File upload path only works with providers that support it.
    // For the new stack, we pass the file URI as context in the prompt.
    // The actual file content should be fetched from R2 and passed as base64 images
    // through the new run() path instead.
    //
    // For backward compatibility, we try the legacy provider chain with the
    // file URI mentioned in the prompt context.
    return this.generateContentJSON<T>({
      prompt: `${params.prompt}\n\n[File: ${params.fileUri} (${params.mimeType})]`,
      systemInstruction: params.systemInstruction,
      temperature: params.temperature,
      schema: params.schema,
    });
  }

  async uploadFile(params: {
    data: Uint8Array;
    mimeType: string;
    displayName: string;
  }): Promise<{ uri: string; name: string }> {
    // In the new stack, files live in R2. "Upload" means storing to R2.
    // For backward compatibility, return a synthetic URI.
    // The actual upload should go through the R2 binding.
    const uri = `r2://monet-media/${params.displayName}`;
    return { uri, name: params.displayName };
  }

  // ---- INTERNAL HELPERS ----

  private getLegacyProviderChain(): Array<{ provider: Provider; model: string }> {
    const chain: Array<{ provider: Provider; model: string }> = [];

    // Cloudflare Workers AI — always first (10K neurons/day free)
    if (this.env.AI) {
      chain.push({ provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
    }

    // Cerebras (fast reasoning)
    if (this.env.CEREBRAS_API_KEY) {
      chain.push({ provider: "cerebras", model: "gpt-oss-120b" });
    }

    // Groq (fast streaming)
    if (this.env.GROQ_API_KEY) {
      chain.push({ provider: "groq", model: "llama-3.3-70b-versatile" });
    }

    // NVIDIA NIM (Kimi, Nemotron, DeepSeek)
    if (this.env.NVIDIA_NIM_API_KEY) {
      const model = this.env.NVIDIA_NIM_MODEL || "moonshotai/kimi-k2.6";
      chain.push({ provider: "nvidia", model });
    }

    // DigitalOcean (last resort)
    if (this.env.DIGITALOCEAN_API_KEY) {
      chain.push({ provider: "digitalocean", model: "llama-3.3-70b-versatile" });
    }

    return chain;
  }

  private async callLegacyProvider(
    provider: Provider,
    model: string,
    opts: AICallOptions
  ): Promise<{ raw: string }> {
    switch (provider) {
      case "cloudflare":
        return callCloudflare(this.clients, model, opts);
      case "cerebras":
        return callOpenAICompat(this.clients.cerebras, model, opts);
      case "groq":
        return callOpenAICompat(this.clients.groq, model, opts);
      case "nvidia": {
        const nvidiaClient = this.clients.getNvidia();
        if (!nvidiaClient) throw new Error("NVIDIA NIM API key not configured");
        return callOpenAICompat(nvidiaClient, model, opts);
      }
      case "digitalocean": {
        const doClient = this.clients.getDigitalOcean();
        if (!doClient) throw new Error("DigitalOcean API key not configured");
        return callOpenAICompat(doClient, model, opts);
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private parseAndValidate<T>(
    raw: string,
    schema?: z.ZodSchema
  ): { data: T; schemaValid: boolean } {
    let parsed: any = parseJSONResponse(raw);

    if (!schema) {
      return { data: parsed as T, schemaValid: true };
    }

    const result = schema.safeParse(parsed);
    return {
      data: (result.success ? result.data : parsed) as T,
      schemaValid: result.success,
    };
  }

  private logTelemetry(
    task: AITask,
    result: Partial<AICallResult>,
    error: Error | null
  ): void {
    const event = {
      task,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      schemaValid: result.schemaValid,
      generationMode: result.generationMode ?? "ai_director",
      success: error === null,
      errorMessage: error?.message,
      timestamp: Date.now(),
    };

    if (this.env.ANALYTICS?.writeDataPoint) {
      try {
        this.env.ANALYTICS.writeDataPoint({
          blobs: [
            event.task,
            event.provider ?? "unknown",
            event.model ?? "unknown",
            event.generationMode,
            event.errorMessage ?? "",
          ],
          doubles: [
            event.latencyMs ?? 0,
            event.inputTokens ?? 0,
            event.outputTokens ?? 0,
          ],
          indexes: [event.success ? "ok" : "fail"],
        });
      } catch { /* swallow telemetry errors */ }
    }

    console.log("[AI]", JSON.stringify(event));
  }
}

// ============================================================================
// FACTORY — backward-compatible getAIService()
// ============================================================================

export function getAIService(env?: Env): AIService {
  if (!env) throw new Error("Env required for AIService");
  return new AIService(env);
}
