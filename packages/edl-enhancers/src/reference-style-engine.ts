import type { ReferenceStyle } from "@monet/edl/src/analysis-types";

export interface DirectingSignals {
  cutDensity: number;
  motionIntensity: number;
  captionDensity: number;
  effectIntensity: number;
  narrativeWeight: number;
  colorGradePreset: "cinematic" | "vibrant" | "vintage" | "monochrome" | "anime" | "sports";
  styleClass: "viral" | "cinematic" | "hybrid" | "default";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function classifyStyle(style?: ReferenceStyle): "viral" | "cinematic" | "hybrid" | "default" {
  if (!style) return "default";

  const avgShotDuration = style.rhythm?.avgShotDuration || style.intentMapping?.avgShotDuration || 2.5;
  const cuts = avgShotDuration > 0 ? 60 / avgShotDuration : 24;

  let motion = 1.0;
  if (style.shotLanguage?.motionPreference === "moving") motion = 1.4;
  else if (style.shotLanguage?.motionPreference === "static") motion = 0.6;

  if (cuts > 30 && motion > 1.2) return "viral";
  if (cuts < 18) return "cinematic";
  return "hybrid";
}

export function deriveHybridSignals(style?: ReferenceStyle): DirectingSignals {
  if (!style) {
    return {
      cutDensity: 1.0,
      motionIntensity: 1.0,
      captionDensity: 0.6,
      effectIntensity: 0.8,
      narrativeWeight: 1.0,
      colorGradePreset: "sports",
      styleClass: "default",
    };
  }

  const styleClass = classifyStyle(style);

  // Parse actual ReferenceStyle fields defensively to derive raw variables
  const avgShotDuration = style.rhythm?.avgShotDuration || style.intentMapping?.avgShotDuration || 2.5;
  const baseCuts = avgShotDuration > 0 ? 60 / avgShotDuration : 24;

  let baseMotion = 1.0;
  if (style.shotLanguage?.motionPreference === "moving") baseMotion = 1.4;
  else if (style.shotLanguage?.motionPreference === "static") baseMotion = 0.6;
  if (style.pillarScores?.brutalistImpact) {
    baseMotion += style.pillarScores.brutalistImpact * 0.4;
  }

  let baseCaptions = 0.6;
  if (style.textStyle?.pacing === "snappy") baseCaptions = 0.95;
  else if (style.textStyle?.pacing === "lingering") baseCaptions = 0.45;
  else if (style.textStyle?.pacing === "none") baseCaptions = 0.0;

  const baseEffects = style.effects?.overallIntensity ?? style.intentMapping?.effectsIntensity ?? 0.5;

  let saturation = 0.5;
  if (style.visualStyle?.saturationLevel === "desaturated") saturation = 0.25;
  else if (style.visualStyle?.saturationLevel === "natural") saturation = 0.5;
  else if (style.visualStyle?.saturationLevel === "saturated") saturation = 0.75;
  else if (style.visualStyle?.saturationLevel === "hyper-saturated") saturation = 1.0;

  // 🔥 HYBRID LOGIC
  const cinematicFactor = 1 - saturation * 0.5;
  const viralBoost = clamp(baseCuts / 80, 0.8, 2.5);

  let cutDensity = clamp((baseCuts / 60) * (0.7 + viralBoost * 0.3), 0.6, 2.2);
  let motionIntensity = clamp(baseMotion * 1.1, 0.8, 2.0);
  let captionDensity = clamp(baseCaptions * 0.9 + 0.2, 0.4, 1.2);
  let effectIntensity = clamp(baseEffects * 1.15, 0.7, 2.0);
  let narrativeWeight = clamp(cinematicFactor, 0.7, 1.2);

  // Determine colorGradePreset
  let colorGradePreset: DirectingSignals["colorGradePreset"] = "sports";
  const refColor = (style.visualStyle?.colorGrade as string) || (style.intentMapping?.colorTreatment as string);
  if (refColor === "cinematic") {
    colorGradePreset = "cinematic";
  } else if (refColor === "vibrant" || refColor === "saturated" || refColor === "hyper-saturated") {
    colorGradePreset = "vibrant";
  } else if (refColor === "vintage") {
    colorGradePreset = "vintage";
  } else if (refColor === "monochrome") {
    colorGradePreset = "monochrome";
  } else if (refColor === "anime") {
    colorGradePreset = "anime";
  }

  // Smart Hybrid Brain overrides based on styleClass
  if (styleClass === "viral") {
    cutDensity *= 1.2;
    effectIntensity *= 1.3;
    motionIntensity *= 1.1;
  } else if (styleClass === "cinematic") {
    cutDensity *= 0.8;
    motionIntensity *= 0.9;
    colorGradePreset = "cinematic";
  }

  return {
    cutDensity: clamp(cutDensity, 0.5, 3.0),
    motionIntensity: clamp(motionIntensity, 0.5, 2.5),
    captionDensity: clamp(captionDensity, 0.0, 2.0),
    effectIntensity: clamp(effectIntensity, 0.4, 2.5),
    narrativeWeight: clamp(narrativeWeight, 0.5, 2.0),
    colorGradePreset,
    styleClass,
  };
}
