import type { Env } from "../types/env";
import type { StyleDNA } from "../../lib/style-dna/types";
import { STYLE_LIBRARY, findStyleByTrigger } from "../../lib/style-dna/library";
import { getAIService } from "./ai-service";
import { loadPromptTemplate } from "../prompts";
import { withRetry } from "../lib/retry";

const COMPILE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface CompiledStyle {
  style: StyleDNA;
  cached: boolean;
  source: "exact" | "trigger_direct" | "trigger_blend" | "llm_compiled" | "fallback";
}

function hashPrompt(prompt: string): string {
  const normalized = prompt.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

const BLEND_KEYWORDS = ["meets", "mix", "blend", "but", "vs", "versus", "mashup", "with a touch of"];

function shouldUseDirectMatch(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return !BLEND_KEYWORDS.some((w) => lower.includes(w));
}

export async function compileStyle(
  env: Env,
  userPrompt: string,
): Promise<CompiledStyle> {
  const cacheKey = `style:v1:${hashPrompt(userPrompt)}`;

  if (env.MONET_KV) {
    try {
      const cached = await env.MONET_KV.get(cacheKey);
      if (cached) {
        const style = JSON.parse(cached) as StyleDNA;
        return { style, cached: true, source: "exact" };
      }
    } catch {}
  }

  const matched = findStyleByTrigger(userPrompt);

  if (matched.length === 1 && shouldUseDirectMatch(userPrompt)) {
    const style = matched[0];
    await persistStyle(env, cacheKey, style);
    return { style, cached: false, source: "trigger_direct" };
  }

  try {
    const template = loadPromptTemplate("compile-style.txt");
    const detectedTriggers = matched.map((s) => s.id).join(", ") || "(none)";
    const referenceJson = matched.length
      ? JSON.stringify(matched, null, 2)
      : JSON.stringify(Object.values(STYLE_LIBRARY).slice(0, 3), null, 2);

    const prompt = template
      .replace("{{USER_PROMPT}}", userPrompt)
      .replace("{{DETECTED_TRIGGERS}}", detectedTriggers)
      .replace("{{REFERENCE_STYLES_JSON}}", referenceJson);

    const ai = getAIService(env);
    const compiled = await withRetry(
      () =>
        ai.generateContentJSON<StyleDNA>({
          prompt,
          systemInstruction:
            "You are a master cinematographer and VFX director who outputs precise structured JSON aesthetic specs. Output ONLY valid JSON.",
          stage: "style_compile",
          temperature: 0.5,
        }),
      { retries: 2, baseDelay: 1000 },
    );

    compiled.id = compiled.id || `compiled_${hashPrompt(userPrompt)}`;
    compiled.sourceInfluences = [
      ...new Set([
        ...(compiled.sourceInfluences ?? []),
        ...matched.map((m) => m.id),
      ]),
    ];

    await persistStyle(env, cacheKey, compiled);
    return {
      style: compiled,
      cached: false,
      source: matched.length > 1 ? "trigger_blend" : "llm_compiled",
    };
  } catch (err: any) {
    console.error("[style-compiler] LLM failed, falling back to static match", err.message);

    const fallback = matched[0] ?? STYLE_LIBRARY.spiderverse_action;
    return { style: fallback, cached: false, source: "fallback" };
  }
}

async function persistStyle(env: Env, key: string, style: StyleDNA): Promise<void> {
  if (!env.MONET_KV) return;
  try {
    await env.MONET_KV.put(key, JSON.stringify(style), {
      expirationTtl: COMPILE_TTL_SECONDS,
    });
  } catch (e) {
    console.warn("[style-compiler] KV put failed:", e);
  }
}
