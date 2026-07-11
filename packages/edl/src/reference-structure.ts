import type { TempoMode } from "./tempo-modes";

export interface ReferenceStructure {
  totalDuration: number;
  detectedMode: TempoMode;
  shotCount: number;
  avgShotDuration: number;
  pacingCurve: number[];
  cutPattern: number[];
  effectMoments: Array<{
    time: number;
    role: "ramp" | "hit" | "glide";
    suggestedEffect: string;
  }>;
  beatLockedRatio: number;
}

export function buildReferenceStructure(input: {
  shots: Array<{ start: number; end: number; energy: number }>;
  beats: number[];
  totalDuration: number;
}): ReferenceStructure {
  const { shots, beats, totalDuration } = input;

  const cutPattern = shots.map((s) => s.start);
  const avgShotDuration =
    shots.reduce((sum, s) => sum + (s.end - s.start), 0) / (shots.length || 1);

  let onBeat = 0;
  for (const cut of cutPattern) {
    if (beats.length === 0) break;
    const nearest = beats.reduce(
      (best, b) => (Math.abs(b - cut) < Math.abs(best - cut) ? b : best),
      beats[0],
    );
    if (Math.abs(nearest - cut) < 0.08) onBeat++;
  }
  const beatLockedRatio = cutPattern.length ? onBeat / cutPattern.length : 0;

  const pacingCurve: number[] = [];
  for (let t = 0; t < totalDuration; t++) {
    const local = shots.filter((s) => s.start <= t && s.end >= t);
    const energy =
      local.reduce((sum, s) => sum + s.energy, 0) / (local.length || 1);
    pacingCurve.push(Math.min(1, energy));
  }

  let detectedMode: TempoMode = "narrative";
  if (beatLockedRatio > 0.7 && avgShotDuration < 1.0)
    detectedMode = "beat_anticipated";
  else if (beatLockedRatio > 0.6) detectedMode = "beat_locked";
  else if (avgShotDuration > 3) detectedMode = "cinematic";
  else if (avgShotDuration > 1.8) detectedMode = "chill_vlog";

  const effectMoments: ReferenceStructure["effectMoments"] = [];
  for (const cut of cutPattern) {
    effectMoments.push({
      time: cut,
      role: "hit",
      suggestedEffect: "impact_flash",
    });
    if (cut - 0.35 > 0) {
      effectMoments.push({
        time: cut - 0.35,
        role: "ramp",
        suggestedEffect: "speed_ramp",
      });
    }
  }

  return {
    totalDuration,
    detectedMode,
    shotCount: shots.length,
    avgShotDuration,
    pacingCurve,
    cutPattern,
    effectMoments,
    beatLockedRatio,
  };
}
