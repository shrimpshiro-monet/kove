/**
 * EDL Regeneration Loop
 *
 * When the generated EDL doesn't match the reference style closely enough,
 * this system regenerates with progressively tighter constraints until
 * the similarity threshold is met or max attempts are exhausted.
 *
 * This is what makes the edit actually match the reference, not just
 * "get close enough on the first try."
 */

import type { MonetEDL } from "../types/edl";
import type { ReferenceEditTrace } from "../director/reference-edit-trace";
import type { ReferenceSimilarityReport } from "../director/reference-similarity";
import type { EditMoment, MomentMap } from "./moment-mapping";
import type { EffectVocabulary } from "./effect-vocabulary";

export interface RegenerationConfig {
  maxAttempts: number;
  similarityThreshold: number;
  strictnessRamp: number; // How much to tighten constraints each attempt
}

export interface RegenerationAttempt {
  attempt: number;
  edl: MonetEDL;
  similarity: ReferenceSimilarityReport;
  constraints: RegenerationConstraints;
  timestamp: number;
}

export interface RegenerationConstraints {
  /** Tighter shot duration range */
  shotDurationRange: { min: number; max: number };
  /** Required beat lock percentage */
  minBeatLockPercent: number;
  /** Required effect density per 10 seconds */
  minEffectDensity: number;
  /** Maximum allowed deviation from reference energy curve */
  maxEnergyDeviation: number;
  /** Required moments that must appear in the EDL */
  requiredMoments: string[];
  /** Effect vocabulary constraints */
  effectConstraints: {
    requiredTypes: string[];
    minCount: number;
  };
  /** Transition type constraints */
  transitionConstraints: {
    maxCrossfadePercent: number;
    requireWhipAtDrops: boolean;
  };
  /** Prompt suffix to append for regeneration */
  promptSuffix: string;
}

export interface RegenerationResult {
  finalEdl: MonetEDL;
  attempts: RegenerationAttempt[];
  passed: boolean;
  finalSimilarity: ReferenceSimilarityReport;
}

const DEFAULT_CONFIG: RegenerationConfig = {
  maxAttempts: 3,
  similarityThreshold: 0.65,
  strictnessRamp: 0.15,
};

/**
 * Run the regeneration loop.
 *
 * Takes an initial EDL and keeps regenerating until it matches
 * the reference or max attempts are reached.
 *
 * @param initialEdl - The first generated EDL
 * @param similarity - Similarity report for the initial EDL
 * @param trace - Reference edit trace to match against
 * @param momentMap - Moment-level mapping of the reference
 * @param vocabulary - Effect vocabulary of the reference
 * @param generateFn - Function to call for regeneration (takes constraints, returns new EDL)
 * @param config - Regeneration configuration
 */
export async function runRegenerationLoop(
  initialEdl: MonetEDL,
  similarity: ReferenceSimilarityReport,
  trace: ReferenceEditTrace,
  momentMap: MomentMap,
  vocabulary: EffectVocabulary,
  generateFn: (constraints: RegenerationConstraints) => Promise<MonetEDL>,
  scoreFn: (edl: MonetEDL) => ReferenceSimilarityReport,
  config: RegenerationConfig = DEFAULT_CONFIG
): Promise<RegenerationResult> {
  const attempts: RegenerationAttempt[] = [];
  let currentEdl = initialEdl;
  let currentSimilarity = similarity;

  // Attempt 0: initial generation
  attempts.push({
    attempt: 0,
    edl: initialEdl,
    similarity,
    constraints: buildInitialConstraints(trace, momentMap, vocabulary),
    timestamp: Date.now(),
  });

  if (similarity.overall >= config.similarityThreshold) {
    return {
      finalEdl: initialEdl,
      attempts,
      passed: true,
      finalSimilarity: similarity,
    };
  }

  // Regeneration attempts
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    console.info(`[regeneration] Attempt ${attempt}/${config.maxAttempts} — current similarity: ${(currentSimilarity.overall * 100).toFixed(0)}%`);

    // Build tighter constraints
    const constraints = buildTightenedConstraints(
      trace,
      momentMap,
      vocabulary,
      currentSimilarity,
      attempt,
      config.strictnessRamp
    );

    try {
      // Generate new EDL with tighter constraints
      const newEdl = await generateFn(constraints);

      // Score the new EDL
      const newSimilarity = scoreFn(newEdl);

      attempts.push({
        attempt,
        edl: newEdl,
        similarity: newSimilarity,
        constraints,
        timestamp: Date.now(),
      });

      // Check if we've passed
      if (newSimilarity.overall >= config.similarityThreshold) {
        console.info(`[regeneration] Passed on attempt ${attempt} with ${(newSimilarity.overall * 100).toFixed(0)}% similarity`);
        return {
          finalEdl: newEdl,
          attempts,
          passed: true,
          finalSimilarity: newSimilarity,
        };
      }

      // Update current state for next iteration
      if (newSimilarity.overall > currentSimilarity.overall) {
        currentEdl = newEdl;
        currentSimilarity = newSimilarity;
      }
    } catch (err) {
      console.error(`[regeneration] Attempt ${attempt} failed:`, err);
    }
  }

  // Return best result
  console.info(`[regeneration] Max attempts reached. Best similarity: ${(currentSimilarity.overall * 100).toFixed(0)}%`);
  return {
    finalEdl: currentEdl,
    attempts,
    passed: false,
    finalSimilarity: currentSimilarity,
  };
}

// ─── Constraint Building ──────────────────────────────────────────

function buildInitialConstraints(
  trace: ReferenceEditTrace,
  momentMap: MomentMap,
  vocabulary: EffectVocabulary
): RegenerationConstraints {
  const avgShot = trace.avgShotDurationSec;
  const effectDensity = vocabulary.avgEffectsPerShot * 10;

  return {
    shotDurationRange: {
      min: avgShot * 0.5,
      max: avgShot * 2.0,
    },
    minBeatLockPercent: 50,
    minEffectDensity: effectDensity * 0.5,
    maxEnergyDeviation: 0.3,
    requiredMoments: momentMap.moments
      .filter(m => m.priority === "must_hit")
      .map(m => m.id),
    effectConstraints: {
      requiredTypes: Object.entries(vocabulary.effectFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([type]) => type),
      minCount: Math.max(1, Math.floor(vocabulary.totalEffects * 0.3)),
    },
    transitionConstraints: {
      maxCrossfadePercent: 30,
      requireWhipAtDrops: false,
    },
    promptSuffix: "",
  };
}

function buildTightenedConstraints(
  trace: ReferenceEditTrace,
  momentMap: MomentMap,
  vocabulary: EffectVocabulary,
  currentSimilarity: ReferenceSimilarityReport,
  attempt: number,
  strictnessRamp: number
): RegenerationConstraints {
  const base = buildInitialConstraints(trace, momentMap, vocabulary);
  const ramp = strictnessRamp * attempt;

  // Tighten shot duration range
  const avgShot = trace.avgShotDurationSec;
  const rangeReduction = ramp * 0.5;
  base.shotDurationRange = {
    min: avgShot * (0.5 + rangeReduction),
    max: avgShot * (2.0 - rangeReduction),
  };

  // Increase beat lock requirement
  base.minBeatLockPercent = Math.min(95, 50 + attempt * 15);

  // Increase effect density
  base.minEffectDensity = vocabulary.avgEffectsPerShot * 10 * (1 + ramp);

  // Reduce allowed energy deviation
  base.maxEnergyDeviation = Math.max(0.1, 0.3 - ramp * 0.1);

  // Add specific prompts based on what's failing
  const prompts: string[] = [];

  if (currentSimilarity.avgShotDurationSimilarity < 0.6) {
    const targetAvg = trace.avgShotDurationSec.toFixed(2);
    prompts.push(`CRITICAL: Average shot duration MUST be ${targetAvg}s. Currently deviating. Every shot must be within ±20% of this duration.`);
  }

  if (currentSimilarity.energyCurveSimilarity < 0.6) {
    prompts.push(`CRITICAL: Match the reference energy curve exactly. High energy at ${momentMap.climaxPosition.toFixed(0)}% of timeline. Breathing moments at: ${momentMap.breathingPositions.map(t => `${(t * 100).toFixed(0)}%`).join(", ")}.`);
  }

  if (currentSimilarity.effectDensitySimilarity < 0.6) {
    const requiredEffects = base.effectConstraints.requiredTypes.join(", ");
    prompts.push(`CRITICAL: Use these specific effects at the specified density: ${requiredEffects}. Effect density must match reference.`);
  }

  if (currentSimilarity.eventSequenceSimilarity < 0.6) {
    prompts.push(`CRITICAL: Match the event sequence pattern. Use whip transitions at energy peaks, speed ramps into climax, push-ins on every other shot.`);
  }

  // Add moment-specific instructions
  const mustHitMoments = momentMap.moments.filter(m => m.priority === "must_hit");
  if (mustHitMoments.length > 0) {
    prompts.push(`REQUIRED MOMENTS (you MUST include these):`);
    for (const m of mustHitMoments) {
      prompts.push(`  - ${m.id} at ${(m.normalizedTime * 100).toFixed(0)}%: ${m.description} (duration: ${m.shotDuration.toFixed(2)}s)`);
    }
  }

  base.promptSuffix = prompts.length > 0
    ? `\n\n## REGENERATION CONSTRAINTS (attempt ${attempt})\n${prompts.join("\n")}`
    : "";

  return base;
}
