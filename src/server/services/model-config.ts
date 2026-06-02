import type { Env } from "../types/env";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";

export function getConfiguredGeminiModel(env?: Env): string {
  return (
    env?.VERTEX_GEMINI_MODEL ||
    env?.GEMINI_MODEL ||
    (typeof process !== "undefined" ? process.env.VERTEX_GEMINI_MODEL : "") ||
    (typeof process !== "undefined" ? process.env.GEMINI_MODEL : "") ||
    DEFAULT_GEMINI_MODEL
  );
}