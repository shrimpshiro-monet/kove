import type { SimplifiedIntent } from "../types/intent";

export type JsonRecord = Record<string, unknown>;

export interface NormalizedIntent extends SimplifiedIntent {
  // Flat helpers for prompt building and legacy deterministic path compatibility
  prompt: string;
  durationSeconds: number;
  styleName: string;
  colorGrade?: string;
  constraints: string[];
  pillarWeights?: {
    brutalistImpact: number;
    tensionPivot: number;
    vocalFlowSync: number;
    legacyMontage: number;
  };
  directorParams?: {
    climaxPosition: number;
    restraintLevel: "minimal" | "moderate" | "heavy";
    heroMomentCount: number;
    crossClipBias: number;
  };
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecord(value: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

export function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

export function readNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === "string" && candidate.trim().length > 0) {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function readStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value)) return [];
  const candidate = value[key];

  if (!Array.isArray(candidate)) return [];

  const output: string[] = [];
  const seen = new Set<string>();

  for (const item of candidate) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

export function clampDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(600, value));
}

export function inferStyleFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("wong kar-wai") || lower.includes("wong kar wai")) {
    return "wong-kar-wai";
  }

  if (lower.includes("cinematic")) return "cinematic";
  if (lower.includes("hype") || lower.includes("reel")) return "hype";
  if (lower.includes("vintage")) return "vintage";
  if (lower.includes("anime")) return "anime";
  if (lower.includes("monochrome") || lower.includes("black and white")) return "monochrome";

  return "auto";
}

export function inferColorGradeFromPrompt(prompt: string, style: string): string | undefined {
  const lower = prompt.toLowerCase();

  if (style === "wong-kar-wai" || lower.includes("wong kar-wai") || lower.includes("wong kar wai")) {
    return "wong-kar-wai";
  }

  if (lower.includes("teal") && lower.includes("orange")) return "cinematic";
  if (lower.includes("vintage")) return "vintage";
  if (lower.includes("monochrome") || lower.includes("black and white")) return "monochrome";
  if (lower.includes("vibrant")) return "vibrant";

  return undefined;
}

export function normalizePacing(
  pacing: string | undefined
): "slow" | "medium" | "fast" | "aggressive" {
  const p = pacing?.toLowerCase();
  if (p === "slow") return "slow";
  if (p === "fast") return "fast";
  if (p === "aggressive") return "aggressive";
  return "medium";
}

export function normalizeTransitionStyle(
  style: string | undefined
): "cut" | "smooth" | "dynamic" {
  const s = style?.toLowerCase();
  if (s === "smooth") return "smooth";
  if (s === "dynamic") return "dynamic";
  return "cut";
}

export function normalizeIntent(params: {
  rawIntent: unknown;
  prompt?: string;
  requestedDurationSeconds?: number;
  analysis?: unknown;
}): NormalizedIntent {
  const rawIntent = params.rawIntent;
  const edit = readRecord(rawIntent, "edit");
  const timeline = readRecord(rawIntent, "timeline");

  const prompt =
    params.prompt?.trim() ||
    readString(rawIntent, "prompt") ||
    readString(rawIntent, "goal") ||
    readString(edit, "prompt") ||
    "Generate a polished video edit.";

  const styleName =
    readString(rawIntent, "style") ||
    readString(edit, "style") ||
    inferStyleFromPrompt(prompt);

  const durationCandidates = [
    params.requestedDurationSeconds,
    readNumber(rawIntent, "durationSeconds"),
    readNumber(rawIntent, "targetDuration"),
    readNumber(rawIntent, "duration"),
    readNumber(edit, "durationSeconds"),
    readNumber(edit, "targetDuration"),
    readNumber(edit, "duration"),
    readNumber(timeline, "duration"),
    durationFromAnalysis(params.analysis),
    30,
  ];

  const firstDuration = durationCandidates.find(
    (candidate): candidate is number =>
      typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
  );

  const durationSeconds = clampDurationSeconds(firstDuration ?? 30);

  const rawPacing =
    readString(rawIntent, "pacing") ||
    readString(edit, "pacing") ||
    (styleName === "hype" ? "fast" : styleName === "wong-kar-wai" ? "slow" : "medium");

  const constraints = [
    ...readStringArray(rawIntent, "constraints"),
    ...readStringArray(edit, "constraints"),
  ];

  const colorGrade =
    readString(rawIntent, "colorGrade") ||
    readString(edit, "colorGrade") ||
    inferColorGradeFromPrompt(prompt, styleName);

  const pillarWeights = (rawIntent as any).pillarWeights || undefined;
  const directorParams = (rawIntent as any).directorParams || undefined;

  return {
    version: "1.0.0",
    goal: {
      primary:
        readString(rawIntent, "goal") ||
        readString(edit, "goal") ||
        prompt,
    },
    style: {
      genre: styleName,
      pacing: normalizePacing(rawPacing),
      mood: readStringArray(rawIntent, "mood") || readStringArray(edit, "mood") || [styleName],
    },
    structure: {
      duration: durationSeconds,
      energyCurve: [0.5, 0.6, 0.7, 0.8, 0.6],
    },
    technical: {
      syncToBeat: true,
      beatSyncStrength: 0.8,
      transitionStyle: normalizeTransitionStyle(
        readString(rawIntent, "transitionStyle") || readString(edit, "transitionStyle")
      ),
      colorTreatment: colorGrade || "raw",
      effectsIntensity: 0.6,
    },
    contentPreferences: {
      focusOn: readStringArray(rawIntent, "focusOn") || readStringArray(edit, "focusOn") || [],
    },
    // Flat helpers
    prompt,
    durationSeconds,
    styleName,
    colorGrade,
    constraints,
    pillarWeights,
    directorParams,
  };
}

export function durationFromAnalysis(analysis: unknown): number | undefined {
  if (!isRecord(analysis)) return undefined;

  const directDuration = readNumber(analysis, "duration");
  if (directDuration !== undefined) return directDuration;

  const clip = readRecord(analysis, "clip");
  const clipDuration = readNumber(clip, "duration");
  if (clipDuration !== undefined) return clipDuration;

  const video = readRecord(analysis, "video");
  const videoDuration = readNumber(video, "duration");
  if (videoDuration !== undefined) return videoDuration;

  const clipAnalysis = readRecord(analysis, "clipAnalysis");
  const clipAnalysisDuration = readNumber(clipAnalysis, "duration");
  if (clipAnalysisDuration !== undefined) return clipAnalysisDuration;

  const segments = Array.isArray((analysis as any).segments) ? (analysis as any).segments : [];
  let maxEnd = 0;
  let summedDuration = 0;

  for (const segment of segments) {
    if (!isRecord(segment)) continue;

    const start = readNumber(segment, "start") ?? 0;
    const end = readNumber(segment, "end");
    const duration = readNumber(segment, "duration");

    if (end !== undefined) {
      maxEnd = Math.max(maxEnd, end);
    }

    if (duration !== undefined) {
      summedDuration += Math.max(0, duration);
    } else if (end !== undefined) {
      summedDuration += Math.max(0, end - start);
    }
  }

  if (maxEnd > 0) return maxEnd;
  if (summedDuration > 0) return summedDuration;

  return undefined;
}
