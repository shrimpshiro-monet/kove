import type { Env } from "../types/env";
import { getAIService } from "./ai-service";

export interface IntentRecord {
  id: string;
  intent: unknown;
  prompt: string;
  threadId?: string;
  createdAt: number;
}

function hashPrompt(prompt: string): string {
  let hash = 5381;
  for (let i = 0; i < prompt.length; i++) {
    hash = ((hash << 5) + hash) ^ prompt.charCodeAt(i);
  }

  return `intent-${Math.abs(hash).toString(36)}`;
}

function intentKey(id: string): string {
  return `intent:${id}`;
}

function promptIntentKey(prompt: string): string {
  return `intent-prompt:${hashPrompt(prompt)}`;
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

async function kvGetJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.MONET_KV?.get(key);
  if (!raw || typeof raw !== "string") return null;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("[intent-service] Failed to parse KV JSON", { key, error });
    return null;
  }
}

async function kvPutJson(env: Env, key: string, value: unknown): Promise<void> {
  await env.MONET_KV?.put(key, JSON.stringify(value));
}

export async function getIntentById(env: Env, intentId: string): Promise<unknown | null> {
  const record = await kvGetJson<IntentRecord>(env, intentKey(intentId));
  return record?.intent ?? null;
}

export async function getCachedIntentByPrompt(
  env: Env,
  prompt: string
): Promise<{ id: string; intent: unknown } | null> {
  const normalizedPrompt = normalizePrompt(prompt);
  const record = await kvGetJson<IntentRecord>(env, promptIntentKey(normalizedPrompt));

  if (!record?.id || !record.intent) {
    return null;
  }

  return {
    id: record.id,
    intent: record.intent,
  };
}

export async function createIntentFromPrompt(
  env: Env,
  params: {
    prompt: string;
    threadId?: string;
    style?: string;
    durationSeconds?: number;
  }
): Promise<{ id: string; intent: unknown }> {
  const prompt = normalizePrompt(params.prompt);
  const cached = await getCachedIntentByPrompt(env, prompt);

  if (cached) {
    return cached;
  }

  const id = hashPrompt(`${params.threadId ?? "global"}:${prompt}`);

  const ai = getAIService(env);

  const intent = await ai.generateContentJSON({
    prompt: [
      {
        text:
          `Convert this user edit request into a structured video-editing intent.\n\n` +
          `Prompt: ${prompt}\n` +
          `Thread ID: ${params.threadId ?? "unknown"}\n` +
          `Style: ${params.style ?? "auto"}\n` +
          `Target duration seconds: ${params.durationSeconds ?? 30}\n\n` +
          `Return JSON only.`,
      },
    ],
    stage: "intent",
    temperature: 0.3,
    schema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        style: { type: "string" },
        targetDuration: { type: "number" },
        pacing: { type: "string" },
        constraints: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["goal", "style", "targetDuration", "pacing"],
    },
  });

  const record: IntentRecord = {
    id,
    intent,
    prompt,
    threadId: params.threadId,
    createdAt: Date.now(),
  };

  await kvPutJson(env, intentKey(id), record);
  await kvPutJson(env, promptIntentKey(prompt), record);

  console.log("[intent-service] Intent cached", {
    intentId: id,
    threadId: params.threadId,
    promptPreview: prompt.slice(0, 80),
  });

  return {
    id,
    intent,
  };
}

// ─── Pillar validation and backfill fallback ─────────────────────────────
import type {
  IntentExtractionResult,
  PillarWeights,
  DirectorParams,
} from "../types/intent";
import {
  inferPillarsFromIntent,
  inferDirectorParams,
} from "../types/intent";

export function ensureCompleteIntent(
  result: IntentExtractionResult,
): IntentExtractionResult {
  // Pillar weights might be missing or all-zero if Gemini was lazy
  const pillarSum =
    (result.pillarWeights?.brutalistImpact ?? 0) +
    (result.pillarWeights?.tensionPivot ?? 0) +
    (result.pillarWeights?.vocalFlowSync ?? 0) +
    (result.pillarWeights?.legacyMontage ?? 0);

  let pillarWeights: PillarWeights = result.pillarWeights || { brutalistImpact: 0, tensionPivot: 0, vocalFlowSync: 0, legacyMontage: 0 };
  if (pillarSum < 0.1) {
    console.warn(
      "[intent-service] Gemini emitted zero pillar weights; inferring from intent",
    );
    pillarWeights = inferPillarsFromIntent(result.intent);
  }

  // DirectorParams sanity
  let directorParams: DirectorParams = result.directorParams;
  if (
    !directorParams ||
    !Number.isFinite(directorParams.climaxPosition) ||
    !directorParams.restraintLevel
  ) {
    console.warn(
      "[intent-service] Gemini emitted invalid directorParams; computing",
    );
    directorParams = inferDirectorParams(result.intent, pillarWeights);
  }

  // Clamp ranges
  Object.keys(pillarWeights).forEach((k) => {
    const key = k as keyof PillarWeights;
    pillarWeights[key] = Math.max(0, Math.min(1, pillarWeights[key]));
  });
  directorParams.climaxPosition = Math.max(
    0,
    Math.min(1, directorParams.climaxPosition),
  );
  directorParams.crossClipBias = Math.max(
    0,
    Math.min(1, directorParams.crossClipBias),
  );
  directorParams.heroMomentCount = Math.max(
    1,
    Math.min(10, Math.round(directorParams.heroMomentCount)),
  );

  return {
    ...result,
    pillarWeights,
    directorParams,
  };
}
