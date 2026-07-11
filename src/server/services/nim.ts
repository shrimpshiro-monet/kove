// NVIDIA NIM AI Service with model router
// Primary: GLM/Kimi models via NVIDIA NIM → fallback: Gemini

import type { Env } from "../types/env";

const NIM_BASE = "https://integrate.api.nvidia.com/v1";

// Priority: Kimi → DeepSeek → GLM → other NIM models
const NIM_MODELS = [
  "moonshotai/kimi-k2.6",
  "deepseek-ai/deepseek-r1",
  "zhipu/glm-4-plus",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
];

export class NIMService {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.defaultModel = model || NIM_MODELS[0];
    if (!this.apiKey) throw new Error("NVIDIA NIM API key not configured");
  }

  static fromEnv(env?: Env): NIMService {
    const key =
      env?.NVIDIA_NIM_API_KEY ||
      (typeof process !== "undefined" ? process.env.NVIDIA_NIM_API_KEY : "") ||
      "";
    const model =
      env?.NVIDIA_NIM_MODEL ||
      (typeof process !== "undefined" ? process.env.NVIDIA_NIM_MODEL : "") ||
      "";
    return new NIMService(key, model || undefined);
  }

  private async callModel(model: string, messages: Array<{ role: string; content: string }>, temperature: number, maxTokens: number): Promise<string> {
    const resp = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        extra_body: { enable_thinking: false },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`NIM ${resp.status}: ${text.slice(0, 300)}`);
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("NIM returned empty response");
    return content;
  }

  private async callWithFallback(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const models = [this.defaultModel, ...NIM_MODELS.filter((m) => m !== this.defaultModel)];
    let lastError: Error | null = null;

    for (const model of models) {
      try {
        const content = await this.callModel(model, messages, temperature, maxTokens);
        console.log(`[nim] ✅ ${model} succeeded`);
        return content;
      } catch (err: unknown) {
        const error = err as Error;
        const msg = error.message || "";
        if (msg.includes("403") || msg.includes("429") || msg.includes("503") || msg.includes("rate")) {
          console.warn(`[nim] ⚠️ ${model} failed (${msg.slice(0, 80)}), trying next...`);
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error("All NIM models failed");
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
      params.maxOutputTokens ?? 32768,
    );

    // NIM may return markdown-wrapped JSON — extract the JSON object
    let raw = content.trim();
    // Strip markdown code fences
    raw = raw.replace(/^```[\s\S]*?\n/, "").replace(/\n\s*```\s*$/, "").trim();
    // Strip thinking tokens / non-ASCII garbage from reasoning models
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // Remove non-ASCII chars that leak from Chinese reasoning models
    raw = raw.replace(/[^\x00-\x7F]/g, (ch) => {
      // Keep common Chinese punctuation that might appear in strings
      return "";
    });
    // Find first { and last } to extract JSON object
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      raw = raw.substring(firstBrace, lastBrace + 1);
    }
    // Try parsing, with repair attempts for common issues
    try {
      return JSON.parse(raw);
    } catch {
      // Fix trailing commas
      let fixed = raw.replace(/,\s*([\]}])/g, "$1");
      // Close unclosed brackets/braces (truncation repair)
      const opens = (fixed.match(/[{[]/g) || []).length;
      const closes = (fixed.match(/[}\]]/g) || []).length;
      for (let i = 0; i < opens - closes; i++) {
        // Check if last unclosed was [ or {
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
        // Last resort: find largest valid JSON
        for (let end = fixed.lastIndexOf("}"); end > 0; end = fixed.lastIndexOf("}", end - 1)) {
          try {
            return JSON.parse(fixed.substring(0, end + 1));
          } catch { /* continue */ }
        }
        throw new Error(`Invalid JSON from NIM: ${raw.slice(0, 200)}`);
      }
    }
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
