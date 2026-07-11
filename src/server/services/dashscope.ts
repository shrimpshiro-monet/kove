// DashScope (Alibaba Cloud) AI Service with model router
// Tries models in priority order, falls back on 403/429/500

import type { Env } from "../types/env";

const DASHSCOPE_BASE = "https://ws-fomf9p6i0ii5ie0n.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

// Priority order: best reasoning → cheapest/fastest
const MODEL_ROUTER = [
  "qwen3-max",                      // best reasoning, 1M quota
  "qwen3.5-122b-a10b",              // large MoE, good balance
  "qwen3-235b-a22b-thinking-2507",  // thinking model, complex edits
  "qwen-max",                       // solid general purpose
  "qwen-plus-2025-07-28",           // cheaper, still capable
  "qwen3.5-plus-2026-02-15",        // newer plus tier
  "qwen-mt-flash",                   // fast, light tasks
];

export class DashScopeService {
  private apiKey: string;
  private defaultModel: string;

  constructor(env?: Env) {
    this.apiKey =
      env?.DASHSCOPE_API_KEY ||
      (typeof process !== "undefined" ? process.env.DASHSCOPE_API_KEY : "") ||
      "";
    this.defaultModel =
      env?.DASHSCOPE_MODEL ||
      (typeof process !== "undefined" ? process.env.DASHSCOPE_MODEL : "") ||
      MODEL_ROUTER[0];

    if (!this.apiKey) {
      throw new Error("DASHSCOPE_API_KEY not configured");
    }
  }

  private async callModel(model: string, messages: Array<{ role: string; content: string }>, temperature: number, maxTokens: number): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    };

    const resp = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`DashScope ${resp.status}: ${text.slice(0, 300)}`);
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DashScope returned empty response");
    }

    return content;
  }

  private async callWithFallback(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const models = [this.defaultModel, ...MODEL_ROUTER.filter((m) => m !== this.defaultModel)];
    let lastError: Error | null = null;

    for (const model of models) {
      try {
        const content = await this.callModel(model, messages, temperature, maxTokens);
        console.log(`[dashscope] ✅ ${model} succeeded`);
        return content;
      } catch (err: unknown) {
        const error = err as Error;
        const msg = error.message || "";
        // Only retry on 403 (model denied) or 429 (rate limit) — don't retry on auth errors
        if (msg.includes("403") || msg.includes("429") || msg.includes("AccessDenied") || msg.includes("RateLimit")) {
          console.warn(`[dashscope] ⚠️ ${model} failed (${msg.slice(0, 80)}), trying next...`);
          lastError = error;
          continue;
        }
        // Auth error or other — don't retry other models
        throw error;
      }
    }

    throw lastError || new Error("All DashScope models failed");
  }

  async generateJSON(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    schema?: unknown;
  }): Promise<unknown> {
    const messages: Array<{ role: string; content: string }> = [];

    if (params.systemInstruction) {
      messages.push({ role: "system", content: params.systemInstruction });
    }
    messages.push({ role: "user", content: params.prompt });

    const content = await this.callWithFallback(
      messages,
      params.temperature ?? 0.7,
      params.maxOutputTokens ?? 8192,
    );

    return JSON.parse(content);
  }

  async generateContentJSON(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    schema?: unknown;
  }): Promise<unknown> {
    return this.generateJSON({
      prompt: params.prompt,
      systemInstruction: params.systemInstruction,
      temperature: params.temperature,
      schema: params.schema,
    });
  }
}
