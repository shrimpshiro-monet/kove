/**
 * Comprehensive Edit Planner
 *
 * The master orchestrator that combines:
 * - Reference style analysis (what the edit should look like)
 * - Music direction (where to cut, when to duck/boost)
 * - Effect planning (what effects at what moments)
 * - Shot selection (which raw footage to use)
 *
 * Output: A complete, render-ready edit plan that FFmpeg can execute.
 */

import type { EffectPlan, ShotEffectPlan } from "./effect-engines";
import type { MusicDirection, MusicCut, DuckZone, BoostZone } from "./music-director";
import type { ReferenceEditTrace } from "../director/reference-edit-trace";
import type { EffectVocabulary } from "./effect-vocabulary";
import type { MomentMap, EditMoment } from "./moment-mapping";

export interface EditPlan {
  version: string;
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  shots: EditPlanShot[];
  audio: AudioPlan;
  effects: EffectPlan;
  metadata: {
    referenceId: string;
    prompt: string;
    generatedAt: number;
    similarity: number;
  };
}

export interface EditPlanShot {
  id: string;
  sourceFile: string;
  sourceStart: number;
  sourceDuration: number;
  timelineStart: number;
  timelineDuration: number;
  effects: string[];
  intensity: number;
  transition: string;
  transitionDuration: number;
  speedRamp: { start: number; end: number } | null;
  colorGrade: {
    temperature: number;
    saturation: number;
    contrast: number;
  };
}

export interface AudioPlan {
  musicFile: string;
  musicStart: number;
  musicEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  duckZones: DuckZone[];
  boostZones: BoostZone[];
}

/**
 * Build a complete edit plan from all analysis data.
 *
 * This is the master function that orchestrates everything.
 * It takes raw analysis results and produces a render-ready plan.
 */
export function buildEditPlan(params: {
  referenceTrace: ReferenceEditTrace;
  vocabulary: EffectVocabulary;
  momentMap: MomentMap;
  musicDirection: MusicDirection;
  rawFootage: {
    file: string;
    duration: number;
    segments: Array<{
      start: number;
      end: number;
      duration: number;
      score: number;
      tags: string[];
    }>;
  };
  musicFile: string;
  targetDuration: number;
  prompt: string;
}): EditPlan {
  const {
    referenceTrace,
    vocabulary,
    momentMap,
    musicDirection,
    rawFootage,
    musicFile,
    targetDuration,
    prompt,
  } = params;

  // ─── 1. Select shots from raw footage ─────────────────────────
  const selectedShots = selectShots(
    referenceTrace,
    momentMap,
    rawFootage,
    targetDuration,
    musicDirection
  );

  // ─── 2. Assign effects to each shot ──────────────────────────
  const shotsWithEffects = assignEffects(
    selectedShots,
    vocabulary,
    musicDirection,
    referenceTrace,
    momentMap
  );

  // ─── 3. Assign transitions ────────────────────────────────────
  const shotsWithTransitions = assignTransitions(
    shotsWithEffects,
    vocabulary,
    musicDirection
  );

  // ─── 4. Assign color grades ───────────────────────────────────
  const shotsWithColor = assignColorGrades(
    shotsWithTransitions,
    referenceTrace
  );

  // ─── 5. Build audio plan ──────────────────────────────────────
  const audioPlan = buildAudioPlan(
    musicFile,
    targetDuration,
    musicDirection,
    selectedShots
  );

  // ─── 6. Build effect plan ─────────────────────────────────────
  const effectPlan = buildEffectPlanFromShots(shotsWithColor, musicDirection);

  // ─── 7. Assemble final plan ───────────────────────────────────
  const plan: EditPlan = {
    version: "1.0.0",
    duration: targetDuration,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    shots: shotsWithColor,
    audio: audioPlan,
    effects: effectPlan,
    metadata: {
      referenceId: referenceTrace.sourceId,
      prompt,
      generatedAt: Date.now(),
      similarity: 0, // Calculated after render
    },
  };

  return plan;
}

// ─── Shot Selection ──────────────────────────────────────────────

function selectShots(
  trace: ReferenceEditTrace,
  momentMap: MomentMap,
  rawFootage: { file: string; duration: number; segments: Array<{ start: number; duration: number; score: number; tags: string[] }> },
  targetDuration: number,
  musicDirection: MusicDirection
): EditPlanShot[] {
  const shots: EditPlanShot[] = [];
  // Don't sort — use original order which has different start positions
  const segments = rawFootage.segments.filter(s => s.duration > 0.2);

  // Use reference shot durations as targets
  const refDurations = trace.shotDurations;
  let currentTime = 0;
  let segIndex = 0;
  const usedSegments = new Set<number>();

  for (let i = 0; i < refDurations.length && currentTime < targetDuration; i++) {
    const targetDur = Math.min(refDurations[i], targetDuration - currentTime);
    if (targetDur < 0.1) continue;

    // Pick the next unused segment, rotating through available ones
    let bestSeg: typeof segments[0] | null = null;
    for (let tries = 0; tries < segments.length; tries++) {
      const idx = (segIndex + tries) % segments.length;
      if (!usedSegments.has(idx) && segments[idx].duration >= targetDur * 0.5) {
        bestSeg = segments[idx];
        usedSegments.add(idx);
        segIndex = idx + 1;
        break;
      }
    }

    // Fallback: reuse any segment
    if (!bestSeg) {
      bestSeg = segments[segIndex % segments.length];
      segIndex++;
    }

    // Check if there's a music cut near this time
    const nearbyCut = musicDirection.cuts.find(
      c => Math.abs(c.time - currentTime) < 0.1
    );

    shots.push({
      id: `shot_${i}`,
      sourceFile: rawFootage.file,
      sourceStart: bestSeg.start,
      sourceDuration: Math.min(targetDur, bestSeg.duration),
      timelineStart: currentTime,
      timelineDuration: targetDur,
      effects: [],
      intensity: 0.5,
      transition: nearbyCut?.strength === "hard" ? "cut" : "cut",
      transitionDuration: 0,
      speedRamp: null,
      colorGrade: { temperature: 0, saturation: 1, contrast: 1 },
    });

    currentTime += targetDur;
  }

  return shots;
}

// ─── Effect Assignment ───────────────────────────────────────────

function assignEffects(
  shots: EditPlanShot[],
  vocabulary: EffectVocabulary,
  musicDirection: MusicDirection,
  trace: ReferenceEditTrace,
  momentMap?: MomentMap | null
): EditPlanShot[] {
  const freq = vocabulary.effectFrequency;
  const totalEffects = vocabulary.totalEffects;
  const effectTypes = (Object.keys(freq) as (keyof typeof freq)[]).sort((a, b) => (freq[b] || 0) - (freq[a] || 0));

  return shots.map((shot, i) => {
    const effects: string[] = [];
    const normalizedTime = shot.timelineStart / shot.timelineDuration;

    // Check if this shot aligns with a music drop
    const isDrop = musicDirection.boostZones.some(
      z => shot.timelineStart >= z.start && shot.timelineStart < z.end
    );

    // Check if this is a moment map hit point
    const isMomentHit = momentMap?.moments.some(
      m => Math.abs(m.timeSec - shot.timelineStart) < 0.2 && m.priority === "must_hit"
    ) ?? false;

    // Assign effects based on reference vocabulary
    const effectBudget = Math.ceil(totalEffects / shots.length);

    if (isDrop) {
      // Drops get maximum effects
      effects.push("zoom_pulse", "shake");
      if (effectTypes.includes("glitch")) effects.push("glitch");
    } else if (isMomentHit) {
      // Moment hits get 2 effects
      effects.push(effectTypes[0] || "push_in");
      effects.push(effectTypes[1] || "vignette");
    } else if (i % 2 === 0) {
      // Every other shot gets a push-in
      effects.push("push_in");
    }

    // Add effects based on vocabulary frequency
    if (effects.length < effectBudget) {
      for (const type of effectTypes) {
        if (effects.length >= effectBudget) break;
        if (!effects.includes(type) && Math.random() < (freq[type] || 0) / totalEffects) {
          effects.push(type);
        }
      }
    }

    return {
      ...shot,
      effects,
      intensity: isDrop ? 0.8 : isMomentHit ? 0.6 : 0.4,
    };
  });
}

// ─── Transition Assignment ───────────────────────────────────────

function assignTransitions(
  shots: EditPlanShot[],
  vocabulary: EffectVocabulary,
  musicDirection: MusicDirection
): EditPlanShot[] {
  const transitionBreakdown = vocabulary.transitionBreakdown;
  const total = transitionBreakdown.cuts + transitionBreakdown.crossfades + transitionBreakdown.whipPans;

  return shots.map((shot, i) => {
    if (i === 0) return { ...shot, transition: "cut", transitionDuration: 0 };

    // Check music cut strength
    const nearbyCut = musicDirection.cuts.find(
      c => Math.abs(c.time - shot.timelineStart) < 0.1
    );

    let transition = "cut";
    let transitionDuration = 0;

    if (nearbyCut?.strength === "hard") {
      transition = "cut";
    } else if (nearbyCut?.strength === "phrase") {
      transition = "crossfade";
      transitionDuration = 0.15;
    } else {
      // Use reference transition distribution
      const rand = Math.random() * total;
      if (rand < transitionBreakdown.cuts) {
        transition = "cut";
      } else if (rand < transitionBreakdown.cuts + transitionBreakdown.whipPans) {
        transition = "whip";
        transitionDuration = 0.12;
      } else {
        transition = "crossfade";
        transitionDuration = 0.2;
      }
    }

    return { ...shot, transition, transitionDuration };
  });
}

// ─── Color Grade Assignment ──────────────────────────────────────

function assignColorGrades(
  shots: EditPlanShot[],
  trace: ReferenceEditTrace
): EditPlanShot[] {
  return shots.map((shot, i) => {
    const normalizedTime = shot.timelineStart / shot.timelineDuration;
    const isClimax = Math.abs(normalizedTime - 0.65) < 0.1;

    return {
      ...shot,
      colorGrade: {
        temperature: 0.05, // Slightly warm
        saturation: isClimax ? 1.3 : 1.1,
        contrast: isClimax ? 1.15 : 1.05,
      },
    };
  });
}

// ─── Audio Plan ──────────────────────────────────────────────────

function buildAudioPlan(
  musicFile: string,
  targetDuration: number,
  musicDirection: MusicDirection,
  shots: EditPlanShot[]
): AudioPlan {
  return {
    musicFile,
    musicStart: 0,
    musicEnd: targetDuration,
    volume: 1.0,
    fadeIn: 0.3,
    fadeOut: 1.0,
    duckZones: musicDirection.duckZones.filter(z => z.start < targetDuration),
    boostZones: musicDirection.boostZones.filter(z => z.start < targetDuration),
  };
}

// ─── Effect Plan Builder ─────────────────────────────────────────

function buildEffectPlanFromShots(
  shots: EditPlanShot[],
  musicDirection: MusicDirection
): EffectPlan {
  return {
    shots: shots.map(shot => ({
      shotId: shot.id,
      startTime: shot.timelineStart,
      duration: shot.timelineDuration,
      effects: shot.effects.map(type => ({
        type,
        intensity: shot.intensity,
        duration: shot.timelineDuration,
        startTime: 0,
        engine: "ffmpeg" as const,
        params: {},
      })),
      transitions: [{
        type: shot.transition as any,
        duration: shot.transitionDuration,
        params: {},
      }],
      speedRamp: shot.speedRamp ? {
        points: [
          { t: 0, speed: shot.speedRamp.start },
          { t: 1, speed: shot.speedRamp.end },
        ],
        easing: "linear",
      } : null,
      colorGrade: {
        temperature: shot.colorGrade.temperature,
        tint: 0,
        saturation: shot.colorGrade.saturation,
        contrast: shot.colorGrade.contrast,
        brightness: 0,
        vignette: 0.2,
        grain: 0.05,
        lut: null,
      },
    })),
    globalEffects: [],
  };
}
