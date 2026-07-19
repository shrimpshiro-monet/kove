import type { ProjectEDL as MonetEDL, Clip } from "@monet/edl";

export interface ResolvedFrame {
  clip: Clip;
  localTime: number;
  globalTime: number;
}

export interface ResolvedKeyframes {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
}

/**
 * Interpolate clip-level keyframes at a given local time.
 * Falls back to static transform values when no keyframes exist.
 */
export function resolveClipKeyframes(clip: Clip, localTime: number): ResolvedKeyframes {
  const result: ResolvedKeyframes = {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  };

  // Position keyframes
  const posKfs = clip.transforms?.position;
  if (posKfs?.length) {
    result.position.x = interpolateKeyframes(posKfs, "x", localTime);
    result.position.y = interpolateKeyframes(posKfs, "y", localTime);
  } else {
    result.position.x = (clip.transforms?.position as any)?.[0]?.x ?? 0;
    result.position.y = (clip.transforms?.position as any)?.[0]?.y ?? 0;
  }

  // Scale keyframes
  const scaleKfs = clip.transforms?.scale;
  if (scaleKfs?.length) {
    result.scale.x = interpolateKeyframes(scaleKfs, "value", localTime);
    result.scale.y = interpolateKeyframes(scaleKfs, "value", localTime);
  } else {
    result.scale.x = (clip.transforms?.scale as any)?.[0]?.value ?? 1;
    result.scale.y = result.scale.x;
  }

  // Rotation keyframes
  const rotKfs = clip.transforms?.rotation;
  if (rotKfs?.length) {
    result.rotation = interpolateKeyframes(rotKfs, "value", localTime);
  } else {
    result.rotation = (clip.transforms?.rotation as any)?.[0]?.value ?? 0;
  }

  // Opacity — check effects for opacity keyframes
  for (const effect of clip.effects ?? []) {
    if (effect.type === "opacity" && effect.params?.keyframes) {
      result.opacity = interpolateKeyframes(effect.params.keyframes, "value", localTime);
      break;
    }
  }

  return result;
}

function interpolateKeyframes(
  keyframes: Array<Record<string, unknown>>,
  prop: string,
  time: number,
): number {
  if (!keyframes?.length) return 0;

  // Find surrounding keyframes
  let prev = keyframes[0];
  let next = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const aTime = (a.time as number) ?? 0;
    const bTime = (b.time as number) ?? 0;

    if (time >= aTime && time <= bTime) {
      prev = a;
      next = b;
      break;
    }
  }

  const prevTime = (prev.time as number) ?? 0;
  const nextTime = (next.time as number) ?? 0;
  const prevVal = (prev[prop] as number) ?? 0;
  const nextVal = (next[prop] as number) ?? 0;

  const duration = nextTime - prevTime;
  if (duration <= 0) return prevVal;

  const t = Math.max(0, Math.min(1, (time - prevTime) / duration));
  const easing = (next.easing as string) ?? "linear";
  const eased = applyEasing(easing, t);

  return prevVal + (nextVal - prevVal) * eased;
}

function applyEasing(type: string, t: number): number {
  switch (type) {
    case "ease-in": return t * t;
    case "ease-out": return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default: return t;
  }
}

const indexCache = new WeakMap<MonetEDL, IndexedTrack[]>();

interface IndexedTrack {
  starts: number[];
  clips: Clip[];
}

function buildIndex(edl: MonetEDL): IndexedTrack[] {
  const out: IndexedTrack[] = [];
  for (const t of edl.timeline.tracks) {
    if (t.type !== "video") continue;
    const sorted = [...t.clips].sort((a, b) => a.startTime - b.startTime);
    out.push({
      starts: sorted.map((c) => c.startTime),
      clips: sorted,
    });
  }
  return out;
}

function findClipAt(track: IndexedTrack, time: number): Clip | null {
  let lo = 0, hi = track.starts.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track.starts[mid] <= time) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx === -1) return null;
  const c = track.clips[idx];
  if (time <= c.startTime + c.duration) return c;
  return null;
}

export function resolveFrame(edl: MonetEDL, time: number): ResolvedFrame | null {
  let idx = indexCache.get(edl);
  if (!idx) {
    idx = buildIndex(edl);
    indexCache.set(edl, idx);
  }
  for (const track of idx) {
    const clip = findClipAt(track, time);
    if (clip) {
      return {
        clip,
        localTime: (time - clip.startTime) * (clip.speed || 1),
        globalTime: time,
      };
    }
  }
  return null;
}

export function invalidateResolverCache(edl: MonetEDL) {
  indexCache.delete(edl);
}
