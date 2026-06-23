// src/lib/style/reference-similarity.ts
import type { ReferenceStyle } from "../../server/types/reference-style";

export interface SimilarityScore {
  overall: number;
  pacing: number;
  motion: number;
  color: number;
  energy: number;
  textPresence: number;
  source: "reference" | "self";
  notes: string[];
}

const safe = (n: number | undefined | null, fallback = 0): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function scoreSimilarity(
  edl: any,
  reference: ReferenceStyle | null,
): SimilarityScore {
  if (!reference) return selfCoherenceScore(edl);

  const notes: string[] = [];

  // ─── Pacing: avg shot duration of EDL vs reference ─────────
  const totalDuration = safe(edl?.timeline?.duration, 30);
  const shotCount = Math.max(1, edl?.shots?.length ?? 1);
  const edlAvgShot = totalDuration / shotCount;
  const refAvgShot = safe(reference.rhythm?.avgShotDuration, 2);
  const pacingDelta = Math.abs(edlAvgShot - refAvgShot);
  const pacing = clamp01(1 - pacingDelta / Math.max(refAvgShot, 1));
  if (pacing < 0.5) notes.push(`pacing off by ${pacingDelta.toFixed(2)}s avg`);

  // ─── Motion: count motion-heavy features ────────────────────
  const motionKinds = new Set([
    "push_in",
    "pull_out",
    "speed_ramp",
    "context_shake",
    "whip_pan",
    "chromatic_burst",
  ]);
  let motionFeatures = 0;
  for (const shot of edl?.shots ?? []) {
    const effects = shot.effects ?? shot.features ?? [];
    for (const e of effects) {
      if (motionKinds.has(e.kind ?? e.type)) motionFeatures++;
    }
  }
  const refMotionTarget =
    safe(reference.effects?.overallIntensity, 0.5) * shotCount * 0.6;
  const motion = clamp01(
    1 - Math.abs(motionFeatures - refMotionTarget) / Math.max(refMotionTarget, 1),
  );

  // ─── Color: compare colorGrade name ─────────────────────────
  const edlGrade = edl?.globalEffects?.colorGrade ?? edl?.style?.grade ?? "raw";
  const refGrade = reference.visualStyle?.colorGrade ?? "raw";
  const color = edlGrade === refGrade ? 1.0 : 0.5;
  if (color < 1) notes.push(`color grade differs (${edlGrade} vs ${refGrade})`);

  // ─── Energy: features per minute ────────────────────────────
  const totalFeatures = (edl?.shots ?? []).reduce(
    (sum: number, s: any) =>
      sum + (s.effects?.length ?? s.features?.length ?? 0),
    0,
  );
  const featuresPerMin = totalFeatures / Math.max(1, totalDuration / 60);
  const refIntensity = safe(reference.effects?.overallIntensity, 0.5);
  const targetFPM = refIntensity * 100;
  const energy = clamp01(
    1 - Math.abs(featuresPerMin - targetFPM) / Math.max(targetFPM, 10),
  );

  // ─── Text presence ──────────────────────────────────────────
  const edlTextRatio = safe(
    (edl?.captions ?? edl?.textOverlays ?? []).reduce(
      (s: number, c: any) => s + safe(c.duration, 1),
      0,
    ) / Math.max(totalDuration, 1),
    0,
  );
  const refTextRatio = reference.textStyle?.pacing === "none" ? 0 : 0.3;
  const textPresence = clamp01(1 - Math.abs(edlTextRatio - refTextRatio));

  // ─── Weighted overall — guard against NaN ───────────────────
  const overall = clamp01(
    pacing * 0.25 +
      motion * 0.2 +
      color * 0.25 +
      energy * 0.2 +
      textPresence * 0.1,
  );

  return {
    overall: round(overall),
    pacing: round(pacing),
    motion: round(motion),
    color: round(color),
    energy: round(energy),
    textPresence: round(textPresence),
    source: "reference",
    notes,
  };
}

function selfCoherenceScore(edl: any): SimilarityScore {
  const notes: string[] = [];
  const shots = edl?.shots ?? [];
  const durations = shots.map((s: any) =>
    safe(s.timing?.duration ?? s.duration, 2),
  );
  if (durations.length === 0) {
    return {
      overall: 0,
      pacing: 0,
      motion: 0,
      color: 0.5,
      energy: 0,
      textPresence: 0.5,
      source: "self",
      notes: ["empty edl"],
    };
  }

  const mean = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
  const variance =
    durations.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) /
    durations.length;
  const cv = Math.sqrt(variance) / Math.max(mean, 0.1);
  const pacing = clamp01(1 - Math.min(1, cv / 2));
  if (cv > 1.5) notes.push("shot durations erratic");

  const motionKinds = new Set([
    "push_in",
    "pull_out",
    "speed_ramp",
    "context_shake",
  ]);
  let motionFeatures = 0;
  for (const shot of shots) {
    const effects = shot.effects ?? shot.features ?? [];
    for (const e of effects) {
      if (motionKinds.has(e.kind ?? e.type)) motionFeatures++;
    }
  }
  const motion = clamp01(motionFeatures / Math.max(1, shots.length * 0.3));

  const featuresPerShot =
    shots.reduce(
      (s: number, sh: any) =>
        s + (sh.effects?.length ?? sh.features?.length ?? 0),
      0,
    ) / Math.max(1, shots.length);
  const energy = clamp01(1 - Math.abs(featuresPerShot - 2) / 3);

  const overall = clamp01(pacing * 0.4 + motion * 0.3 + energy * 0.3);
  return {
    overall: round(overall),
    pacing: round(pacing),
    motion: round(motion),
    color: 0.5,
    energy: round(energy),
    textPresence: 0.5,
    source: "self",
    notes,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
