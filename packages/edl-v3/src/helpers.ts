/**
 * ShotEDL V3 Helpers
 *
 * Utility functions for creating, querying, and manipulating ShotEDLs.
 */
import type { ShotEDL, Shot, ShotSource, ShotTiming, ShotTransition, ShotEffect, ShotAudio, ShotTransform, MediaAsset, Marker } from "./schema";

// ── Creation ────────────────────────────────────────────────────────────────

/**
 * Create an empty ShotEDL with sensible defaults.
 */
export function createEmptyShotEDL(opts?: {
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  fps?: number;
  prompt?: string;
}): ShotEDL {
  return {
    version: 3,
    id: `edl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    meta: {
      aspectRatio: opts?.aspectRatio ?? "9:16",
      fps: opts?.fps ?? 30,
      duration: 0,
      createdAt: Date.now(),
      prompt: opts?.prompt,
    },
    shots: [],
    assets: { media: {} },
    markers: [],
  };
}

/**
 * Create a Shot from minimal params — fills defaults for everything else.
 */
export function createShot(params: {
  id?: string;
  clipId: string;
  inPoint: number;
  outPoint: number;
  startTime: number;
  speed?: number;
  effects?: ShotEffect[];
  transition?: Partial<ShotTransition>;
  audio?: Partial<ShotAudio>;
  meta?: Partial<Shot["meta"]>;
}): Shot {
  const duration = (params.outPoint - params.inPoint) / (params.speed ?? 1);
  return {
    id: params.id ?? `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: {
      clipId: params.clipId,
      inPoint: params.inPoint,
      outPoint: params.outPoint,
    },
    timing: {
      startTime: params.startTime,
      duration,
      speed: params.speed ?? 1,
      beatLocked: false,
    },
    transition: {
      type: "cut",
      duration: 0,
      easing: "linear",
      params: {},
      ...params.transition,
    },
    effects: params.effects ?? [],
    audio: { gain: 1, fadeIn: 0, fadeOut: 0, pan: 0, ...params.audio },
    transform: {
      position: [{ time: 0, x: 0, y: 0 }],
      scale: [{ time: 0, value: 1 }],
      rotation: [{ time: 0, value: 0 }],
    },
    overlays: [],
    meta: {
      importance: 0.5,
      ...params.meta,
    },
  };
}

/**
 * Register a media asset in the EDL.
 */
export function registerAsset(
  edl: ShotEDL,
  asset: { id: string; path: string; duration: number; width: number; height: number; mimeType?: string }
): void {
  edl.assets.media[asset.id] = {
    id: asset.id,
    path: asset.path,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
  };
}

/**
 * Add a marker to the timeline.
 */
export function addMarker(
  edl: ShotEDL,
  marker: { time: number; label?: string; type?: Marker["type"] }
): Marker {
  const m: Marker = {
    id: `marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: marker.time,
    label: marker.label,
    type: marker.type ?? "custom",
  };
  edl.markers.push(m);
  return m;
}

// ── Query ───────────────────────────────────────────────────────────────────

/**
 * Get the end time of the last shot.
 */
export function getTimelineEnd(edl: ShotEDL): number {
  if (edl.shots.length === 0) return 0;
  const sorted = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
  const last = sorted[sorted.length - 1];
  return last.timing.startTime + last.timing.duration;
}

/**
 * Get all shots that overlap a given time range.
 */
export function getShotsInRange(edl: ShotEDL, start: number, end: number): Shot[] {
  return edl.shots.filter((shot) => {
    const shotEnd = shot.timing.startTime + shot.timing.duration;
    return shot.timing.startTime < end && shotEnd > start;
  });
}

/**
 * Get the shot at a specific time.
 */
export function getShotAtTime(edl: ShotEDL, time: number): Shot | undefined {
  return edl.shots.find((shot) => {
    const shotEnd = shot.timing.startTime + shot.timing.duration;
    return time >= shot.timing.startTime && time < shotEnd;
  });
}

/**
 * Get shots by narrative role.
 */
export function getShotsByRole(edl: ShotEDL, role: string): Shot[] {
  return edl.shots.filter((s) => s.meta.narrativeRole === role);
}

/**
 * Get shots by semantic type.
 */
export function getShotsByType(edl: ShotEDL, type: string): Shot[] {
  return edl.shots.filter((s) => s.meta.semanticType === type);
}

/**
 * Get all effects across all shots.
 */
export function getAllEffects(edl: ShotEDL): Array<{ shotId: string; effect: ShotEffect }> {
  const result: Array<{ shotId: string; effect: ShotEffect }> = [];
  for (const shot of edl.shots) {
    for (const fx of shot.effects) {
      result.push({ shotId: shot.id, effect: fx });
    }
  }
  return result;
}

/**
 * Count total effects in the EDL.
 */
export function countEffects(edl: ShotEDL): number {
  return edl.shots.reduce((sum, shot) => sum + shot.effects.length, 0);
}

// ── Transform ───────────────────────────────────────────────────────────────

/**
 * Renormalize shot start times so there are no gaps.
 * Useful after removing or reordering shots.
 */
export function renormalizeTimeline(edl: ShotEDL): void {
  const sorted = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
  let t = 0;
  for (const shot of sorted) {
    shot.timing.startTime = t;
    t += shot.timing.duration;
  }
  edl.meta.duration = t;
}

/**
 * Scale all shot durations by a factor.
 * Useful for "make it faster/slower".
 */
export function scaleDuration(edl: ShotEDL, factor: number): void {
  for (const shot of edl.shots) {
    shot.timing.duration *= factor;
    shot.source.outPoint = shot.source.inPoint + (shot.timing.duration * shot.timing.speed);
  }
  renormalizeTimeline(edl);
}

/**
 * Remove a shot by ID and close the gap.
 */
export function removeShot(edl: ShotEDL, shotId: string): void {
  edl.shots = edl.shots.filter((s) => s.id !== shotId);
  renormalizeTimeline(edl);
}

/**
 * Insert a shot at a specific position, shifting subsequent shots.
 */
export function insertShot(edl: ShotEDL, shot: Shot, atTime: number): void {
  shot.timing.startTime = atTime;
  edl.shots.push(shot);

  // Shift shots that come after
  const sorted = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
  let t = 0;
  for (const s of sorted) {
    if (s.timing.startTime >= atTime && s.id !== shot.id) {
      s.timing.startTime = t;
    }
    t = s.timing.startTime + s.timing.duration;
  }

  renormalizeTimeline(edl);
}

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * Serialize ShotEDL to JSON string.
 */
export function toJSON(edl: ShotEDL): string {
  return JSON.stringify(edl, null, 2);
}

/**
 * Deserialize ShotEDL from JSON string.
 */
export function fromJSON(json: string): ShotEDL {
  return JSON.parse(json);
}

/**
 * Clone a ShotEDL (deep copy).
 */
export function cloneEDL(edl: ShotEDL): ShotEDL {
  return JSON.parse(JSON.stringify(edl));
}
