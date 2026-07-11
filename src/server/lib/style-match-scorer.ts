import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

interface StyleMatchScore {
  total: number;
  breakdown: {
    shotDuration: number;
    cutFrequency: number;
    effectVocabulary: number;
    transitionStyle: number;
  };
  details: string[];
}

function scoreShotDuration(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  if (edl.shots.length === 0) return { score: 0, detail: "No shots in EDL" };

  const totalDuration = edl.shots.reduce((sum, s) => sum + s.timing.duration, 0);
  const edlAvg = totalDuration / edl.shots.length;
  const refAvg = reference.rhythm.avgShotDuration;

  const diff = Math.abs(edlAvg - refAvg);
  const tolerance = refAvg * 0.3;

  if (diff <= tolerance * 0.5) {
    return { score: 25, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (excellent)` };
  }
  if (diff <= tolerance) {
    return { score: 20, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (good)` };
  }
  if (diff <= tolerance * 2) {
    return { score: 15, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (fair)` };
  }
  if (diff <= tolerance * 3) {
    return { score: 10, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (poor)` };
  }
  return { score: 5, detail: `Shot duration mismatch: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s` };
}

function scoreCutFrequency(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  if (edl.timeline.duration <= 0) return { score: 0, detail: "Zero duration timeline" };

  const edlCutsPerSec = edl.shots.length / edl.timeline.duration;
  const refCutsPerSec = 1 / reference.rhythm.avgShotDuration;

  const diff = Math.abs(edlCutsPerSec - refCutsPerSec);
  const tolerance = refCutsPerSec * 0.3;

  if (diff <= tolerance * 0.5) {
    return { score: 25, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (excellent)` };
  }
  if (diff <= tolerance) {
    return { score: 20, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (good)` };
  }
  if (diff <= tolerance * 2) {
    return { score: 15, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (fair)` };
  }
  if (diff <= tolerance * 3) {
    return { score: 10, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (poor)` };
  }
  return { score: 5, detail: `Cut frequency mismatch: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s` };
}

function scoreEffectVocabulary(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  const refEffects = new Set(reference.effects.commonEffects.map(e => e.toLowerCase()));

  if (reference.effectVocabulary) {
    for (const shot of reference.effectVocabulary) {
      for (const e of shot.effects) {
        refEffects.add(e.type.toLowerCase());
      }
    }
  }

  const edlEffects = new Set<string>();

  for (const shot of edl.shots) {
    if (shot.effects) {
      for (const effect of shot.effects) {
        edlEffects.add(effect.type.toLowerCase());
      }
    }
  }

  if (refEffects.size === 0 && edlEffects.size === 0) {
    return { score: 25, detail: "No effects in either (neutral match)" };
  }
  if (refEffects.size === 0) {
    return { score: 10, detail: `EDL has ${edlEffects.size} effects but reference has none` };
  }
  if (edlEffects.size === 0) {
    return { score: 5, detail: "EDL has no effects but reference expects effects" };
  }

  const matched = Array.from(refEffects).filter(e => edlEffects.has(e));
  const coverage = matched.length / refEffects.size;

  const score = Math.round(5 + coverage * 20);
  return {
    score: Math.min(25, Math.max(5, score)),
    detail: `Effect vocabulary: ${matched.length}/${refEffects.size} reference effects used (${(coverage * 100).toFixed(0)}%)`,
  };
}

function scoreTransitionStyle(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  let cuts = 0;
  let crossfades = 0;
  let other = 0;
  let withTransition = 0;

  for (const shot of edl.shots) {
    if (shot.transition) {
      withTransition++;
      const t = shot.transition.type.toLowerCase();
      if (t === "cut") {
        cuts++;
      } else if (t === "crossfade" || t === "dissolve") {
        crossfades++;
      } else {
        other++;
      }
    }
  }

  const total = withTransition > 0 ? withTransition : edl.shots.length;

  if (total === 0) {
    return { score: 15, detail: "No transition data available" };
  }

  const edlCutPct = cuts / total;
  const refCutPct = reference.effects.transitionsBreakdown.cutPercentage;

  const diff = Math.abs(edlCutPct - refCutPct);
  const tolerance = 0.15;

  if (diff <= tolerance * 0.5) {
    return { score: 25, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (excellent)` };
  }
  if (diff <= tolerance) {
    return { score: 20, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (good)` };
  }
  if (diff <= tolerance * 2) {
    return { score: 15, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (fair)` };
  }
  return { score: 10, detail: `Transition style mismatch: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}%` };
}

export function scoreStyleMatch(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): StyleMatchScore {
  const details: string[] = [];

  const shotDuration = scoreShotDuration(edl, referenceStyle);
  const cutFrequency = scoreCutFrequency(edl, referenceStyle);
  const effectVocabulary = scoreEffectVocabulary(edl, referenceStyle);
  const transitionStyle = scoreTransitionStyle(edl, referenceStyle);

  details.push(shotDuration.detail);
  details.push(cutFrequency.detail);
  details.push(effectVocabulary.detail);
  details.push(transitionStyle.detail);

  return {
    total: shotDuration.score + cutFrequency.score + effectVocabulary.score + transitionStyle.score,
    breakdown: {
      shotDuration: shotDuration.score,
      cutFrequency: cutFrequency.score,
      effectVocabulary: effectVocabulary.score,
      transitionStyle: transitionStyle.score,
    },
    details,
  };
}
