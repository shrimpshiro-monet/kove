/**
 * Reference Style Verification
 *
 * Compares Gemini's extracted ReferenceStyle against ground-truth
 * data from FFmpeg analysis. This catches LLM hallucinations in
 * style parameters and provides confidence scores.
 *
 * Without this, the system trusts LLM guesses about video structure.
 * With it, we can correct or reject inaccurate extractions.
 */

import type { ReferenceStyle } from "../types/reference-style";
import type { SceneDetectionResult } from "./scene-detection";
import type { EnergyAnalysisResult } from "./energy-analysis";

export interface VerificationReport {
  verified: boolean;
  confidence: number;
  corrections: StyleCorrection[];
  metrics: {
    avgShotDuration: { claimed: number; actual: number; delta: number; pass: boolean };
    shotCount: { claimed: number; actual: number; delta: number; pass: boolean };
    climaxPosition: { claimed: number; actual: number; delta: number; pass: boolean };
    energyCurve: { similarity: number; pass: boolean };
    cutFrequency: { claimed: number; actual: number; delta: number; pass: boolean };
  };
}

export interface StyleCorrection {
  field: string;
  claimed: number | string;
  actual: number | string;
  confidence: number;
}

/**
 * Verify a Gemini-extracted ReferenceStyle against ground truth.
 *
 * Returns a report with corrections for any fields that deviate
 * significantly from the actual video analysis.
 */
export function verifyReferenceStyle(
  style: ReferenceStyle,
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult
): VerificationReport {
  const corrections: StyleCorrection[] = [];
  const totalDuration = energy.totalDuration || scenes.totalDuration;

  // ─── 1. Average Shot Duration ─────────────────────────────────
  const claimedAvgShot = style.rhythm?.avgShotDuration ?? 1.0;
  const actualAvgShot = scenes.avgShotDuration;
  const avgShotDelta = Math.abs(claimedAvgShot - actualAvgShot);
  const avgShotPass = avgShotDelta < 0.5 || avgShotDelta / Math.max(0.1, claimedAvgShot) < 0.25;

  if (!avgShotPass) {
    corrections.push({
      field: "rhythm.avgShotDuration",
      claimed: claimedAvgShot,
      actual: actualAvgShot,
      confidence: 0.9,
    });
  }

  // ─── 2. Shot Count ────────────────────────────────────────────
  const claimedShotCount = totalDuration > 0
    ? Math.round(totalDuration / claimedAvgShot)
    : 0;
  const actualShotCount = scenes.shotCount;
  const shotCountDelta = Math.abs(claimedShotCount - actualShotCount);
  const shotCountPass = shotCountDelta <= Math.max(3, actualShotCount * 0.2);

  if (!shotCountPass) {
    corrections.push({
      field: "rhythm.shotCount (derived)",
      claimed: claimedShotCount,
      actual: actualShotCount,
      confidence: 0.85,
    });
  }

  // ─── 3. Climax Position ───────────────────────────────────────
  const claimedClimax = style.pacing?.climaxPosition ?? 0.5;
  const actualClimax = energy.climaxPosition;
  const climaxDelta = Math.abs(claimedClimax - actualClimax);
  const climaxPass = climaxDelta < 0.15;

  if (!climaxPass) {
    corrections.push({
      field: "pacing.climaxPosition",
      claimed: claimedClimax,
      actual: actualClimax,
      confidence: 0.8,
    });
  }

  // ─── 4. Energy Curve Similarity ───────────────────────────────
  const claimedCurve = style.pacing?.energyCurve ?? [];
  const actualCurve = energy.energyCurve;
  const energySimilarity = calculateCurveSimilarity(claimedCurve, actualCurve);
  const energyPass = energySimilarity > 0.6;

  if (!energyPass) {
    corrections.push({
      field: "pacing.energyCurve",
      claimed: `[${claimedCurve.slice(0, 5).map(v => v.toFixed(2)).join(", ")}, ...]`,
      actual: `[${actualCurve.slice(0, 5).map(v => v.toFixed(2)).join(", ")}, ...]`,
      confidence: 0.7,
    });
  }

  // ─── 5. Cut Frequency ─────────────────────────────────────────
  const claimedPacing = style.intentMapping?.pacing ?? "medium";
  const claimedCutFreq = pacingToCutFrequency(claimedPacing);
  const actualCutFreq = scenes.cutFrequency;
  const cutFreqDelta = Math.abs(claimedCutFreq - actualCutFreq);
  const cutFreqPass = cutFreqDelta < 1.0;

  if (!cutFreqPass) {
    corrections.push({
      field: "intentMapping.pacing (derived cutFrequency)",
      claimed: `${claimedPacing} (~${claimedCutFreq.toFixed(1)} cuts/s)`,
      actual: `${actualCutFreq.toFixed(1)} cuts/s`,
      confidence: 0.85,
    });
  }

  // ─── Overall Score ────────────────────────────────────────────
  const passCount = [avgShotPass, shotCountPass, climaxPass, energyPass, cutFreqPass]
    .filter(Boolean).length;
  const confidence = passCount / 5;
  const verified = passCount >= 3; // At least 3/5 metrics must match

  return {
    verified,
    confidence,
    corrections,
    metrics: {
      avgShotDuration: {
        claimed: claimedAvgShot,
        actual: actualAvgShot,
        delta: avgShotDelta,
        pass: avgShotPass,
      },
      shotCount: {
        claimed: claimedShotCount,
        actual: actualShotCount,
        delta: shotCountDelta,
        pass: shotCountPass,
      },
      climaxPosition: {
        claimed: claimedClimax,
        actual: actualClimax,
        delta: climaxDelta,
        pass: climaxPass,
      },
      energyCurve: {
        similarity: energySimilarity,
        pass: energyPass,
      },
      cutFrequency: {
        claimed: claimedCutFreq,
        actual: actualCutFreq,
        delta: cutFreqDelta,
        pass: cutFreqPass,
      },
    },
  };
}

/**
 * Apply corrections to a ReferenceStyle based on verification report.
 * Returns a new style with ground-truth values where the LLM was wrong.
 */
export function applyCorrections(
  style: ReferenceStyle,
  report: VerificationReport,
  strictMode = false
): ReferenceStyle {
  if (report.verified && !strictMode) {
    return style; // Style is accurate enough
  }

  const corrected = JSON.parse(JSON.stringify(style)) as ReferenceStyle;

  for (const correction of report.corrections) {
    if (correction.confidence < 0.7) continue; // Low confidence — don't override

    const field = correction.field;
    const value = correction.actual;

    if (field === "rhythm.avgShotDuration" && typeof value === "number") {
      corrected.rhythm.avgShotDuration = value;
    }
    if (field === "pacing.climaxPosition" && typeof value === "number") {
      corrected.pacing.climaxPosition = value;
    }
    if (field === "pacing.energyCurve" && typeof value === "string") {
      // Parse the actual curve from the string representation
      corrected.pacing.energyCurve = report.metrics.energyCurve.similarity < 0.4
        ? [] // Completely wrong — let it be recalculated
        : corrected.pacing.energyCurve; // Keep original if partially correct
    }
  }

  return corrected;
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Calculate cosine similarity between two energy curves.
 * Handles different lengths by interpolating the shorter one.
 */
function calculateCurveSimilarity(claimed: number[], actual: number[]): number {
  if (claimed.length === 0 || actual.length === 0) return 0.5;

  // Resample both to 10 points
  const a = resampleCurve(claimed, 10);
  const b = resampleCurve(actual, 10);

  // Cosine similarity
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < 10; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return Math.max(0, dotProduct / denominator);
}

/**
 * Resample a curve to a target number of points using linear interpolation.
 */
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

function pacingToCutFrequency(pacing: string): number {
  switch (pacing.toLowerCase()) {
    case "aggressive": return 2.0;
    case "fast": return 1.2;
    case "medium": return 0.7;
    case "slow": return 0.3;
    default: return 0.7;
  }
}
