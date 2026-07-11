import type { TempoMode } from "@monet/edl";

export type { TempoMode };
export type EditIntensity = "low" | "medium" | "high" | "extreme";

export type StyleDirectives = {
  mode: "inspired" | "strict_replication";
  tempoMode: TempoMode;

  pacing: {
    targetAvgShotDurationSec: number;
    maxShotDurationSec: number;
    minShotDurationSec: number;
    cutDensity: EditIntensity;
    microcutAllowed: boolean;
  };

  rhythm: {
    beatAlignment: "loose" | "beat_locked" | "transient_locked";
    hitMajorTransients: boolean;
    requireDropMoment: boolean;
  };

  motion: {
    pushInFrequency: EditIntensity;
    speedRampFrequency: EditIntensity;
    cameraShakeFrequency: EditIntensity;
    velocityCurveStyle: "linear" | "ease" | "bezier_punchy";
  };

  effects: {
    flashFrequency: EditIntensity;
    glowFrequency: EditIntensity;
    transitionFrequency: EditIntensity;
    allowedEffects: string[];
  };

  typography: {
    captionEnergy: EditIntensity;
    wordPopFrequency: EditIntensity;
    kineticTitleMoments: number;
  };

  color: {
    gradeIntensity: EditIntensity;
    lutFamily?: string;
    contrast: "low" | "medium" | "high";
    saturation: "low" | "medium" | "high";
  };

  minimumCreativeDensity: {
    minEffectsPer10Sec: number;
    minMotionEventsPer10Sec: number;
    minBeatLockedCutsPercent: number;
  };
};

function normalizePacing(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "medium";
}

function normalizeCutAlignment(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "loose";
}

export function compileReferenceStyleToDirectives(
  referenceStyle: any | null | undefined,
  mode: "inspired" | "strict_replication",
  tempoMode?: TempoMode
): StyleDirectives {
  const pacing = normalizePacing(referenceStyle?.intentMapping?.pacing);
  const avgShotDuration = Number(referenceStyle?.rhythm?.avgShotDuration ?? 1.2);
  const cutAlignment = normalizeCutAlignment(referenceStyle?.rhythm?.cutAlignment);

  // Derive tempo mode from reference if not explicitly set
  const effectiveTempo: TempoMode =
    tempoMode ??
    (mode === "strict_replication" ? "reference_mirror" : "narrative");

  const highEnergy =
    mode === "strict_replication" ||
    pacing.includes("fast") ||
    pacing.includes("high") ||
    avgShotDuration < 1.0;

  const extremeEnergy =
    mode === "strict_replication" &&
    (avgShotDuration < 0.8 || pacing.includes("fast"));

  // Tempo-aware overrides
  const tempoOverrides = getTempoOverrides(effectiveTempo);

  return {
    mode,
    tempoMode: effectiveTempo,

    pacing: {
      targetAvgShotDurationSec: tempoOverrides.avgShotDuration ??
        (highEnergy
          ? Math.max(0.28, Math.min(avgShotDuration, 0.85))
          : Math.max(0.75, Math.min(avgShotDuration, 1.8))),
      maxShotDurationSec: highEnergy ? 1.25 : 2.4,
      minShotDurationSec: highEnergy ? 0.16 : 0.35,
      cutDensity: extremeEnergy ? "extreme" : highEnergy ? "high" : "medium",
      microcutAllowed: highEnergy,
    },

    rhythm: {
      beatAlignment:
        effectiveTempo === "beat_locked" || effectiveTempo === "beat_anticipated"
          ? "beat_locked"
          : effectiveTempo === "reference_mirror"
            ? "transient_locked"
            : cutAlignment.includes("transient") || cutAlignment.includes("hard") || cutAlignment.includes("tight")
              ? "transient_locked"
              : highEnergy
                ? "beat_locked"
                : "loose",
      hitMajorTransients: highEnergy || effectiveTempo === "beat_anticipated",
      requireDropMoment: highEnergy || effectiveTempo === "beat_anticipated",
    },

    motion: {
      pushInFrequency: tempoOverrides.pushInFrequency ??
        (extremeEnergy ? "extreme" : highEnergy ? "high" : "medium"),
      speedRampFrequency: tempoOverrides.speedRampFrequency ??
        (extremeEnergy ? "high" : highEnergy ? "medium" : "low"),
      cameraShakeFrequency: highEnergy ? "medium" : "low",
      velocityCurveStyle: highEnergy ? "bezier_punchy" : "ease",
    },

    effects: {
      flashFrequency: tempoOverrides.flashFrequency ??
        (extremeEnergy ? "extreme" : highEnergy ? "high" : "medium"),
      glowFrequency: mode === "strict_replication" ? "medium" : "low",
      transitionFrequency: highEnergy ? "medium" : "low",
      allowedEffects: [
        "push_in",
        "impact_flash",
        "context_shake",
        "speed_ramp",
        "beat_cut",
        "whip_transition",
        "kinetic_caption",
        "color_pulse",
        "vignette_punch",
        "chromatic_burst",
      ],
    },

    typography: {
      captionEnergy: highEnergy ? "high" : "medium",
      wordPopFrequency: highEnergy ? "medium" : "low",
      kineticTitleMoments: highEnergy ? 2 : 1,
    },

    color: {
      gradeIntensity: mode === "strict_replication" ? "high" : "medium",
      lutFamily: referenceStyle?.visualStyle?.paletteName ?? undefined,
      contrast: highEnergy ? "high" : "medium",
      saturation: highEnergy ? "high" : "medium",
    },

    minimumCreativeDensity: {
      minEffectsPer10Sec: tempoOverrides.minEffectsPer10Sec ??
        (extremeEnergy ? 8 : highEnergy ? 5 : 2),
      minMotionEventsPer10Sec: extremeEnergy ? 6 : highEnergy ? 4 : 1,
      minBeatLockedCutsPercent: tempoOverrides.minBeatLockedCutsPercent ??
        (highEnergy ? 70 : 35),
    },
  };
}

function getTempoOverrides(tempo: TempoMode): Partial<{
  avgShotDuration: number;
  pushInFrequency: EditIntensity;
  speedRampFrequency: EditIntensity;
  flashFrequency: EditIntensity;
  minEffectsPer10Sec: number;
  minBeatLockedCutsPercent: number;
}> {
  switch (tempo) {
    case "beat_locked":
      return {
        pushInFrequency: "medium",
        speedRampFrequency: "low",
        flashFrequency: "high",
        minEffectsPer10Sec: 6,
        minBeatLockedCutsPercent: 85,
      };
    case "beat_anticipated":
      return {
        pushInFrequency: "high",
        speedRampFrequency: "high",
        flashFrequency: "high",
        minEffectsPer10Sec: 7,
        minBeatLockedCutsPercent: 80,
      };
    case "narrative":
      return {
        pushInFrequency: "low",
        speedRampFrequency: "low",
        flashFrequency: "low",
        minEffectsPer10Sec: 1,
        minBeatLockedCutsPercent: 20,
      };
    case "cinematic":
      return {
        avgShotDuration: 3.5,
        pushInFrequency: "medium",
        speedRampFrequency: "medium",
        flashFrequency: "low",
        minEffectsPer10Sec: 2,
        minBeatLockedCutsPercent: 30,
      };
    case "chill_vlog":
      return {
        avgShotDuration: 2.4,
        pushInFrequency: "low",
        speedRampFrequency: "low",
        flashFrequency: "low",
        minEffectsPer10Sec: 1,
        minBeatLockedCutsPercent: 25,
      };
    case "reference_mirror":
      return {
        pushInFrequency: "high",
        speedRampFrequency: "high",
        flashFrequency: "high",
        minEffectsPer10Sec: 5,
        minBeatLockedCutsPercent: 70,
      };
  }
}