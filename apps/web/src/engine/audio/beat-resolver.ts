// apps/web/src/engine/audio/beat-resolver.ts

export interface Beat {
  time: number;
  strength?: number;
}

export function getCurrentBeat(
  beats: Beat[],
  time: number
): Beat | null {
  if (beats.length === 0) return null;

  let closest = beats[0];

  for (const beat of beats) {
    if (Math.abs(beat.time - time) < Math.abs(closest.time - time)) {
      closest = beat;
    }
  }

  return closest;
}

export function isBeatHit(
  beats: Beat[],
  time: number,
  threshold = 0.05
): boolean {
  return beats.some((b) => Math.abs(b.time - time) < threshold);
}
