/**
 * reference-to-edl.ts — Generates MonetEDL from training data.
 *
 * Takes a reference style from the training catalog and user footage,
 * then produces a MonetEDL that replicates the reference edit's
 * pacing, effects, transitions, and energy curve.
 *
 * This is the bridge between "analyze reference" and "edit like reference".
 */

import type { MonetEDL, Shot } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";
import type { TransitionType, EasingType } from "@monet/edl";

export interface ReferenceTrainingEntry {
  id: string;
  file: string;
  name: string;
  info: {
    duration: number;
    width: number;
    height: number;
    codec: string;
    fps: number;
  };
  shots: {
    count: number;
    timeline: Array<{
      index: number;
      startTime: number;
      endTime: number;
      duration: number;
    }>;
    pacing: {
      avg: number;
      median: number;
      min: number;
      max: number;
      variance: number;
    };
  };
  cuts: {
    timestamps: number[];
    count: number;
    cutRate: number;
  };
  energy: {
    curve: number[];
    avgBrightness: number;
    avgMotion: number;
    peakMoment: number;
    peakIntensity: number;
    climaxPosition: number;
    breathingMoments: number[];
  };
  beat: {
    bpm: number;
    confidence: number;
    avgInterval: number;
    grid: number[];
  };
  effects: {
    detected: Array<{
      type: string;
      timestamp: number;
      intensity: number;
    }>;
    vocabulary: Record<string, number>;
    total: number;
  };
  transitions: {
    vocabulary: Record<string, number>;
  };
}

interface GenerateOptions {
  footageClipIds: string[];
  footageDuration: number;
  musicClipId?: string;
  beatGrid?: number[];
  totalDuration?: number;
  intensity?: number; // 0-1, scales effect density
}

function generateId(): string {
  return `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a MonetEDL from a reference training entry.
 *
 * Maps the reference's shot timing, effects, transitions, and energy
 * to a new EDL using the provided footage clips.
 */
export function generateEDLFromReference(
  reference: ReferenceTrainingEntry,
  style: ReferenceStyle,
  options: GenerateOptions
): MonetEDL {
  const {
    footageClipIds,
    footageDuration,
    musicClipId,
    beatGrid,
    totalDuration: requestedDuration,
    intensity = 0.7,
  } = options;

  const totalDur = requestedDuration ?? reference.info.duration;
  const shotCount = reference.shots.count;

  // Scale shot durations to fit the target duration
  const scaleFactor = totalDur / reference.info.duration;

  // Generate shots by sampling the reference timeline
  const shots: Shot[] = [];
  let currentTime = 0;

  for (let i = 0; i < shotCount && currentTime < totalDur; i++) {
    const refShot = reference.shots.timeline[i % reference.shots.timeline.length];
    const clipId = pickRandom(footageClipIds);

    // Duration scaled to target, with some randomness from variance
    const baseDuration = refShot.duration * scaleFactor;
    const variance = reference.shots.pacing.variance * scaleFactor * 0.3;
    const duration = Math.max(0.1, baseDuration + (Math.random() - 0.5) * variance);

    // Source in/out points — distribute across footage
    const sourceStart = (currentTime / totalDur) * footageDuration;
    const sourceEnd = Math.min(footageDuration, sourceStart + duration * footageDuration / totalDur);

    // Effects — map from reference vocabulary to this shot
    const shotEffects = mapEffectsToShot(
      reference,
      i,
      currentTime,
      duration,
      intensity
    );

    // Transition — match reference transition vocabulary
    const transition = pickTransition(reference, i, shotCount);

    // Beat lock — if we have a beat grid, lock to nearest beat
    const beatLock = beatGrid?.length
      ? findNearestBeat(beatGrid, currentTime)
      : undefined;

    // Speed ramp — if reference has speed ramps near this position
    const speedRamp = detectSpeedRamp(reference, currentTime);

    shots.push({
      id: generateId(),
      name: `Shot ${i + 1}`,
      source: {
        clipId,
        inPoint: sourceStart,
        outPoint: sourceEnd,
      },
      timing: {
        startTime: currentTime,
        duration: Math.min(duration, totalDur - currentTime),
        speed: speedRamp ? undefined : 1,
        speedRamp: speedRamp as Shot["timing"]["speedRamp"],
      },
      effects: shotEffects.length > 0 ? shotEffects as Shot["effects"] : undefined,
      transition: transition as Shot["transition"],
      beatLock,
      meta: {
        fromReference: reference.id,
        referenceShotIndex: i,
        energyAtPosition: sampleEnergyCurve(reference.energy.curve, currentTime / totalDur),
      },
    });

    currentTime += Math.min(duration, totalDur - currentTime);
  }

  // Global effects from reference
  const globalEffects: MonetEDL["globalEffects"] = {
    colorGrade: style.intentMapping?.colorTreatment ?? "natural",
  };

  const music = musicClipId
    ? {
        id: `music-${Date.now().toString(36)}`,
        sourceId: musicClipId,
        beatGrid: beatGrid ?? reference.beat.grid,
        bpm: reference.beat.bpm,
        volume: 1,
      }
    : undefined;

  return {
    version: "1.0.0",
    metadata: {
      title: `Reference: ${reference.name}`,
      createdAt: Date.now(),
      aiModel: "reference-matcher",
      prompt: `Replicate style of ${reference.name}`,
      intentId: `ref-${reference.id}`,
      analysisId: `ref-${reference.id}`,
    },
    timeline: {
      duration: totalDur,
      fps: reference.info.fps || 30,
      resolution: {
        width: reference.info.width || 1920,
        height: reference.info.height || 1080,
      },
    },
    shots,
    music: music as MonetEDL["music"],
    globalEffects,
  };
}

function mapEffectsToShot(
  reference: ReferenceTrainingEntry,
  shotIndex: number,
  shotStartTime: number,
  shotDuration: number,
  intensity: number
): Array<{ id: string; type: string; intensity: number }> {
  const effects: Array<{ id: string; type: string; intensity: number }> = [];

  // Check what effects the reference has at this time position
  const nearbyEffects = reference.effects.detected.filter(
    (e) => Math.abs(e.timestamp - shotStartTime) < shotDuration
  );

  // Map reference effect types to Kove's ACTUAL effect vocabulary
  // These types exist in editly-effects.ts and the Kove effects engine
  const effectMap: Record<string, string> = {
    impact_flash: "flash_white",     // Kove: flash_white (white overlay)
    speed_ramp: "speed_ramp",        // Kove: speed_ramp (velocity change)
    context_shake: "shake",          // Kove: shake (camera shake)
    chromatic_burst: "chromatic_aberration", // Kove: chromatic_aberration (RGB split)
    bloom_highlights: "glow",        // Kove: glow (bloom/glow)
  };

  for (const refEffect of nearbyEffects) {
    const mappedType = effectMap[refEffect.type] ?? refEffect.type;
    effects.push({
      id: `fx-${shotIndex}-${refEffect.type}`,
      type: mappedType,
      intensity: Math.min(1, refEffect.intensity * intensity),
    });
  }

  // If reference has high effect density, add effects based on vocabulary
  const effectDensity = reference.effects.total / Math.max(1, reference.shots.count);
  if (effectDensity > 1.5 && effects.length === 0) {
    // This shot should have an effect based on the reference's vocabulary
    const vocab = Object.entries(reference.effects.vocabulary);
    if (vocab.length > 0) {
      // Pick a random effect weighted by frequency
      const totalWeight = vocab.reduce((s, [, count]) => s + count, 0);
      let roll = Math.random() * totalWeight;
      for (const [type, count] of vocab) {
        roll -= count;
        if (roll <= 0) {
          const mappedType = effectMap[type] ?? type;
          effects.push({
            id: `fx-${shotIndex}-${type}`,
            type: mappedType,
            intensity: 0.5 * intensity,
          });
          break;
        }
      }
    }
  }

  return effects;
}

function pickTransition(
  reference: ReferenceTrainingEntry,
  shotIndex: number,
  totalShots: number
): { type: string; duration: number } | undefined {
  if (shotIndex === 0) return undefined; // No transition on first shot

  const vocab = reference.transitions.vocabulary;
  const totalTrans = Object.values(vocab).reduce((s, c) => s + c, 0);

  if (totalTrans === 0) return { type: "cut", duration: 0 };

  // Weighted random pick from vocabulary
  let roll = Math.random() * totalTrans;
  let transitionType = "cut";

  for (const [type, count] of Object.entries(vocab)) {
    roll -= count;
    if (roll <= 0) {
      transitionType = type;
      break;
    }
  }

  // Flash transitions are quick, cuts are instant
  const duration = transitionType === "flash" ? 0.1 : 0;

  return {
    type: transitionType,
    duration,
  };
}

function findNearestBeat(
  beatGrid: number[],
  time: number
): { beatIndex: number; lockMode: "start" | "end" | "center" } | undefined {
  if (beatGrid.length === 0) return undefined;

  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < beatGrid.length; i++) {
    const dist = Math.abs(beatGrid[i] - time);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  // Only lock if within 0.3s of a beat
  if (bestDist > 0.3) return undefined;

  return {
    beatIndex: bestIdx,
    lockMode: "start",
  };
}

function detectSpeedRamp(
  reference: ReferenceTrainingEntry,
  time: number
): { startSpeed: number; endSpeed: number; easing: EasingType } | undefined {
  const ramp = reference.effects.detected.find(
    (e) => e.type === "speed_ramp" && Math.abs(e.timestamp - time) < 0.5
  );

  if (!ramp) return undefined;

  // Speed ramp: slow down then speed up
  return {
    startSpeed: 0.5,
    endSpeed: 1.5,
    easing: "easeInOut" as EasingType,
  };
}

function sampleEnergyCurve(curve: number[], position: number): number {
  if (curve.length === 0) return 0.5;
  const idx = position * (curve.length - 1);
  const low = Math.floor(idx);
  const high = Math.min(low + 1, curve.length - 1);
  const frac = idx - low;
  return curve[low] * (1 - frac) + curve[high] * frac;
}
