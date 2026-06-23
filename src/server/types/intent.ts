// src/server/types/intent.ts

export interface SimplifiedIntent {
  version: string;
  goal: { primary: string };
  style: {
    genre?: string;
    pacing: "slow" | "medium" | "fast" | "aggressive";
    mood?: string[];
  };
  structure: {
    duration: number;
    energyCurve: number[];
  };
  technical: {
    syncToBeat: boolean;
    beatSyncStrength: number;
    transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed";
    colorTreatment: string;
    effectsIntensity: number;
  };
  contentPreferences: { focusOn: string[] };
}

export interface PillarWeights {
  brutalistImpact: number;
  tensionPivot: number;
  vocalFlowSync: number;
  legacyMontage: number;
}

export interface DirectorParams {
  climaxPosition: number;     // 0-1
  restraintLevel: "minimal" | "moderate" | "heavy";
  heroMomentCount: number;
  crossClipBias: number;       // 0-1
  effectBudget: number;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface IntentExtractionResult {
  intent: SimplifiedIntent;
  pillarWeights: PillarWeights;
  directorParams: DirectorParams;
  confidence: number;
  clarifyingQuestions: ClarifyingQuestion[];
  reasoning: string;
}

export const INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "object",
      properties: {
        version: { type: "string" },
        goal: {
          type: "object",
          properties: { primary: { type: "string" } },
          required: ["primary"],
        },
        style: {
          type: "object",
          properties: {
            genre: { type: "string" },
            pacing: {
              type: "string",
              enum: ["slow", "medium", "fast", "aggressive"],
            },
            mood: { type: "array", items: { type: "string" } },
          },
          required: ["pacing"],
        },
        structure: {
          type: "object",
          properties: {
            duration: { type: "number" },
            energyCurve: { type: "array", items: { type: "number" } },
          },
          required: ["duration", "energyCurve"],
        },
        technical: {
          type: "object",
          properties: {
            syncToBeat: { type: "boolean" },
            beatSyncStrength: { type: "number" },
            transitionStyle: {
              type: "string",
              enum: ["cut", "smooth", "dynamic", "aggressive", "mixed"],
            },
            colorTreatment: { type: "string" },
            effectsIntensity: { type: "number" },
          },
          required: [
            "syncToBeat",
            "beatSyncStrength",
            "transitionStyle",
            "colorTreatment",
            "effectsIntensity",
          ],
        },
        contentPreferences: {
          type: "object",
          properties: {
            focusOn: { type: "array", items: { type: "string" } },
          },
          required: ["focusOn"],
        },
      },
      required: ["goal", "style", "structure", "technical", "contentPreferences"],
    },
    pillarWeights: {
      type: "object",
      properties: {
        brutalistImpact: { type: "number" },
        tensionPivot: { type: "number" },
        vocalFlowSync: { type: "number" },
        legacyMontage: { type: "number" },
      },
      required: [
        "brutalistImpact",
        "tensionPivot",
        "vocalFlowSync",
        "legacyMontage",
      ],
    },
    directorParams: {
      type: "object",
      properties: {
        climaxPosition: { type: "number" },
        restraintLevel: {
          type: "string",
          enum: ["minimal", "moderate", "heavy"],
        },
        heroMomentCount: { type: "number" },
        crossClipBias: { type: "number" },
        effectBudget: { type: "number" },
      },
      required: [
        "climaxPosition",
        "restraintLevel",
        "heroMomentCount",
        "crossClipBias",
        "effectBudget",
      ],
    },
    confidence: { type: "number" },
    clarifyingQuestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["id", "question", "options"],
      },
    },
  },
  required: [
    "intent",
    "pillarWeights",
    "directorParams",
    "confidence",
    "clarifyingQuestions",
  ],
} as const;

// ─── Pillar inference fallback (when prompt is too vague) ───────────────
export function inferPillarsFromIntent(
  intent: SimplifiedIntent,
): PillarWeights {
  const w: PillarWeights = {
    brutalistImpact: 0,
    tensionPivot: 0,
    vocalFlowSync: 0,
    legacyMontage: 0,
  };

  const genre = intent.style.genre ?? "";
  const pacing = intent.style.pacing;
  const moods = (intent.style.mood ?? []).join(" ").toLowerCase();

  // Genre-based priors
  if (/amv|anime|fan_edit|tiktok/i.test(genre)) w.brutalistImpact = 0.85;
  if (/trailer|cinematic/i.test(genre)) w.tensionPivot = 0.8;
  if (/music_video|rap/i.test(genre)) w.vocalFlowSync = 0.75;
  if (/wedding|tribute|memorial|montage|vlog/i.test(genre)) w.legacyMontage = 0.85;
  if (/sports_highlight/i.test(genre)) {
    w.brutalistImpact = 0.6;
    w.legacyMontage = 0.4;
  }
  if (/promo/i.test(genre)) {
    w.tensionPivot = 0.6;
    w.brutalistImpact = 0.4;
  }

  // Pacing-based priors
  if (pacing === "aggressive") w.brutalistImpact = Math.max(w.brutalistImpact, 0.7);
  if (pacing === "slow") w.legacyMontage = Math.max(w.legacyMontage, 0.6);

  // Mood-based priors
  if (/emotional|nostalgic|warm|tribute/.test(moods)) {
    w.legacyMontage = Math.max(w.legacyMontage, 0.7);
  }
  if (/explosive|chaotic|intense|hype/.test(moods)) {
    w.brutalistImpact = Math.max(w.brutalistImpact, 0.7);
  }
  if (/dramatic|cinematic|suspenseful/.test(moods)) {
    w.tensionPivot = Math.max(w.tensionPivot, 0.7);
  }

  // Normalize — if nothing fired, default to balanced
  const sum = w.brutalistImpact + w.tensionPivot + w.vocalFlowSync + w.legacyMontage;
  if (sum < 0.1) {
    w.brutalistImpact = 0.4;
    w.tensionPivot = 0.3;
  }

  return w;
}

export function inferDirectorParams(
  intent: SimplifiedIntent,
  pillars: PillarWeights,
): DirectorParams {
  const duration = intent.structure.duration;
  const pacing = intent.style.pacing;

  // climaxPosition by pillar dominance
  const dominantPillar = Object.entries(pillars).reduce(
    (best, [k, v]) => (v > best.v ? { k, v } : best),
    { k: "balanced", v: 0 },
  );
  const climaxByPillar: Record<string, number> = {
    brutalistImpact: 0.6,
    tensionPivot: 0.75,
    vocalFlowSync: 0.65,
    legacyMontage: 0.7,
    balanced: 0.65,
  };
  const climaxPosition = climaxByPillar[dominantPillar.k] ?? 0.65;

  // restraintLevel from pillar + pacing
  let restraintLevel: DirectorParams["restraintLevel"] = "moderate";
  if (pacing === "aggressive" || pillars.brutalistImpact > 0.7) {
    restraintLevel = "minimal";
  }
  if (pillars.legacyMontage > 0.6 || pacing === "slow") {
    restraintLevel = "heavy";
  }

  // heroMomentCount scales with duration
  const heroMomentCount = Math.max(1, Math.round(duration / 15));

  // crossClipBias — higher for aggressive, lower for legacy
  let crossClipBias = 0.5;
  if (pacing === "aggressive") crossClipBias = 0.8;
  if (pillars.legacyMontage > 0.6) crossClipBias = 0.3;

  // effectBudget scales with restraint
  const budgetByRestraint = { minimal: 50, moderate: 25, heavy: 12 };
  const effectBudget = Math.round(
    budgetByRestraint[restraintLevel] * (duration / 30),
  );

  return {
    climaxPosition,
    restraintLevel,
    heroMomentCount,
    crossClipBias,
    effectBudget,
  };
}
