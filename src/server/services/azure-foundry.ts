import type { Env } from "../types/env";

export const MODEL_STAGE_MAP = {
  intent: "gpt-5-nano",
  style_compile: "DeepSeek-V4-Flash",
  analyze_synthesis: "DeepSeek-V4-Flash",
  reference_synthesis: "DeepSeek-V4-Flash",
  edl_generation: "Mistral-Large-3",
  critique: "Phi-4-reasoning",
  fallback_primary: "gpt-5-mini",
  fallback_secondary: "Kimi-K2.6",
  fallback_tertiary: "qwen3-32b",
} as const;

export type ModelStage = keyof typeof MODEL_STAGE_MAP;

interface GenerateOpts {
  prompt: string | any[];
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  stage?: ModelStage;
  modelOverride?: string;
  schema?: any;
}

export class AzureFoundryService {
  private endpoint: string;
  private apiKey: string;
  private apiVersion = "2024-12-01-preview";

  constructor(env: Env) {
    this.endpoint = (env.AZURE_FOUNDRY_ENDPOINT || "").replace(/\/$/, "");
    this.apiKey = env.AZURE_FOUNDRY_KEY || "";
    if (!this.endpoint || !this.apiKey) {
      throw new Error("AZURE_FOUNDRY_ENDPOINT and AZURE_FOUNDRY_KEY must be set");
    }
  }

  async generateContentJSON<T>(opts: GenerateOpts): Promise<T> {
    const primary = opts.modelOverride ?? (opts.stage ? MODEL_STAGE_MAP[opts.stage] : MODEL_STAGE_MAP.edl_generation);
    const fallbackChain = [
      primary,
      MODEL_STAGE_MAP.fallback_primary,
      MODEL_STAGE_MAP.fallback_secondary,
      MODEL_STAGE_MAP.fallback_tertiary,
    ];
    return await this.tryWithFallback<T>(opts, fallbackChain);
  }

  private async tryWithFallback<T>(opts: GenerateOpts, modelChain: string[]): Promise<T> {
    let lastError: any = null;
    for (const model of modelChain) {
      try {
        return await this.callModel<T>(model, opts);
      } catch (err: any) {
        console.warn(`[azure-foundry] model ${model} failed:`, err.message);
        lastError = err;
      }
    }
    throw new Error(`All models failed. Last error: ${lastError?.message}`);
  }

  private async callModel<T>(model: string, opts: GenerateOpts): Promise<T> {
    const url = `${this.endpoint}/openai/deployments/${model}/chat/completions?api-version=${this.apiVersion}`;

    const messages: any[] = [];
    if (opts.systemInstruction) {
      messages.push({ role: "system", content: opts.systemInstruction });
    }

    const userContent = typeof opts.prompt === "string"
      ? opts.prompt
      : JSON.stringify(opts.prompt);
    messages.push({ role: "user", content: userContent });

    const body: any = {
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 8192,
      response_format: { type: "json_object" },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`${model} ${resp.status}: ${errText.slice(0, 400)}`);
    }

    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty content from ${model}`);
    }

    try {
      return JSON.parse(content) as T;
    } catch (parseErr: any) {
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      return JSON.parse(cleaned) as T;
    }
  }
}

let _instance: AzureFoundryService | null = null;
export function getAzureFoundry(env: Env): AzureFoundryService {
  if (!_instance) _instance = new AzureFoundryService(env);
  return _instance;
}
