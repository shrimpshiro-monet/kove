// src/lib/renderer/edl-hash.ts
/**
 * Deterministic content hash for an EDL.
 * Two EDLs that produce identical output hash to the same string.
 * Cheap enough to compute on every React render (microseconds).
 */

import type { MonetEDL } from "../../../apps/web/src/lib/executors/monet-action-executor";

const VERSION = 1;

export function hashEdl(edl: MonetEDL | null | undefined): string {
  if (!edl) return "empty";

  const normalized = {
    v: VERSION,
    d: round(edl.duration || (edl as any).timeline?.duration || 0, 3),
    shots: (edl.shots || []).map((s) => ({
      c: s.clipId || (s as any).source?.clipId,
      i: round(s.sourceIn || (s as any).source?.inPoint || 0, 3),
      o: round(s.sourceOut || (s as any).source?.outPoint || 0, 3),
      t: round(s.timelineStart || (s as any).timing?.startTime || 0, 3),
      d: round(s.duration || (s as any).timing?.duration || 0, 3),
      f: (s.features || (s as any).effects || []).map((f: any) => ({
        k: f.kind || f.type || f.id || "",
        a: round(f.atTime ?? f.startTime ?? 0, 3),
        d: round(f.duration ?? 0, 3),
        i: round(f.intensity ?? 0.7, 2),
        p: stringifyParams(f.params),
      })).sort((a: any, b: any) => (a.k + a.a).localeCompare(b.k + b.a)),
    })),
    captions: (edl.captions || []).map((c) => ({
      t: c.text,
      s: round(c.startTime, 3),
      d: round(c.duration, 3),
      st: stringifyParams(c.style),
    })),
    audio: (edl.audioTracks || []).map((a) => ({
      m: a.mediaId,
      s: round(a.timelineStart, 3),
      v: round(a.volume ?? 1, 2),
    })),
    style: stringifyParams(edl.style || (edl as any).globalEffects),
  };

  return fnv1a(JSON.stringify(normalized));
}

function round(n: number, p: number): number {
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

function stringifyParams(p: any): string {
  if (!p) return "";
  return JSON.stringify(p, Object.keys(p).sort());
}

// Fast non-crypto hash (fnv1a 32-bit) — sufficient for cache keys
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Same idea but hashes ONLY the per-shot data, so we can identify which
 * specific shots changed between two EDLs.
 */
export function hashShot(shot: any): string {
  const n = {
    c: shot.clipId || shot.source?.clipId,
    i: round(shot.sourceIn || shot.source?.inPoint || 0, 3),
    o: round(shot.sourceOut || shot.source?.outPoint || 0, 3),
    t: round(shot.timelineStart || shot.timing?.startTime || 0, 3),
    d: round(shot.duration || shot.timing?.duration || 0, 3),
    f: (shot.features || shot.effects || []).map((f: any) => `${f.kind || f.type || f.id}:${f.atTime ?? f.startTime ?? 0}:${f.duration ?? 0}:${f.intensity ?? 0.7}`).sort(),
  };
  return fnv1a(JSON.stringify(n));
}

/**
 * Diff two EDLs and return which shot indices changed.
 * Use this to drive incremental re-renders.
 */
export function diffEdl(
  prev: MonetEDL | null, next: MonetEDL,
): { dirtyShotIndices: number[]; captionsChanged: boolean; audioChanged: boolean; fullRebuild: boolean } {
  if (!prev) {
    return {
      dirtyShotIndices: next.shots.map((_, i) => i),
      captionsChanged: true,
      audioChanged: true,
      fullRebuild: true,
    };
  }

  if (prev.shots.length !== next.shots.length) {
    return {
      dirtyShotIndices: next.shots.map((_, i) => i),
      captionsChanged: hashCaptions(prev) !== hashCaptions(next),
      audioChanged: hashAudio(prev) !== hashAudio(next),
      fullRebuild: true,
    };
  }

  const dirty: number[] = [];
  for (let i = 0; i < next.shots.length; i++) {
    if (hashShot(prev.shots[i]) !== hashShot(next.shots[i])) {
      dirty.push(i);
    }
  }

  return {
    dirtyShotIndices: dirty,
    captionsChanged: hashCaptions(prev) !== hashCaptions(next),
    audioChanged: hashAudio(prev) !== hashAudio(next),
    fullRebuild: false,
  };
}

function hashCaptions(edl: MonetEDL): string {
  return fnv1a(JSON.stringify(edl.captions || []));
}
function hashAudio(edl: MonetEDL): string {
  return fnv1a(JSON.stringify(edl.audioTracks || []));
}
