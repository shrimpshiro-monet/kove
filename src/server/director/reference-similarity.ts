import type { MonetEDL } from "../types/edl";
import type { ReferenceEditTrace, ReferenceEditEventType } from "./reference-edit-trace";

export type ReferenceSimilarityReport = {
  avgShotDurationSimilarity: number;
  eventSequenceSimilarity: number;
  energyCurveSimilarity: number;
  effectDensitySimilarity: number;
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
  return null;
}

export function compareReferenceTraceToEDL(
  trace: ReferenceEditTrace,
  edl: MonetEDL
): ReferenceSimilarityReport {
  const shots = edl.shots ?? [];
  const failures: string[] = [];

  // 1. Average Shot Duration Similarity
  const totalDuration = shots.reduce((sum, shot) => sum + (shot.timing?.duration ?? 0), 0);
  const avgShotDuration = shots.length > 0 ? totalDuration / shots.length : 0;
  
  const avgShotDiff = Math.abs(avgShotDuration - trace.avgShotDurationSec);
  // Max difference allowed is 2 seconds, mapped to 0-1 scale.
  const avgShotDurationSimilarity = Math.max(0, 1 - avgShotDiff / Math.max(1, trace.avgShotDurationSec));

  // 2. Event Sequence Similarity (Rough approximation)
  // Check if the overall frequency of events matches the trace roughly.
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

  let matchedEvents = 0;
  let totalTraceEvents = 0;
  for (const [type, count] of Object.entries(traceEventCounts)) {
    totalTraceEvents += count;
    const edlCount = edlEventCounts[type] || 0;
    matchedEvents += Math.min(count, edlCount);
  }

  const eventSequenceSimilarity = totalTraceEvents > 0 ? matchedEvents / totalTraceEvents : 1.0;

  // 3. Energy Curve Similarity (Mocked as 1.0 for now, would require mapping shot motion to curve)
  const energyCurveSimilarity = 0.8; 

  // 4. Effect Density Similarity
  const effectCount = shots.reduce((sum, shot) => sum + (shot.effects?.length ?? 0), 0);
  const safeDuration = Math.max(totalDuration, 1);
  const effectDensity = (effectCount / safeDuration) * 10;
  
  const densityDiff = Math.abs(effectDensity - trace.effectDensityPer10Sec);
  const effectDensitySimilarity = Math.max(0, 1 - densityDiff / Math.max(5, trace.effectDensityPer10Sec));

  // Overall
  const overall = (
    avgShotDurationSimilarity * 0.3 +
    eventSequenceSimilarity * 0.4 +
    energyCurveSimilarity * 0.1 +
    effectDensitySimilarity * 0.2
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

  return {
    avgShotDurationSimilarity,
    eventSequenceSimilarity,
    energyCurveSimilarity,
    effectDensitySimilarity,
    overall,
    failures,
  };
}