export type EditIntensity = "low" | "medium" | "high" | "extreme";

export type StyleDirectives = {
  mode: "inspired" | "strict_replication";

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
  mode: "inspired" | "strict_replication"
): StyleDirectives {
  const pacing = normalizePacing(referenceStyle?.intentMapping?.pacing);
  const avgShotDuration = Number(referenceStyle?.rhythm?.avgShotDuration ?? 1.2);
  const cutAlignment = normalizeCutAlignment(referenceStyle?.rhythm?.cutAlignment);

  const highEnergy =
    mode === "strict_replication" ||
    pacing.includes("fast") ||
    pacing.includes("high") ||
    avgShotDuration < 1.0;

  const extremeEnergy =
    mode === "strict_replication" &&
    (avgShotDuration < 0.8 || pacing.includes("fast"));

  return {
    mode,

    pacing: {
      targetAvgShotDurationSec: highEnergy
        ? Math.max(0.28, Math.min(avgShotDuration, 0.85))
        : Math.max(0.75, Math.min(avgShotDuration, 1.8)),
      maxShotDurationSec: highEnergy ? 1.25 : 2.4,
      minShotDurationSec: highEnergy ? 0.16 : 0.35,
      cutDensity: extremeEnergy ? "extreme" : highEnergy ? "high" : "medium",
      microcutAllowed: highEnergy,
    },

    rhythm: {
      beatAlignment:
        cutAlignment.includes("transient") || cutAlignment.includes("hard") || cutAlignment.includes("tight")
          ? "transient_locked"
          : highEnergy
            ? "beat_locked"
            : "loose",
      hitMajorTransients: highEnergy,
      requireDropMoment: highEnergy,
    },

    motion: {
      pushInFrequency: extremeEnergy ? "extreme" : highEnergy ? "high" : "medium",
      speedRampFrequency: extremeEnergy ? "high" : highEnergy ? "medium" : "low",
      cameraShakeFrequency: highEnergy ? "medium" : "low",
      velocityCurveStyle: highEnergy ? "bezier_punchy" : "ease",
    },

    effects: {
      flashFrequency: extremeEnergy ? "extreme" : highEnergy ? "high" : "medium",
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
      minEffectsPer10Sec: extremeEnergy ? 8 : highEnergy ? 5 : 2,
      minMotionEventsPer10Sec: extremeEnergy ? 6 : highEnergy ? 4 : 1,
      minBeatLockedCutsPercent: highEnergy ? 70 : 35,
    },
  };
}