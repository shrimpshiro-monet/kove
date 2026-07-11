/**
 * Moment-Level Mapping
 *
 * Maps specific editing decisions from a reference video to concrete
 * timeline positions. This is what makes the edit feel like the reference —
 * not just matching averages, but matching the specific rhythm and structure.
 *
 * Output: A list of "moments" that the EDL generator must replicate,
 * each with exact timing, effects, and visual role.
 */

import type { ReferenceStyle } from "../types/reference-style";
import type { SceneDetectionResult } from "./scene-detection";
import type { EnergyAnalysisResult } from "./energy-analysis";
import type { EffectVocabulary, EffectInstance } from "./effect-vocabulary";

export interface EditMoment {
  id: string;
  timeSec: number;
  normalizedTime: number;
  type: MomentType;
  priority: "must_hit" | "should_hit" | "nice_to_have";
  shotDuration: number;
  effects: EffectInstance[];
  visualRole: string;
  description: string;
  constraints: {
    maxDuration: number;
    minDuration: number;
    requireBeatLock: boolean;
    requireEffect: boolean;
    allowedTransitions: string[];
  };
}

export type MomentType =
  | "opening"
  | "build_up"
  | "climax"
  | "breathing"
  | "rhythm_steady"
  | "rhythm_accelerate"
  | "rhythm_decelerate"
  | "impact"
  | "reaction"
  | "closing";

export interface MomentMap {
  moments: EditMoment[];
  totalShots: number;
  avgShotDuration: number;
  rhythmPattern: string;
  climaxPosition: number;
  breathingPositions: number[];
  effectHotspots: Array<{ time: number; effects: string[] }>;
}

/**
 * Build a complete moment map from reference analysis data.
 *
 * This creates the "edit blueprint" — specific moments that the
 * EDL generator must hit to match the reference style.
 */
export function buildMomentMap(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  vocabulary: EffectVocabulary,
  style: ReferenceStyle | null,
  targetDuration: number
): MomentMap {
  const refDuration = energy.totalDuration || scenes.totalDuration;
  if (refDuration <= 0 || targetDuration <= 0) {
    return emptyMomentMap(targetDuration);
  }

  const moments: EditMoment[] = [];

  // ─── 1. Map structural moments ────────────────────────────────
  const structuralMoments = mapStructuralMoments(
    scenes, energy, vocabulary, refDuration, targetDuration
  );
  moments.push(...structuralMoments);

  // ─── 2. Map rhythm moments ────────────────────────────────────
  const rhythmMoments = mapRhythmMoments(
    scenes, energy, refDuration, targetDuration
  );
  moments.push(...rhythmMoments);

  // ─── 3. Map effect hotspots ───────────────────────────────────
  const effectMoments = mapEffectHotspots(
    vocabulary, refDuration, targetDuration
  );
  moments.push(...effectMoments);

  // ─── 4. Map climax and breathing ──────────────────────────────
  const pacingMoments = mapPacingMoments(
    energy, refDuration, targetDuration
  );
  moments.push(...pacingMoments);

  // Sort by time and deduplicate
  moments.sort((a, b) => a.timeSec - b.timeSec);
  const deduped = deduplicateMoments(moments);

  // Build summary
  const rhythmPattern = inferRhythmPattern(scenes, energy);
  const effectHotspots = findEffectHotspots(vocabulary, targetDuration);

  return {
    moments: deduped,
    totalShots: deduped.length,
    avgShotDuration: targetDuration / Math.max(1, deduped.length),
    rhythmPattern,
    climaxPosition: energy.climaxPosition,
    breathingPositions: energy.breathingMoments.map(
      bt => refDuration > 0 ? (bt / refDuration) * targetDuration : bt
    ),
    effectHotspots,
  };
}

// ─── Structural Moments ──────────────────────────────────────────

function mapStructuralMoments(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  vocabulary: EffectVocabulary,
  refDuration: number,
  targetDuration: number
): EditMoment[] {
  const moments: EditMoment[] = [];

  // Opening moment (first 10% of timeline)
  moments.push({
    id: "opening",
    timeSec: 0,
    normalizedTime: 0,
    type: "opening",
    priority: "must_hit",
    shotDuration: Math.min(scenes.avgShotDuration * 1.5, targetDuration * 0.15),
    effects: vocabulary.effects.filter(e => e.normalizedTime < 0.1).slice(0, 2),
    visualRole: "establishing",
    description: "Opening shot — sets the tone and visual language",
    constraints: {
      maxDuration: targetDuration * 0.15,
      minDuration: 0.5,
      requireBeatLock: false,
      requireEffect: false,
      allowedTransitions: ["cut"],
    },
  });

  // Closing moment (last 10% of timeline)
  moments.push({
    id: "closing",
    timeSec: targetDuration * 0.9,
    normalizedTime: 0.9,
    type: "closing",
    priority: "must_hit",
    shotDuration: Math.min(scenes.avgShotDuration * 1.2, targetDuration * 0.12),
    effects: vocabulary.effects.filter(e => e.normalizedTime > 0.85).slice(0, 2),
    visualRole: "reaction",
    description: "Closing shot — resolution and emotional release",
    constraints: {
      maxDuration: targetDuration * 0.12,
      minDuration: 0.5,
      requireBeatLock: false,
      requireEffect: false,
      allowedTransitions: ["cut", "crossfade"],
    },
  });

  return moments;
}

// ─── Rhythm Moments ──────────────────────────────────────────────

function mapRhythmMoments(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  refDuration: number,
  targetDuration: number
): EditMoment[] {
  const moments: EditMoment[] = [];

  // Map each scene change to a moment in the target timeline
  for (let i = 0; i < scenes.scenes.length; i++) {
    const scene = scenes.scenes[i];
    const normalizedTime = refDuration > 0 ? scene.timestamp / refDuration : 0;
    const targetTime = normalizedTime * targetDuration;

    // Determine rhythm type based on surrounding shot durations
    const prevDur = i > 0 ? scenes.shotDurations[i - 1] : scenes.avgShotDuration;
    const nextDur = i < scenes.shotDurations.length ? scenes.shotDurations[i] : scenes.avgShotDuration;
    const rhythmType = classifyRhythm(prevDur, nextDur, scenes.avgShotDuration);

    moments.push({
      id: `rhythm_${i}`,
      timeSec: targetTime,
      normalizedTime,
      type: rhythmType,
      priority: i < 3 || i >= scenes.scenes.length - 2 ? "must_hit" : "should_hit",
      shotDuration: nextDur * (targetDuration / refDuration),
      effects: [],
      visualRole: inferVisualRole(normalizedTime, energy.climaxPosition),
      description: `Rhythm point ${i + 1}: ${rhythmType} at ${normalizedTime.toFixed(0)}%`,
      constraints: {
        maxDuration: nextDur * (targetDuration / refDuration) * 1.3,
        minDuration: nextDur * (targetDuration / refDuration) * 0.7,
        requireBeatLock: scene.score > 0.5,
        requireEffect: false,
        allowedTransitions: ["cut", "crossfade"],
      },
    });
  }

  return moments;
}

function classifyRhythm(
  prevDur: number,
  nextDur: number,
  avgDur: number
): MomentType {
  const acceleration = prevDur > 0 ? (prevDur - nextDur) / prevDur : 0;

  if (acceleration > 0.3) return "rhythm_accelerate";
  if (acceleration < -0.3) return "rhythm_decelerate";
  return "rhythm_steady";
}

// ─── Effect Hotspot Mapping ──────────────────────────────────────

function mapEffectHotspots(
  vocabulary: EffectVocabulary,
  refDuration: number,
  targetDuration: number
): EditMoment[] {
  const moments: EditMoment[] = [];

  // Find moments where effects cluster
  const timeline = vocabulary.effectTimeline;
  for (const bucket of timeline) {
    if (bucket.effects.length >= 2) {
      const targetTime = bucket.normalized * targetDuration;

      moments.push({
        id: `effect_${bucket.time.toFixed(0)}`,
        timeSec: targetTime,
        normalizedTime: bucket.normalized,
        type: "impact",
        priority: bucket.intensity > 0.6 ? "must_hit" : "should_hit",
        shotDuration: 1.0,
        effects: bucket.effects.map(type => ({
          type: type as any,
          timestamp: targetTime,
          normalizedTime: bucket.normalized,
          intensity: bucket.intensity,
          durationSec: 0.2,
          trigger: "energy_peak" as const,
          context: "Effect hotspot",
        })),
        visualRole: "impact",
        description: `Effect cluster: ${bucket.effects.join(", ")}`,
        constraints: {
          maxDuration: 2.0,
          minDuration: 0.3,
          requireBeatLock: true,
          requireEffect: true,
          allowedTransitions: ["cut"],
        },
      });
    }
  }

  return moments;
}

// ─── Pacing Moments ──────────────────────────────────────────────

function mapPacingMoments(
  energy: EnergyAnalysisResult,
  refDuration: number,
  targetDuration: number
): EditMoment[] {
  const moments: EditMoment[] = [];

  // Climax moment
  const climaxTime = energy.climaxPosition * targetDuration;
  moments.push({
    id: "climax",
    timeSec: climaxTime,
    normalizedTime: energy.climaxPosition,
    type: "climax",
    priority: "must_hit",
    shotDuration: 0.5, // Climax shots are short and impactful
    effects: [],
    visualRole: "impact",
    description: `Climax at ${(energy.climaxPosition * 100).toFixed(0)}% — maximum energy`,
    constraints: {
      maxDuration: 1.0,
      minDuration: 0.2,
      requireBeatLock: true,
      requireEffect: true,
      allowedTransitions: ["cut"],
    },
  });

  // Breathing moments
  for (let i = 0; i < energy.breathingMoments.length; i++) {
    const bt = energy.breathingMoments[i];
    const normalizedTime = refDuration > 0 ? bt / refDuration : 0;
    const targetTime = normalizedTime * targetDuration;

    moments.push({
      id: `breathing_${i}`,
      timeSec: targetTime,
      normalizedTime,
      type: "breathing",
      priority: "should_hit",
      shotDuration: scenes_avgShotDuration(energy) * 1.5,
      effects: [],
      visualRole: "breath",
      description: `Breathing moment at ${(normalizedTime * 100).toFixed(0)}% — deliberate slow-down`,
      constraints: {
        maxDuration: scenes_avgShotDuration(energy) * 2,
        minDuration: 1.0,
        requireBeatLock: false,
        requireEffect: false,
        allowedTransitions: ["cut", "crossfade"],
      },
    });
  }

  return moments;
}

function scenes_avgShotDuration(energy: EnergyAnalysisResult): number {
  // Estimate from energy frame density
  if (energy.frames.length < 2) return 1.5;
  const avgInterval = energy.totalDuration / energy.frames.length;
  return avgInterval * 3; // Rough estimate: shot ≈ 3 frame intervals
}

// ─── Helpers ──────────────────────────────────────────────────────

function inferVisualRole(normalizedTime: number, climaxPosition: number): string {
  if (normalizedTime < 0.1) return "establishing";
  if (normalizedTime > 0.85) return "reaction";
  if (Math.abs(normalizedTime - climaxPosition) < 0.1) return "impact";
  return "action";
}

function inferRhythmPattern(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult
): string {
  const durations = scenes.shotDurations;
  if (durations.length < 3) return "steady";

  const firstHalf = durations.slice(0, Math.floor(durations.length / 2));
  const secondHalf = durations.slice(Math.floor(durations.length / 2));

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = avgFirst > 0 ? (avgFirst - avgSecond) / avgFirst : 0;

  if (change > 0.3) return "accelerating";
  if (change < -0.3) return "decelerating";

  // Check for wave pattern
  let direction = 0;
  let waves = 0;
  for (let i = 1; i < durations.length; i++) {
    const newDir = durations[i] > durations[i - 1] ? 1 : -1;
    if (newDir !== direction && direction !== 0) waves++;
    direction = newDir;
  }

  if (waves > durations.length / 3) return "wave";

  return "steady";
}

function findEffectHotspots(
  vocabulary: EffectVocabulary,
  targetDuration: number
): Array<{ time: number; effects: string[] }> {
  return vocabulary.effectTimeline
    .filter(b => b.effects.length >= 2)
    .map(b => ({
      time: b.normalized * targetDuration,
      effects: b.effects,
    }));
}

function deduplicateMoments(moments: EditMoment[]): EditMoment[] {
  const deduped: EditMoment[] = [];
  const minGap = 0.3; // Minimum 300ms between moments

  for (const m of moments) {
    const tooClose = deduped.some(
      d => Math.abs(d.timeSec - m.timeSec) < minGap
    );
    if (!tooClose) {
      deduped.push(m);
    } else if (m.priority === "must_hit") {
      // Replace non-must_hit with must_hit
      const idx = deduped.findIndex(
        d => Math.abs(d.timeSec - m.timeSec) < minGap
      );
      if (idx >= 0 && deduped[idx].priority !== "must_hit") {
        deduped[idx] = m;
      }
    }
  }

  return deduped;
}

function emptyMomentMap(targetDuration: number): MomentMap {
  return {
    moments: [],
    totalShots: 0,
    avgShotDuration: targetDuration / 10,
    rhythmPattern: "steady",
    climaxPosition: 0.65,
    breathingPositions: [],
    effectHotspots: [],
  };
}
