/**
 * Reference Translator — translates reference "feeling" to footage-appropriate constraints.
 *
 * For the "make it feel like this" scenario where reference and footage are different.
 */
import type { ClipAnalysis } from "./clip-analyzer";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReferenceConstraints {
  pacing: {
    avgShotDuration: number;
    cutFrequency: number;      // cuts per second
    breathingRoom: boolean;
  };
  effects: {
    allowedTypes: string[];
    intensity: number;         // 0-1
    perShotMax: number;
  };
  transitions: {
    allowedTypes: string[];
    defaultType: string;
    avgDuration: number;       // ms
  };
  color: {
    contrast: number;
    saturation: number;
    temperature: number;
  };
  speed: {
    rampFrequency: number;     // 0-1, how often to use speed ramps
    defaultRampProfile: string;
  };
  audio: {
    ducking: boolean;
    beatSync: boolean;
    sensitivity: number;
  };
}

// ── Translator ──────────────────────────────────────────────────────────────

/**
 * Translate a reference style to constraints that work with the actual footage.
 *
 * @param params.referenceStyle - The reference analysis (what the reference IS)
 * @param params.clipAnalyses - The user's footage analysis (what you HAVE)
 * @param params.mode - "strict" (copy) or "inspired" (translate feeling)
 */
export function translateReference(params: {
  referenceStyle: Record<string, unknown>;
  clipAnalyses: ClipAnalysis[];
  mode: "strict" | "inspired";
}): ReferenceConstraints {
  const { referenceStyle, clipAnalyses, mode } = params;

  const ref: Record<string, any> = (referenceStyle ?? {}) as Record<string, any>;
  const pacing = ref.pacing ?? {};
  const effects = ref.effects ?? {};
  const visualStyle = ref.visualStyle ?? {};
  const intentMapping = ref.intentMapping ?? {};

  // Determine footage characteristics
  const hasSpeech = clipAnalyses.some((a) => a.summary.hasNarration);
  const hasBroll = clipAnalyses.some((a) => a.summary.hasBroll);
  const avgMotion = clipAnalyses.reduce((sum, a) => sum + a.energy.avgMotion, 0) / Math.max(1, clipAnalyses.length);

  if (mode === "strict") {
    // Copy the reference exactly
    return {
      pacing: {
        avgShotDuration: ref.rhythm?.avgShotDuration ?? 1.0,
        cutFrequency: 1 / (ref.rhythm?.avgShotDuration ?? 1.0),
        breathingRoom: pacing.type === "varied",
      },
      effects: {
        allowedTypes: effects.commonEffects ?? ["speed_ramp", "impact_flash"],
        intensity: effects.overallIntensity ?? 0.5,
        perShotMax: 2,
      },
      transitions: {
        allowedTypes: ["cut", "crossfade"],
        defaultType: "cut",
        avgDuration: 200,
      },
      color: {
        contrast: visualStyle.contrastLevel === "high" ? 1.3 : visualStyle.contrastLevel === "low" ? 0.8 : 1.0,
        saturation: visualStyle.saturationLevel === "saturated" ? 1.3 : visualStyle.saturationLevel === "desaturated" ? 0.7 : 1.0,
        temperature: visualStyle.colorTemperature === "warm" ? 0.2 : visualStyle.colorTemperature === "cool" ? -0.2 : 0,
      },
      speed: {
        rampFrequency: effects.commonEffects?.includes("speed_ramp") ? 0.6 : 0,
        defaultRampProfile: "dramatic-slow",
      },
      audio: {
        ducking: hasSpeech,
        beatSync: intentMapping.syncToBeat ?? true,
        sensitivity: intentMapping.beatSyncStrength ?? 0.5,
      },
    };
  }

  // INSPIRED BY: translate the feeling
  const refPacing = pacing.type ?? "medium";
  const refMood = visualStyle.colorGrade ?? "cinematic";

  // Translate pacing
  let avgShotDuration: number;
  let cutFrequency: number;
  if (refPacing === "aggressive" || refPacing === "fast") {
    // Reference is fast — but if our footage has speech, we can't be AS fast
    avgShotDuration = hasSpeech ? 1.5 : 0.8;
    cutFrequency = 1 / avgShotDuration;
  } else if (refPacing === "slow") {
    avgShotDuration = 2.5;
    cutFrequency = 1 / avgShotDuration;
  } else {
    avgShotDuration = hasSpeech ? 1.8 : 1.2;
    cutFrequency = 1 / avgShotDuration;
  }

  // Translate mood to effects
  let allowedEffects: string[];
  let intensity: number;
  if (refMood === "cinematic" || refMood === "vintage") {
    allowedEffects = ["color_grade", "vignette", "film_grain"];
    intensity = 0.4;
  } else if (refMood === "vibrant" || refMood === "anime") {
    allowedEffects = ["color_grade", "glow", "impact_flash", "speed_ramp"];
    intensity = 0.7;
  } else {
    allowedEffects = ["speed_ramp", "impact_flash", "context_shake"];
    intensity = effects.overallIntensity ?? 0.5;
  }

  // Translate color
  let contrast: number;
  let saturation: number;
  let temperature: number;
  if (refMood === "cinematic") {
    contrast = 1.2;
    saturation = 0.9;
    temperature = -0.1;
  } else if (refMood === "vibrant") {
    contrast = 1.1;
    saturation = 1.3;
    temperature = 0.1;
  } else if (refMood === "vintage") {
    contrast = 1.0;
    saturation = 0.7;
    temperature = 0.2;
  } else {
    contrast = 1.1;
    saturation = 1.0;
    temperature = 0;
  }

  return {
    pacing: {
      avgShotDuration,
      cutFrequency,
      breathingRoom: refPacing === "varied" || refPacing === "slow",
    },
    effects: {
      allowedTypes: allowedEffects,
      intensity,
      perShotMax: intensity > 0.6 ? 2 : 1,
    },
    transitions: {
      allowedTypes: refPacing === "fast" ? ["cut"] : ["cut", "crossfade"],
      defaultType: "cut",
      avgDuration: refPacing === "fast" ? 100 : 300,
    },
    color: { contrast, saturation, temperature },
    speed: {
      rampFrequency: allowedEffects.includes("speed_ramp") ? 0.4 : 0,
      defaultRampProfile: refPacing === "fast" ? "ramp-in" : "dramatic-slow",
    },
    audio: {
      ducking: hasSpeech,
      beatSync: intentMapping.syncToBeat ?? true,
      sensitivity: intentMapping.beatSyncStrength ?? 0.5,
    },
  };
}
