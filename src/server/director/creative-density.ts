import type { MonetEDL } from "../types/edl";
import type { StyleDirectives } from "./style-directives";

export type CreativeDensityReport = {
  passed: boolean;
  durationSec: number;
  effectsCount: number;
  motionEventsCount: number;
  beatLockedCuts: number;
  totalShots: number;
  effectsPer10Sec: number;
  motionEventsPer10Sec: number;
  beatLockedPercent: number;
  failures: string[];
};

function getEffectId(effect: any): string {
  if (typeof effect === "string") return effect;
  return effect?.id ?? effect?.type ?? "unknown";
}

function shotHasMotionEvent(shot: any): boolean {
  const effects = Array.isArray(shot.effects) ? shot.effects : [];

  return effects.some((effect: any) =>
    ["push_in", "speed_ramp", "context_shake", "whip_transition", "color_pulse"].includes(
      getEffectId(effect)
    )
  );
}

export function validateCreativeDensity(
  edl: MonetEDL,
  directives: StyleDirectives
): CreativeDensityReport {
  const shots = edl.shots ?? [];

  const durationSec =
    Number(edl.timeline?.duration) ||
    shots.reduce((max: number, shot: any) => {
      const start = Number(shot.timing?.startTime ?? 0);
      const duration = Number(shot.timing?.duration ?? 0);
      return Math.max(max, start + duration);
    }, 0);

  const safeDuration = Math.max(durationSec, 1);

  const effectsCount = shots.reduce((sum: number, shot: any) => {
    return sum + (Array.isArray(shot.effects) ? shot.effects.length : 0);
  }, 0);

  const motionEventsCount = shots.filter(shotHasMotionEvent).length;
  const beatLockedCuts = shots.filter((shot: any) => shot.beatLock || shot.timing?.beatLocked).length;
  const totalShots = shots.length;

  const effectsPer10Sec = (effectsCount / safeDuration) * 10;
  const motionEventsPer10Sec = (motionEventsCount / safeDuration) * 10;
  const beatLockedPercent = totalShots > 0 ? (beatLockedCuts / totalShots) * 100 : 0;

  const failures: string[] = [];

  if (effectsPer10Sec < directives.minimumCreativeDensity.minEffectsPer10Sec) {
    failures.push(
      `Too few effects: ${effectsPer10Sec.toFixed(1)} per 10s, expected at least ${directives.minimumCreativeDensity.minEffectsPer10Sec}.`
    );
  }

  if (motionEventsPer10Sec < directives.minimumCreativeDensity.minMotionEventsPer10Sec) {
    failures.push(
      `Too few motion events: ${motionEventsPer10Sec.toFixed(1)} per 10s, expected at least ${directives.minimumCreativeDensity.minMotionEventsPer10Sec}.`
    );
  }

  if (beatLockedPercent < directives.minimumCreativeDensity.minBeatLockedCutsPercent) {
    failures.push(
      `Not beat locked enough: ${beatLockedPercent.toFixed(0)}%, expected at least ${directives.minimumCreativeDensity.minBeatLockedCutsPercent}%.`
    );
  }

  return {
    passed: failures.length === 0,
    durationSec,
    effectsCount,
    motionEventsCount,
    beatLockedCuts,
    totalShots,
    effectsPer10Sec,
    motionEventsPer10Sec,
    beatLockedPercent,
    failures,
  };
}