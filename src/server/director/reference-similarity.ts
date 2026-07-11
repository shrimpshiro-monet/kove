import type { MonetEDL } from "../types/edl";
import type { ReferenceEditTrace, ReferenceEditEventType } from "./reference-edit-trace";

export type ReferenceSimilarityReport = {
  avgShotDurationSimilarity: number;
  eventSequenceSimilarity: number;
  energyCurveSimilarity: number;
  effectDensitySimilarity: number;
  pacingSimilarity: number;
  overall: number;
  failures: string[];
};

function getEffectId(effect: any): string {
  if (typeof effect === "string") return effect;
  return effect?.type ?? effect?.id ?? "unknown";
}

function mapEDLEffectToEventType(id: string): ReferenceEditEventType | null {
  if (id === "impact_flash" || id.includes("flash")) return "flash";
  if (id === "push_in" || id.includes("zoom")) return "push_in";
  if (id === "speed_ramp") return "speed_ramp";
  if (id === "context_shake" || id === "shake") return "shake";
  if (id === "whip_transition" || id.includes("whip")) return "whip";
  if (id === "color_pulse") return "color_pulse";
  if (id === "beat_cut") return "cut";
  return null;
}

export function compareReferenceTraceToEDL(
  trace: ReferenceEditTrace,
  edl: MonetEDL,
  vocabulary?: { totalEffects?: number; avgEffectsPerShot?: number } | null
): ReferenceSimilarityReport {
  const shots = edl.shots ?? [];
  const failures: string[] = [];

  // 1. Average Shot Duration Similarity
  const totalDuration = shots.reduce((sum, shot) => sum + (shot.timing?.duration ?? 0), 0);
  const avgShotDuration = shots.length > 0 ? totalDuration / shots.length : 0;

  const avgShotDiff = Math.abs(avgShotDuration - trace.avgShotDurationSec);
  // Use relative difference — 0.5s difference matters less for 3s shots than 0.5s shots
  const relativeDiff = trace.avgShotDurationSec > 0
    ? avgShotDiff / trace.avgShotDurationSec
    : avgShotDiff;
  const avgShotDurationSimilarity = Math.max(0, 1 - relativeDiff);

  // 2. Event Sequence Similarity — frequency-based, not exact count match
  const edlEventCounts: Record<string, number> = {};
  for (const shot of shots) {
    if (shot.beatLock) {
      edlEventCounts["cut"] = (edlEventCounts["cut"] || 0) + 1;
    }
    for (const fx of shot.effects ?? []) {
      const type = mapEDLEffectToEventType(getEffectId(fx));
      if (type) {
        edlEventCounts[type] = (edlEventCounts[type] || 0) + 1;
      }
    }
  }

  const traceEventCounts: Record<string, number> = {};
  for (const event of trace.events) {
    traceEventCounts[event.type] = (traceEventCounts[event.type] || 0) + 1;
  }

  // Compare frequency ratios instead of raw counts
  const traceTotal = trace.events.length || 1;
  const edlTotal = Object.values(edlEventCounts).reduce((a, b) => a + b, 0) || 1;
  let frequencyScore = 0;
  let matchedTypes = 0;

  for (const [type, traceCount] of Object.entries(traceEventCounts)) {
    const traceFreq = traceCount / traceTotal;
    const edlFreq = (edlEventCounts[type] || 0) / edlTotal;
    if (edlFreq > 0) {
      frequencyScore += Math.max(0, 1 - Math.abs(traceFreq - edlFreq) / Math.max(0.05, traceFreq));
      matchedTypes++;
    }
  }

  const typeCoverage = matchedTypes / Math.max(1, Object.keys(traceEventCounts).length);
  const eventSequenceSimilarity = frequencyScore > 0
    ? (frequencyScore / Math.max(1, matchedTypes)) * 0.7 + typeCoverage * 0.3
    : typeCoverage * 0.5;

  // 3. Energy Curve Similarity — REAL comparison using cosine similarity
  const edlEnergyCurve = extractEDLEnergyCurve(edl);
  const energyCurveSimilarity = calculateCurveSimilarity(
    trace.energyCurve,
    edlEnergyCurve
  );

  // 4. Effect Density Similarity — compare effects per second
  // Exclude color_grade (it's a global style, not a per-shot effect)
  const effectCount = shots.reduce((sum, shot) => sum + (shot.effects?.filter(e => e.type !== "color_grade")?.length ?? 0), 0);
  const safeDuration = Math.max(totalDuration, 1);
  const edlEffectsPerSec = effectCount / safeDuration;

  // Use vocabulary data if available (more accurate than trace events)
  let refEffectsPerSec: number;
  if (vocabulary?.avgEffectsPerShot && vocabulary.avgEffectsPerShot > 0) {
    refEffectsPerSec = vocabulary.avgEffectsPerShot / Math.max(0.5, trace.avgShotDurationSec);
  } else if (vocabulary?.totalEffects && trace.durationSec > 0) {
    refEffectsPerSec = vocabulary.totalEffects / trace.durationSec;
  } else {
    // Fallback: estimate from trace
    const traceNonCut = trace.events.filter(e => e.type !== "cut").length;
    refEffectsPerSec = trace.durationSec > 0
      ? traceNonCut / trace.durationSec
      : 0.3 / trace.avgShotDurationSec;
  }

  const densityDiff = Math.abs(edlEffectsPerSec - refEffectsPerSec);
  const effectDensitySimilarity = Math.max(0, 1 - densityDiff / Math.max(0.1, refEffectsPerSec));

  // 5. Pacing Similarity — compare shot duration distribution
  const edlShotDurations = shots.map(s => s.timing?.duration ?? 0).filter(d => d > 0);
  const pacingSimilarity = calculatePacingSimilarity(
    trace.shotDurations,
    edlShotDurations
  );

  // Overall — weighted average of all similarity metrics
  // Energy curve and pacing are most important for "feel"
  // Event sequence ensures effects match the reference's vocabulary
  const overall = (
    avgShotDurationSimilarity * 0.20 +
    eventSequenceSimilarity * 0.20 +
    energyCurveSimilarity * 0.30 +
    effectDensitySimilarity * 0.15 +
    pacingSimilarity * 0.15
  );

  if (overall < 0.65) {
    failures.push(`Overall similarity (${(overall * 100).toFixed(0)}%) is below the 65% threshold.`);
  }

  if (avgShotDurationSimilarity < 0.5) {
    failures.push(`Average shot duration (${avgShotDuration.toFixed(2)}s) diverges too much from reference (${trace.avgShotDurationSec.toFixed(2)}s).`);
  }

  if (eventSequenceSimilarity < 0.5) {
    failures.push(`Event sequence does not match reference structure closely enough.`);
  }

  if (energyCurveSimilarity < 0.5) {
    failures.push(`Energy curve shape diverges significantly from reference.`);
  }

  return {
    avgShotDurationSimilarity,
    eventSequenceSimilarity,
    energyCurveSimilarity,
    effectDensitySimilarity,
    pacingSimilarity,
    overall,
    failures,
  };
}

/**
 * Extract a 10-bucket energy curve from an EDL.
 * Uses shot timing and effect density as energy proxies.
 */
function extractEDLEnergyCurve(edl: MonetEDL): number[] {
  const shots = edl.shots ?? [];
  const totalDuration = edl.timeline?.duration ?? 0;
  if (totalDuration <= 0 || shots.length === 0) {
    return new Array(10).fill(0.5);
  }

  const bucketSize = totalDuration / 10;
  const curve: number[] = [];

  for (let bucket = 0; bucket < 10; bucket++) {
    const start = bucket * bucketSize;
    const end = start + bucketSize;

    const bucketShots = shots.filter(s => {
      const sStart = s.timing?.startTime ?? 0;
      const sEnd = sStart + (s.timing?.duration ?? 0);
      return sStart < end && sEnd > start;
    });

    if (bucketShots.length === 0) {
      curve.push(curve.length > 0 ? curve[curve.length - 1] : 0.5);
      continue;
    }

    // Energy proxy: inverse of avg shot duration (faster cuts = higher energy)
    // + effect count bonus
    const avgDur = bucketShots.reduce((s, sh) => s + (sh.timing?.duration ?? 1), 0) / bucketShots.length;
    const speedEnergy = Math.min(1, Math.max(0, 1 - avgDur / 4)); // 4s = 0 energy, 0s = 1 energy

    const effectCount = bucketShots.reduce((s, sh) => s + (sh.effects?.length ?? 0), 0);
    const effectEnergy = Math.min(1, effectCount / Math.max(1, bucketShots.length * 2));

    // Shot density energy
    const densityEnergy = Math.min(1, bucketShots.length / Math.max(1, bucketSize / 1.5));

    const combined = speedEnergy * 0.4 + effectEnergy * 0.3 + densityEnergy * 0.3;
    curve.push(Math.round(combined * 100) / 100);
  }

  return curve;
}

/**
 * Calculate cosine similarity between two energy curves.
 * Resamples to 10 points if needed.
 */
function calculateCurveSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0.5;

  const ra = resampleCurve(a, 10);
  const rb = resampleCurve(b, 10);

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 10; i++) {
    dot += ra[i] * rb[i];
    normA += ra[i] * ra[i];
    normB += rb[i] * rb[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? Math.max(0, dot / denom) : 0.5;
}

/**
 * Compare shot duration distributions using Jensen-Shannon divergence.
 * This captures whether the pacing pattern matches, not just the average.
 */
function calculatePacingSimilarity(referenceDurations: number[], edlDurations: number[]): number {
  if (referenceDurations.length === 0 || edlDurations.length === 0) {
    return 0.5;
  }

  // Compare using mean + standard deviation + distribution shape
  const refAvg = referenceDurations.reduce((a, b) => a + b, 0) / referenceDurations.length;
  const edlAvg = edlDurations.reduce((a, b) => a + b, 0) / edlDurations.length;

  const refVar = referenceDurations.reduce((s, d) => s + (d - refAvg) ** 2, 0) / referenceDurations.length;
  const edlVar = edlDurations.reduce((s, d) => s + (d - edlAvg) ** 2, 0) / edlDurations.length;
  const refStd = Math.sqrt(refVar);
  const edlStd = Math.sqrt(edlVar);

  // Mean similarity (0-1, 1 = identical)
  const avgDiff = Math.abs(refAvg - edlAvg);
  const avgSimilarity = Math.max(0, 1 - avgDiff / Math.max(0.1, refAvg));

  // Std similarity (how similar the spread is)
  const stdDiff = Math.abs(refStd - edlStd);
  const stdSimilarity = Math.max(0, 1 - stdDiff / Math.max(0.1, refStd));

  // Distribution shape: compare percentile ranks
  const refSorted = [...referenceDurations].sort((a, b) => a - b);
  const edlSorted = [...edlDurations].sort((a, b) => a - b);
  const getPercentile = (sorted: number[], p: number) => sorted[Math.min(Math.floor(p * sorted.length), sorted.length - 1)];

  const p25Diff = Math.abs(getPercentile(refSorted, 0.25) - getPercentile(edlSorted, 0.25));
  const p50Diff = Math.abs(getPercentile(refSorted, 0.50) - getPercentile(edlSorted, 0.50));
  const p75Diff = Math.abs(getPercentile(refSorted, 0.75) - getPercentile(edlSorted, 0.75));
  const percentileSimilarity = Math.max(0, 1 - (p25Diff + p50Diff + p75Diff) / (3 * Math.max(0.1, refAvg)));

  // Weighted combination
  return avgSimilarity * 0.40 + stdSimilarity * 0.25 + percentileSimilarity * 0.35;
}

function resampleCurve(curve: number[], targetLength: number): number[] {
  if (curve.length === targetLength) return curve;
  if (curve.length === 0) return new Array(targetLength).fill(0.5);

  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const t = i / (targetLength - 1);
    const srcIdx = t * (curve.length - 1);
    const low = Math.floor(srcIdx);
    const high = Math.min(low + 1, curve.length - 1);
    const frac = srcIdx - low;
    result.push(curve[low] * (1 - frac) + curve[high] * frac);
  }
  return result;
}
