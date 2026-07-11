import type { ProjectEDL as MonetEDL, Clip } from "@monet/edl";

export interface ResolvedFrame {
  clip: Clip;
  localTime: number;
  globalTime: number;
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
