import type { MonetEDL, Shot } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

export type ReferenceMode = "strict_replication" | "inspired";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function averageShotDuration(shots: Shot[]): number {
  if (shots.length === 0) return 0;
  return shots.reduce((sum, shot) => sum + shot.timing.duration, 0) / shots.length;
}

function reflowTimeline(shots: Shot[], totalDuration: number): Shot[] {
  const result: Shot[] = [];
  let t = 0;
  for (const shot of shots) {
    if (t >= totalDuration) break;
    const nextDuration = clamp(shot.timing.duration, 0.5, Math.max(0.5, totalDuration - t));
    result.push({
      ...shot,
      timing: {
        ...shot.timing,
        startTime: t,
        duration: nextDuration,
      },
    });
    t += nextDuration;
  }
  return result;
}

function enforceTransitionMix(
  shots: Shot[],
  cutRatioTarget: number,
  mode: ReferenceMode,
): Shot[] {
  if (shots.length === 0) return shots;
  const targetCutShots = Math.round(cutRatioTarget * shots.length);
  return shots.map((shot, i) => {
    const shouldCut = i < targetCutShots;
    if (shouldCut) {
      return {
        ...shot,
        transition: { type: "cut", duration: 0 },
      };
    }
    return {
      ...shot,
      transition: {
        type: mode === "strict_replication" ? "crossfade" : shot.transition?.type ?? "crossfade",
        duration: clamp(shot.transition?.duration ?? 0.25, 0.1, 0.5),
      },
    };
  });
}

function enforceEffectsDensity(
  shots: Shot[],
  effectsFrequencyTarget: number,
  intensity: number,
): Shot[] {
  if (shots.length === 0) return shots;
  const targetWithEffects = Math.round(effectsFrequencyTarget * shots.length);

  return shots.map((shot, i) => {
    if (i < targetWithEffects) {
      if (shot.effects && shot.effects.length > 0) return shot;
      return {
        ...shot,
        effects: [{ id: `effect-glow-${i}`, type: "glow", intensity: clamp(intensity, 0.2, 0.8) }],
      };
    }
    return {
      ...shot,
      effects: [],
    };
  });
}

function enforceBeatLock(shots: Shot[], beatGrid: number[]): Shot[] {
  if (beatGrid.length === 0) return shots;
  return shots.map((shot) => {
    const start = shot.timing.startTime;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < beatGrid.length; i++) {
      const dist = Math.abs(beatGrid[i] - start);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return {
      ...shot,
      beatLock: {
        beatIndex: bestIdx,
        lockMode: "start",
      },
    };
  });
}

export function enforceReferenceStyleOnEDL(
  edl: MonetEDL,
  style: ReferenceStyle,
  mode: ReferenceMode,
): MonetEDL {
  if (!Array.isArray(edl.shots) || edl.shots.length === 0) return edl;

  const strict = mode === "strict_replication";
  const targetAvg = clamp(style.rhythm.avgShotDuration, 0.6, 8);
  const currentAvg = averageShotDuration(edl.shots);
  const scale = currentAvg > 0 ? targetAvg / currentAvg : 1;
  const scaleClamp = strict ? [0.75, 1.35] : [0.6, 1.6];
  const scaled = edl.shots.map((shot) => ({
    ...shot,
    timing: {
      ...shot.timing,
      duration: clamp(shot.timing.duration * clamp(scale, scaleClamp[0], scaleClamp[1]), 0.5, 8),
    },
  }));

  const reflowed = reflowTimeline(scaled, edl.timeline.duration);
  const withTransitions = enforceTransitionMix(
    reflowed,
    clamp(style.effects.transitionsBreakdown.cutPercentage, 0.5, 0.99),
    mode,
  );
  const withEffects = enforceEffectsDensity(
    withTransitions,
    clamp(style.effects.effectsFrequency, 0, 0.9),
    style.effects.overallIntensity,
  );

  const processedShots = edl.music?.beatGrid?.length
    ? enforceBeatLock(withEffects, edl.music.beatGrid)
    : withEffects;

  const finalShots = processedShots.map((shot) => ({
    ...shot,
    meta: {
      ...shot.meta,
      styleMode: mode,
      styleTags: Array.from(new Set([...(shot.meta?.styleTags || []), "strict_reference"])),
    },
  }));

  return {
    ...edl,
    shots: finalShots,
    globalEffects: {
      ...edl.globalEffects,
      colorGrade: style.intentMapping.colorTreatment,
    },
  };
}
