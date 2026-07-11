/**
 * Candidate EDL Generator
 *
 * Generates multiple competing EDLs with different strategies.
 * Instead of retrying the same approach, explores different editorial interpretations.
 */

import type { MonetEDL, Shot } from "../types/edl";
import type { ReferenceGrammar, GrammarSection } from "./reference-grammar";
import { replicateStyle, type ReplicateStyleInput } from "./style-replicator";
import { scoreCandidate, type MultiJudgeScore } from "./multi-judge";

// ─── Types ────────────────────────────────────────────────────────

export type CandidateStrategy =
  | "strict_topology"      // Match shot count/duration exactly
  | "beat_first"           // Prioritize beat alignment
  | "semantic_first"       // Prioritize section roles
  | "effect_heavy"         // More effects than reference
  | "safe_watchable"       // Conservative, minimal effects
  | "high_variance"        // More dynamic pacing

export interface CandidateEDL {
  id: string;
  edl: MonetEDL;
  strategy: CandidateStrategy;
  strategyNotes: string[];
  scores?: MultiJudgeScore;
}

// ─── Generator ────────────────────────────────────────────────────

export function generateCandidates(
  baseInput: ReplicateStyleInput,
  grammar: ReferenceGrammar,
  count: number = 6,
): CandidateEDL[] {
  const strategies: CandidateStrategy[] = [
    "strict_topology",
    "beat_first",
    "semantic_first",
    "effect_heavy",
    "safe_watchable",
    "high_variance",
  ];

  const candidates: CandidateEDL[] = [];

  for (let i = 0; i < Math.min(count, strategies.length); i++) {
    const strategy = strategies[i];
    const modifiedInput = applyStrategy(baseInput, grammar, strategy);

    try {
      const edl = replicateStyle(modifiedInput);
      candidates.push({
        id: `candidate_${strategy}_${i}`,
        edl,
        strategy,
        strategyNotes: getStrategyNotes(strategy, grammar),
      });
    } catch (e) {
      // Skip failed candidates
      console.warn(`[candidates] Strategy ${strategy} failed: ${(e as Error).message}`);
    }
  }

  return candidates;
}

// ─── Strategy Modifiers ───────────────────────────────────────────

function applyStrategy(
  base: ReplicateStyleInput,
  grammar: ReferenceGrammar,
  strategy: CandidateStrategy,
): ReplicateStyleInput {
  const modified = { ...base, referenceStyle: { ...base.referenceStyle } } as ReplicateStyleInput;

  switch (strategy) {
    case "strict_topology":
      // Force avgShotDuration to match reference exactly
      (modified.referenceStyle as any).rhythm = {
        ...modified.referenceStyle.rhythm,
        avgShotDuration: grammar.topology.durationSequence.length > 0
          ? grammar.topology.durationSequence.reduce((a, b) => a + b, 0) / grammar.topology.durationSequence.length
          : modified.referenceStyle.rhythm.avgShotDuration,
        shotDurationVariance: grammar.topology.variance,
      };
      break;

    case "beat_first":
      // Increase cut alignment strictness
      (modified.referenceStyle as any).rhythm = {
        ...modified.referenceStyle.rhythm,
        cutAlignment: "strict",
      };
      (modified.referenceStyle as any).audioVisualSync = {
        ...((modified.referenceStyle as any).audioVisualSync ?? {}),
        cutOnBeatRatio: 0.9,
      };
      break;

    case "semantic_first":
      // Ensure all section roles exist
      (modified.referenceStyle as any).pacing = {
        ...modified.referenceStyle.pacing,
        climaxPosition: grammar.sections.find(s => s.role === "hero")?.start / grammar.duration ?? 0.6,
      };
      break;

    case "effect_heavy":
      // Boost effect frequency
      (modified.referenceStyle as any).effects = {
        ...modified.referenceStyle.effects,
        effectsFrequency: Math.min(1, (modified.referenceStyle.effects?.effectsFrequency ?? 0.3) * 1.5),
        overallIntensity: Math.min(1, (modified.referenceStyle.effects?.overallIntensity ?? 0.3) * 1.3),
      };
      break;

    case "safe_watchable":
      // Reduce effects, keep transitions clean
      (modified.referenceStyle as any).effects = {
        ...modified.referenceStyle.effects,
        effectsFrequency: Math.max(0.1, (modified.referenceStyle.effects?.effectsFrequency ?? 0.3) * 0.5),
        overallIntensity: Math.max(0.1, (modified.referenceStyle.effects?.overallIntensity ?? 0.3) * 0.6),
      };
      break;

    case "high_variance":
      // Increase shot duration variance for more dynamic pacing
      (modified.referenceStyle as any).rhythm = {
        ...modified.referenceStyle.rhythm,
        shotDurationVariance: Math.min(0.8, (modified.referenceStyle.rhythm?.shotDurationVariance ?? 0.3) * 1.5),
      };
      break;
  }

  return modified;
}

function getStrategyNotes(strategy: CandidateStrategy, grammar: ReferenceGrammar): string[] {
  switch (strategy) {
    case "strict_topology":
      return [`Forced avgShotDuration to ${grammar.topology.durationSequence.length > 0 ? (grammar.topology.durationSequence.reduce((a, b) => a + b, 0) / grammar.topology.durationSequence.length).toFixed(2) : "N/A"}s`, `Shot count range: [${grammar.topology.minGeneratedShots}-${grammar.topology.maxGeneratedShots}]`];
    case "beat_first":
      return ["Strict beat alignment", "All cuts snap to beat grid"];
    case "semantic_first":
      return ["All section roles enforced", "Hero moment at reference position"];
    case "effect_heavy":
      return [`Effect frequency boosted to ${Math.min(100, Math.round((1.5)) * 100)}%`, "Higher intensity effects"];
    case "safe_watchable":
      return ["Minimal effects", "Clean transitions only"];
    case "high_variance":
      return ["Higher shot duration variance", "More dynamic pacing"];
  }
}

// ─── Ranker ───────────────────────────────────────────────────────

export function rankCandidates(
  candidates: CandidateEDL[],
  grammar: ReferenceGrammar,
  referenceTrace?: any,
): CandidateEDL[] {
  for (const candidate of candidates) {
    candidate.scores = scoreCandidate(candidate.edl, grammar, referenceTrace);
  }

  // Sort by overall score descending
  return candidates.sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0));
}
