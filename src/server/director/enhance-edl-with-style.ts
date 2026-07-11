import type { MonetEDL } from "../types/edl";
import type { EditIntensity, StyleDirectives, TempoMode } from "./style-directives";
import {
  TEMPO_PROFILES,
  pickEffect,
  type TempoProfile,
  type EffectRole,
} from "@monet/edl";

function makeEffect(id: string, params: Record<string, unknown> = {}) {
  return {
    id,
    type: id,
    ...params,
    params,
  };
}

function shouldApplyEvery(index: number, frequency: EditIntensity): boolean {
  if (frequency === "extreme") return true;
  if (frequency === "high") return index % 2 === 0;
  if (frequency === "medium") return index % 3 === 0;
  return index % 5 === 0;
}

function normalizeEffects(effects: unknown): any[] {
  return Array.isArray(effects) ? [...effects] : [];
}

/**
 * Build a set of beat timestamps from the EDL music grid.
 * Returns sorted seconds.
 */
function getBeatTimes(edl: MonetEDL): number[] {
  const grid = edl.music?.beatGrid;
  if (!grid || grid.length === 0) return [];
  return [...grid].sort((a, b) => a - b);
}

/**
 * Find the nearest beat to a given time.
 */
function nearestBeat(time: number, beats: number[]): number {
  if (beats.length === 0) return time;
  return beats.reduce(
    (best, b) => (Math.abs(b - time) < Math.abs(best - time) ? b : best),
    beats[0],
  );
}

/**
 * Determine if a shot overlaps a drop moment.
 * Drops are detected from music energy spikes.
 */
function isDropMoment(
  shotStart: number,
  beats: number[],
  drops: number[],
): boolean {
  if (drops.length === 0) return false;
  return drops.some((d) => Math.abs(d - shotStart) < 0.15);
}

/**
 * Role-based effect placement: ramp leads INTO the beat, hit lands ON the beat,
 * glide breathes BETWEEN beats. This is the core Tempo Brain logic.
 */
function placeRoleBasedEffects(
  shot: any,
  shotIndex: number,
  beatTime: number,
  profile: TempoProfile,
  isDrop: boolean,
  intensity: number,
): any[] {
  const effects: any[] = [];
  const shotStart = shot.timing?.startTime ?? 0;
  const shotDuration = shot.timing?.duration ?? 1;
  const shotLocalBeat = beatTime - shotStart;

  // Always add beat_cut — it's the fundamental rhythm marker
  effects.push(
    makeEffect("beat_cut", {
      strength: "beat_locked",
      role: "hit",
    }),
  );

  // RAMP phase — anticipation BEFORE the beat
  if (profile.rampEffects.length > 0 && profile.anticipationLead > 0) {
    const rampStart = Math.max(0, shotLocalBeat - profile.anticipationLead);
    const rampEffect = pickEffect(profile.rampEffects, shotIndex);
    const rampIntensity = isDrop ? 0.9 : 0.55;

    effects.push(
      makeEffect(rampEffect, {
        role: "ramp",
        startTime: rampStart,
        duration: profile.anticipationDuration,
        intensity: rampIntensity * intensity,
      }),
    );
  }

  // HIT phase — impact ON the beat
  if (profile.hitEffects.length > 0) {
    const hitEffect = pickEffect(profile.hitEffects, shotIndex);
    const hitIntensity = isDrop ? 1.0 : 0.65;

    effects.push(
      makeEffect(hitEffect, {
        role: "hit",
        startTime: Math.max(0, shotLocalBeat + profile.impactOffset),
        duration: 0.12,
        intensity: hitIntensity * intensity,
      }),
    );
  }

  // GLIDE phase — breathing BETWEEN beats (only on some shots for variety)
  if (
    profile.glideEffects.length > 0 &&
    Math.random() < profile.density * 0.5
  ) {
    const glideEffect = pickEffect(profile.glideEffects, shotIndex + 100);

    effects.push(
      makeEffect(glideEffect, {
        role: "glide",
        startTime: 0,
        duration: shotDuration,
        intensity: 0.3 * intensity,
      }),
    );
  }

  return effects;
}

/**
 * Legacy mode — the old decoration-based approach.
 * Kept as fallback for non-tempo-aware paths.
 */
function placeLegacyEffects(
  shot: any,
  index: number,
  directives: StyleDirectives,
  intensity: number,
  isSubtle: boolean,
  isAggressive: boolean,
): any[] {
  const effects: any[] = [];

  effects.push(
    makeEffect("beat_cut", {
      strength: directives.rhythm.beatAlignment,
    }),
  );

  if (shouldApplyEvery(index, directives.motion.pushInFrequency)) {
    const scaleAmount = isSubtle ? 1.05 : isAggressive ? 1.15 : 1.1;
    effects.push(
      makeEffect("push_in", {
        scaleFrom: 1,
        scaleTo: scaleAmount,
        intensity: 0.3 * intensity,
        easing: "easeOutCubic",
      }),
    );
  }

  if (shouldApplyEvery(index, directives.effects.flashFrequency) && !isSubtle) {
    effects.push(
      makeEffect("impact_flash", {
        intensity:
          (directives.mode === "strict_replication" ? 0.7 : 0.4) * intensity,
        durationSec: 0.06,
      }),
    );
    effects.push(
      makeEffect("color_pulse", {
        intensity:
          (directives.mode === "strict_replication" ? 0.35 : 0.2) * intensity,
        durationSec: 0.12,
      }),
    );
  }

  if (
    shouldApplyEvery(index, directives.motion.cameraShakeFrequency) &&
    !isSubtle
  ) {
    effects.push(
      makeEffect("context_shake", {
        intensity:
          (directives.mode === "strict_replication" ? 0.6 : 0.3) * intensity,
        decay: 0.65,
        durationSec: 0.15,
      }),
    );
  }

  if (shouldApplyEvery(index, directives.motion.speedRampFrequency)) {
    effects.push(
      makeEffect("speed_ramp", {
        curve: directives.motion.velocityCurveStyle,
        points: [
          { t: 0, speed: 1.0 },
          { t: 0.35, speed: 0.72 },
          { t: 0.72, speed: 1.38 },
          { t: 1.0, speed: 1.0 },
        ],
      }),
    );
  }

  if (shouldApplyEvery(index, directives.effects.transitionFrequency)) {
    effects.push(
      makeEffect("whip_transition", {
        direction: index % 2 === 0 ? "right" : "left",
        blur: 0.45,
        durationSec: 0.12,
      }),
    );
  }

  return effects;
}

export function enhanceEDLWithStyleDirectives(
  edl: MonetEDL,
  directives: StyleDirectives
): MonetEDL {
  const intensity = Math.max(0, Math.min(1, edl.intensity ?? 0.5));
  const styleDNA = (edl as any).meta?.styleDNA ?? null;
  const grade = styleDNA?.grade ?? {};
  const isSubtle =
    (grade.saturation ?? 1) < 1.0 && (grade.contrast ?? 1) < 1.15;
  const isAggressive =
    (grade.saturation ?? 1) > 1.3 || (grade.contrast ?? 1) > 1.3;

  const tempo = directives.tempoMode ?? "narrative";
  const profile = TEMPO_PROFILES[tempo];
  const beats = getBeatTimes(edl);
  const drops: number[] = (edl as any).meta?.musicDrops ?? [];

  const useRoleBased = tempo !== "narrative" || directives.mode === "strict_replication";

  // Reference-influenced timing: adjust shot durations to match target
  const targetAvgDuration = directives.pacing.targetAvgShotDurationSec;
  const currentAvgDuration = (edl.shots ?? []).length > 0
    ? (edl.shots ?? []).reduce((sum: number, s: any) => sum + (s.timing?.duration ?? 1), 0) / (edl.shots ?? []).length
    : 1;
  const timingRatio = currentAvgDuration > 0 ? targetAvgDuration / currentAvgDuration : 1;

  const shots = (edl.shots ?? []).map((shot: any, index: number) => {
    let effects: any[];

    // Apply reference-influenced timing adjustment (±30% max)
    const clampedRatio = Math.max(0.7, Math.min(1.3, timingRatio));
    const adjustedDuration = Math.max(
      directives.pacing.minShotDurationSec,
      Math.min(directives.pacing.maxShotDurationSec, (shot.timing?.duration ?? 1) * clampedRatio)
    );

    if (useRoleBased && beats.length > 0) {
      const beatTime = nearestBeat(
        shot.timing?.startTime ?? 0,
        beats,
      );
      const drop = isDropMoment(beatTime, beats, drops);

      effects = placeRoleBasedEffects(
        shot,
        index,
        beatTime,
        profile,
        drop,
        intensity,
      );
    } else {
      effects = placeLegacyEffects(
        shot,
        index,
        directives,
        intensity,
        isSubtle,
        isAggressive,
      );
    }

    // GPU effects — only in strict_replication mode
    if (index % 2 === 0 && directives.mode === "strict_replication") {
      const gpuPool = isSubtle
        ? [
            { type: "vignette_punch", params: { intensity: 0.3 } },
            { type: "sepia", params: { intensity: 0.3 } },
            { type: "bloom_highlights", params: { intensity: 0.2 } },
          ]
        : isAggressive
          ? [
              { type: "hologram", params: { intensity: 0.6 } },
              { type: "thermal", params: { intensity: 0.5 } },
              { type: "plasma", params: { intensity: 0.4 } },
            ]
          : [
              { type: "bloom_highlights", params: { intensity: 0.35 } },
              { type: "sepia", params: { intensity: 0.3 } },
              { type: "vignette_punch", params: { intensity: 0.3 } },
            ];
      const gpu = gpuPool[index % gpuPool.length];
      effects.push(
        makeEffect(gpu.type, {
          ...gpu.params,
          intensity: (gpu.params.intensity ?? 0.4) * intensity,
        }),
      );
    }

    return {
      ...shot,
      timing: {
        ...shot.timing,
        duration: adjustedDuration,
        speedRamp:
          shot.timing?.speedRamp ??
          (useRoleBased && profile.rampEffects.includes("speed_ramp")
            ? { startSpeed: 0.8, endSpeed: 1.35 }
            : undefined),
      },
      beatLock:
        shot.beatLock ??
        (directives.rhythm.beatAlignment !== "loose"
          ? { beatIndex: index, lockMode: "start" as const }
          : undefined),
      effects,
      meta: {
        ...(shot.meta ?? {}),
        styleEnhanced: true,
        styleMode: directives.mode,
        tempoMode: tempo,
        effectRoles: useRoleBased ? ["ramp", "hit", "glide"] : undefined,
      },
    };
  });

  return {
    ...edl,
    shots,
    meta: {
      ...((edl as any).meta ?? {}),
      enhancedByStyleDirectives: true,
      styleDirectives: directives,
      tempoMode: tempo,
    },
  } as MonetEDL;
}
