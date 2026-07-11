/**
 * Multi-Judge Scorer
 *
 * Three-judge scoring system: Structural, Editorial, Style.
 * Replaces the single aggregate similarity score.
 *
 * Structural Judge: Is the EDL structurally close to the reference?
 * Editorial Judge: Does the edit decision make sense?
 * Style Judge: Do effects, transitions, text, color match the reference?
 */

import type { MonetEDL, Shot } from "../types/edl";
import type { ReferenceGrammar } from "./reference-grammar";

// ─── Types ────────────────────────────────────────────────────────

export interface StructuralScore {
  shotCountTopology: number;   // 0-1: does shot count match reference range?
  durationDistribution: number; // 0-1: do shot durations match reference pattern?
  energyCurve: number;         // 0-1: does energy curve match?
  eventSequence: number;       // 0-1: do effect types/frequencies match?
  beatAlignment: number;       // 0-1: how well are cuts beat-aligned?
}

export interface EditorialScore {
  hookStrength: number;        // 0-1: is the first 3s intentionally planned?
  semanticFlow: number;        // 0-1: do section roles exist and flow logically?
  heroMomentPlacement: number; // 0-1: does the hero shot land at the right time?
  pacingFeel: number;          // 0-1: does the pacing match reference rhythm?
  boringShotPenalty: number;   // 0-1: penalty for consecutive similar shots
}

export interface StyleScore {
  effectTiming: number;        // 0-1: do effects land at reference moments?
  effectDensity: number;       // 0-1: is effect count similar to reference?
  transitionFaithfulness: number; // 0-1: cut/crossfade ratio matches?
  textFaithfulness: number;    // 0-1: text overlay timing matches?
  colorFaithfulness: number;   // 0-1: color grade matches?
}

export interface MultiJudgeScore {
  structural: StructuralScore;
  editorial: EditorialScore;
  style: StyleScore;
  overall: number;
  rejectReasons: string[];
}

// ─── Scorer ───────────────────────────────────────────────────────

export function scoreCandidate(
  edl: MonetEDL,
  grammar: ReferenceGrammar,
  referenceTrace?: any,
): MultiJudgeScore {
  const shots = edl.shots ?? [];
  const rejectReasons: string[] = [];

  // ── Structural Judge ──
  const shotCount = shots.length;
  const inRange = shotCount >= grammar.topology.minGeneratedShots && shotCount <= grammar.topology.maxGeneratedShots;
  const shotCountTopology = inRange ? 1.0 : Math.max(0, 1 - Math.abs(shotCount - (grammar.topology.minGeneratedShots + grammar.topology.maxGeneratedShots) / 2) / grammar.topology.maxGeneratedShots);

  const durations = shots.map(s => s.timing?.duration ?? 0).filter(d => d > 0);
  const refAvg = grammar.topology.durationSequence.length > 0
    ? grammar.topology.durationSequence.reduce((a, b) => a + b, 0) / grammar.topology.durationSequence.length
    : 1.5;
  const edlAvg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const durationDistribution = Math.max(0, 1 - Math.abs(refAvg - edlAvg) / Math.max(0.1, refAvg));

  const energySim = computeEnergySimilarity(edl, grammar);

  const eventSim = referenceTrace ? computeEventSimilarity(edl, referenceTrace) : 0.5;

  const beatAligned = shots.filter(s => s.beatLock).length / Math.max(shotCount, 1);
  const beatAlignment = beatAligned;

  // ── Editorial Judge ──
  const firstThreeSec = shots.filter(s => (s.timing?.startTime ?? 0) < 3);
  const hookStrength = firstThreeSec.length > 0 ? Math.min(1, firstThreeSec.length * 0.4 + (firstThreeSec.some(s => s.isHero) ? 0.3 : 0)) : 0.3;

  const sectionRoles = new Set(shots.map(s => s.sectionRole).filter(Boolean));
  const expectedRoles = new Set(grammar.sections.map(s => s.role));
  const roleOverlap = [...expectedRoles].filter(r => sectionRoles.has(r)).length / Math.max(expectedRoles.size, 1);
  const semanticFlow = roleOverlap;

  const heroShots = shots.filter(s => s.isHero);
  const heroTime = heroShots.length > 0 ? heroShots[0].timing.startTime / Math.max(edl.timeline?.duration ?? 1, 1) : -1;
  const heroMomentPlacement = heroTime >= 0 ? Math.max(0, 1 - Math.abs(heroTime - grammar.sections.find(s => s.role === "hero")?.start / grammar.duration)) : 0.3;

  const pacingFeel = computePacingFeel(durations, grammar);

  // Boring shot penalty: consecutive shots with same section role
  let boringRuns = 0;
  let currentRun = 1;
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].sectionRole === shots[i - 1].sectionRole) {
      currentRun++;
    } else {
      if (currentRun >= 3) boringRuns += currentRun - 2;
      currentRun = 1;
    }
  }
  if (currentRun >= 3) boringRuns += currentRun - 2;
  const boringShotPenalty = Math.max(0, 1 - boringRuns * 0.15);

  // ── Style Judge ──
  const effectTiming = computeEffectTiming(edl, grammar);
  const effectDensitySim = computeEffectDensity(edl, grammar);
  const transitionFaith = computeTransitionFaith(edl, grammar);
  const textFaith = computeTextFaith(edl, grammar);
  const colorFaith = edl.globalEffects?.colorGrade === grammar.visual.colorGrade ? 1.0 : 0.5;

  // ── Overall ──
  const structural = (shotCountTopology * 0.30 + durationDistribution * 0.25 + energySim * 0.25 + eventSim * 0.10 + beatAlignment * 0.10);
  const editorial = (hookStrength * 0.25 + semanticFlow * 0.20 + heroMomentPlacement * 0.20 + pacingFeel * 0.20 + boringShotPenalty * 0.15);
  const style = (effectTiming * 0.30 + effectDensitySim * 0.20 + transitionFaith * 0.20 + textFaith * 0.15 + colorFaith * 0.15);

  const overall = structural * 0.40 + editorial * 0.35 + style * 0.25;

  // ── Rejection gates ──
  if (shotCountTopology < 0.5) rejectReasons.push(`Shot count ${shotCount} outside reference range [${grammar.topology.minGeneratedShots}-${grammar.topology.maxGeneratedShots}]`);
  if (hookStrength < 0.5) rejectReasons.push("Hook (first 3s) is weak");
  if (pacingFeel < 0.5) rejectReasons.push("Pacing doesn't match reference rhythm");
  if (boringRuns >= 3) rejectReasons.push(`${boringRuns} consecutive boring shots`);

  return {
    structural: { shotCountTopology, durationDistribution, energyCurve: energySim, eventSequence: eventSim, beatAlignment },
    editorial: { hookStrength, semanticFlow, heroMomentPlacement, pacingFeel, boringShotPenalty },
    style: { effectTiming, effectDensity: effectDensitySim, transitionFaithfulness: transitionFaith, textFaithfulness: textFaith, colorFaithfulness: colorFaith },
    overall,
    rejectReasons,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function computeEnergySimilarity(edl: MonetEDL, grammar: ReferenceGrammar): number {
  const shots = edl.shots ?? [];
  const duration = edl.timeline?.duration ?? 1;
  if (shots.length === 0 || grammar.visual.motionCurve.length === 0) return 0.5;

  // Build EDL energy curve (10 buckets)
  const edlCurve: number[] = [];
  const bucketSize = duration / 10;
  for (let b = 0; b < 10; b++) {
    const start = b * bucketSize;
    const end = start + bucketSize;
    const bucketShots = shots.filter(s => {
      const sStart = s.timing?.startTime ?? 0;
      const sEnd = sStart + (s.timing?.duration ?? 0);
      return sStart < end && sEnd > start;
    });
    if (bucketShots.length === 0) { edlCurve.push(0.5); continue; }
    const avgDur = bucketShots.reduce((s, sh) => s + (sh.timing?.duration ?? 1), 0) / bucketShots.length;
    const speedEnergy = Math.min(1, Math.max(0, 1 - avgDur / 4));
    const effectEnergy = bucketShots.reduce((s, sh) => s + (sh.effects?.length ?? 0), 0) / Math.max(1, bucketShots.length * 2);
    edlCurve.push(speedEnergy * 0.6 + effectEnergy * 0.4);
  }

  // Cosine similarity
  const refCurve = grammar.visual.motionCurve.slice(0, 10);
  while (refCurve.length < 10) refCurve.push(0.5);

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 10; i++) {
    dot += (edlCurve[i] ?? 0.5) * (refCurve[i] ?? 0.5);
    normA += (edlCurve[i] ?? 0.5) ** 2;
    normB += (refCurve[i] ?? 0.5) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? Math.max(0, dot / denom) : 0.5;
}

function computeEventSimilarity(edl: MonetEDL, trace: any): number {
  const shots = edl.shots ?? [];
  const edlTypes: Record<string, number> = {};
  for (const shot of shots) {
    for (const fx of shot.effects ?? []) {
      const t = typeof fx.type === "string" ? fx.type : "unknown";
      if (t !== "color_grade") edlTypes[t] = (edlTypes[t] || 0) + 1;
    }
  }

  const traceTypes: Record<string, number> = {};
  for (const event of trace.events ?? []) {
    traceTypes[event.type] = (traceTypes[event.type] || 0) + 1;
  }

  const edlTotal = Object.values(edlTypes).reduce((a, b) => a + b, 0) || 1;
  const traceTotal = Object.values(traceTypes).reduce((a, b) => a + b, 0) || 1;

  let score = 0;
  let matched = 0;
  for (const [type, count] of Object.entries(traceTypes)) {
    const traceFreq = count / traceTotal;
    const edlFreq = (edlTypes[type] || 0) / edlTotal;
    if (edlFreq > 0) {
      score += Math.max(0, 1 - Math.abs(traceFreq - edlFreq) / Math.max(0.05, traceFreq));
      matched++;
    }
  }

  return matched > 0 ? score / matched : 0.3;
}

function computePacingFeel(durations: number[], grammar: ReferenceGrammar): number {
  if (durations.length === 0 || grammar.topology.durationSequence.length === 0) return 0.5;

  const edlAvg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const refAvg = grammar.topology.durationSequence.reduce((a, b) => a + b, 0) / grammar.topology.durationSequence.length;

  const edlStd = Math.sqrt(durations.reduce((s, d) => s + (d - edlAvg) ** 2, 0) / durations.length);
  const refStd = Math.sqrt(grammar.topology.durationSequence.reduce((s, d) => s + (d - refAvg) ** 2, 0) / grammar.topology.durationSequence.length);

  const avgSim = Math.max(0, 1 - Math.abs(edlAvg - refAvg) / Math.max(0.1, refAvg));
  const stdSim = Math.max(0, 1 - Math.abs(edlStd - refStd) / Math.max(0.1, refStd));

  return avgSim * 0.6 + stdSim * 0.4;
}

function computeEffectTiming(edl: MonetEDL, grammar: ReferenceGrammar): number {
  if (grammar.effects.length === 0) return 0.8; // No effects to match = OK

  const shots = edl.shots ?? [];
  const edlEffectTimes = shots.flatMap(s => (s.effects ?? []).map(e => s.timing?.startTime ?? 0));
  const grammarEffectTimes = grammar.effects.map(e => e.start);

  if (grammarEffectTimes.length === 0 || edlEffectTimes.length === 0) return 0.5;

  // How many grammar effects have a nearby EDL effect?
  let matched = 0;
  for (const gt of grammarEffectTimes) {
    const nearest = edlEffectTimes.reduce((best, et) => Math.abs(et - gt) < Math.abs(best - gt) ? et : best, edlEffectTimes[0]);
    if (Math.abs(nearest - gt) < 2.0) matched++;
  }

  return matched / Math.max(grammarEffectTimes.length, 1);
}

function computeEffectDensity(edl: MonetEDL, grammar: ReferenceGrammar): number {
  const shots = edl.shots ?? [];
  const edlCount = shots.reduce((s, sh) => s + (sh.effects?.filter(e => e.type !== "color_grade")?.length ?? 0), 0);
  const grammarCount = grammar.effects.length;
  const duration = edl.timeline?.duration ?? 1;

  const edlDensity = edlCount / duration;
  const grammarDensity = grammarCount / Math.max(grammar.duration, 1);

  return Math.max(0, 1 - Math.abs(edlDensity - grammarDensity) / Math.max(0.1, grammarDensity));
}

function computeTransitionFaith(edl: MonetEDL, grammar: ReferenceGrammar): number {
  const shots = edl.shots ?? [];
  const edlCuts = shots.filter(s => s.transition?.type === "cut" || !s.transition).length;
  const edlCrossfades = shots.filter(s => s.transition?.type === "crossfade").length;
  const total = Math.max(edlCuts + edlCrossfades, 1);

  const edlCutRatio = edlCuts / total;
  const diff = Math.abs(edlCutRatio - grammar.transitions.cutRatio);

  return Math.max(0, 1 - diff / 0.3);
}

function computeTextFaith(edl: MonetEDL, grammar: ReferenceGrammar): number {
  const edlText = edl.textOverlays?.length ?? 0;
  const grammarText = grammar.text.moments.length;

  if (grammarText === 0 && edlText === 0) return 1.0;
  if (grammarText === 0 || edlText === 0) return 0.3;

  return Math.max(0, 1 - Math.abs(edlText - grammarText) / Math.max(grammarText, 1));
}
