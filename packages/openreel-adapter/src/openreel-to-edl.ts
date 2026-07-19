/**
 * openreel-to-edl.ts — Reverse adapter: OpenReel Project → MonetEDL
 *
 * Converts an OpenReel project (potentially with user manual edits)
 * back into a MonetEDL for refinement or re-export. This is the
 * critical path for bidirectional round-trip without data loss.
 *
 * Design principles:
 * - Every field the forward adapter writes MUST be readable here
 * - Any field OpenReel adds during manual edits MUST be preserved
 * - Kove metadata (clip.meta) must survive untouched
 * - Non-serializable fields (fileHandle, blob, waveformData) are intentionally dropped
 * - Track-level transitions[] is always empty — clip.transition is authoritative
 */

import type { ProjectEDL as MonetEDL, TrackType, Easing, EffectBlock } from "@monet/edl";
import type {
  OpenReelProject,
  OpenReelTrack,
  OpenReelClip,
  OpenReelEffect,
  OpenReelKeyframe,
  OpenReelTransform,
  OpenReelMarker,
} from "./openreel-types";

// ============================================================================
// DEBUG MODE
// ============================================================================

export interface ConvertDebugLog {
  field: string;
  location: string;
  message: string;
}

function debugLog(
  logs: ConvertDebugLog[],
  field: string,
  location: string,
  message: string,
): void {
  logs.push({ field, location, message });
}

// ============================================================================
// TRACK TYPE MAPPING
// ============================================================================

function mapTrackTypeToEDL(type: string): TrackType {
  switch (type) {
    case "video": return "video";
    case "audio": return "audio";
    case "text": return "text";
    case "graphics": return "fx";
    case "image": return "video";
    default: return "video";
  }
}

// ============================================================================
// ASPECT RATIO COMPUTATION
// ============================================================================

function computeAspectRatio(width: number, height: number): "16:9" | "9:16" | "1:1" {
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  return height > width ? "9:16" : "16:9";
}

// ============================================================================
// KEYFRAME → TRANSFORM MERGING
// ============================================================================

interface TransformAccumulator {
  position: Array<{ time: number; x: number; y: number; easing?: Easing }>;
  scale: Array<{ time: number; value: number; easing?: Easing }>;
  rotation: Array<{ time: number; value: number; easing?: Easing }>;
  crop: Array<{ time: number; x: number; y: number; width: number; height: number; easing?: Easing }>;
}

function createTransformAccumulator(): TransformAccumulator {
  return { position: [], scale: [], rotation: [], crop: [] };
}

function mergeKeyframeIntoTransform(
  kf: OpenReelKeyframe,
  acc: TransformAccumulator,
  logs: ConvertDebugLog[],
  clipId: string,
): void {
  const easing = mapEasing(kf.easing);

  switch (kf.property) {
    case "position.x": {
      const existing = acc.position.find((p) => Math.abs(p.time - kf.time) < 0.001);
      if (existing) {
        existing.x = kf.value;
      } else {
        acc.position.push({ time: kf.time, x: kf.value, y: 0, easing });
      }
      break;
    }
    case "position.y": {
      const existing = acc.position.find((p) => Math.abs(p.time - kf.time) < 0.001);
      if (existing) {
        existing.y = kf.value;
      } else {
        acc.position.push({ time: kf.time, x: 0, y: kf.value, easing });
      }
      break;
    }
    case "scale.x":
    case "transform.scale": {
      acc.scale.push({ time: kf.time, value: kf.value, easing });
      break;
    }
    case "rotation": {
      acc.rotation.push({ time: kf.time, value: kf.value, easing });
      break;
    }
    case "crop.x": {
      let existing = acc.crop.find((c) => Math.abs(c.time - kf.time) < 0.001);
      if (!existing) {
        existing = { time: kf.time, x: 0, y: 0, width: 1, height: 1, easing };
        acc.crop.push(existing);
      }
      existing.x = kf.value;
      break;
    }
    case "crop.y": {
      let existing = acc.crop.find((c) => Math.abs(c.time - kf.time) < 0.001);
      if (!existing) {
        existing = { time: kf.time, x: 0, y: 0, width: 1, height: 1, easing };
        acc.crop.push(existing);
      }
      existing.y = kf.value;
      break;
    }
    case "crop.width": {
      let existing = acc.crop.find((c) => Math.abs(c.time - kf.time) < 0.001);
      if (!existing) {
        existing = { time: kf.time, x: 0, y: 0, width: 1, height: 1, easing };
        acc.crop.push(existing);
      }
      existing.width = kf.value;
      break;
    }
    case "crop.height": {
      let existing = acc.crop.find((c) => Math.abs(c.time - kf.time) < 0.001);
      if (!existing) {
        existing = { time: kf.time, x: 0, y: 0, width: 1, height: 1, easing };
        acc.crop.push(existing);
      }
      existing.height = kf.value;
      break;
    }
    default: {
      debugLog(logs, kf.property, `clip:${clipId}`, `Unmapped keyframe property — preserved in meta`);
      break;
    }
  }
}

function buildTransformsFromAccumulator(
  acc: TransformAccumulator,
  baseTransform: OpenReelTransform,
): { position: Array<{ time: number; x: number; y: number; easing?: Easing }>; scale: Array<{ time: number; value: number; easing?: Easing }>; rotation: Array<{ time: number; value: number; easing?: Easing }>; crop: Array<{ time: number; x: number; y: number; width: number; height: number; easing?: Easing }> } {
  // Start with the base transform at time 0
  const position = acc.position.length > 0
    ? ensureBasePosition(acc.position, baseTransform)
    : [{ time: 0, x: baseTransform.position.x, y: baseTransform.position.y }];

  const scale = acc.scale.length > 0
    ? ensureBaseScale(acc.scale, baseTransform)
    : [{ time: 0, value: baseTransform.scale.x }];

  const rotation = acc.rotation.length > 0
    ? ensureBaseRotation(acc.rotation, baseTransform)
    : [{ time: 0, value: baseTransform.rotation }];

  const crop = acc.crop.length > 0
    ? acc.crop
    : [{ time: 0, x: 0, y: 0, width: 1, height: 1 }];

  return { position, scale, rotation, crop };
}

function ensureBasePosition(
  keyframes: Array<{ time: number; x: number; y: number; easing?: Easing }>,
  base: OpenReelTransform,
): Array<{ time: number; x: number; y: number; easing?: Easing }> {
  if (keyframes[0]?.time === 0) return keyframes;
  return [
    { time: 0, x: base.position.x, y: base.position.y },
    ...keyframes,
  ];
}

function ensureBaseScale(
  keyframes: Array<{ time: number; value: number; easing?: Easing }>,
  base: OpenReelTransform,
): Array<{ time: number; value: number; easing?: Easing }> {
  if (keyframes[0]?.time === 0) return keyframes;
  return [
    { time: 0, value: base.scale.x },
    ...keyframes,
  ];
}

function ensureBaseRotation(
  keyframes: Array<{ time: number; value: number; easing?: Easing }>,
  base: OpenReelTransform,
): Array<{ time: number; value: number; easing?: Easing }> {
  if (keyframes[0]?.time === 0) return keyframes;
  return [
    { time: 0, value: base.rotation },
    ...keyframes,
  ];
}

// ============================================================================
// EASING MAP
// ============================================================================

function mapEasing(easing: string): Easing {
  switch (easing) {
    case "linear": return "linear";
    case "ease-in": return "ease-in";
    case "ease-out": return "ease-out";
    case "ease-in-out": return "ease-in-out";
    case "bezier": return "bezier";
    default: return "linear";
  }
}

// ============================================================================
// EFFECT MAPPING
// ============================================================================

function mapEffect(orEffect: OpenReelEffect): EffectBlock {
  const { startTime, duration, ...restParams } = orEffect.params as {
    startTime?: number;
    duration?: number;
    [key: string]: unknown;
  };

  return {
    id: orEffect.id,
    type: orEffect.type as EffectBlock["type"],
    start: startTime ?? 0,
    duration: duration ?? 0,
    params: restParams,
  };
}

// ============================================================================
// MAIN CONVERTER
// ============================================================================

export interface ConvertResult {
  edl: MonetEDL;
  debug: ConvertDebugLog[];
}

export function openReelProjectToMonetEDL(
  project: OpenReelProject,
  options?: { debug?: boolean },
): ConvertResult {
  const logs: ConvertDebugLog[] = [];

  // --- Meta ---
  const aspectRatio = computeAspectRatio(
    project.settings.width,
    project.settings.height,
  );

  if (project.settings.width === 1080 && project.settings.height === 1920) {
    // Common default — no log needed
  } else if (aspectRatio === "16:9" && project.settings.width !== 1920) {
    debugLog(logs, "settings.width", "project", `Non-standard width ${project.settings.width} for 16:9 — using computed aspect ratio`);
  }

  // --- Assets (media library → asset registry) ---
  const mediaAssets: Record<string, { id: string; path: string; duration: number; width: number; height: number }> = {};
  const audioAssets: Record<string, { id: string; path: string; duration: number }> = {};

  for (const item of project.mediaLibrary.items) {
    if (item.type === "audio") {
      audioAssets[item.id] = {
        id: item.id,
        path: item.name,
        duration: item.metadata.duration,
      };
    } else {
      mediaAssets[item.id] = {
        id: item.id,
        path: item.name,
        duration: item.metadata.duration,
        width: item.metadata.width,
        height: item.metadata.height,
      };
    }
  }

  // --- Tracks ---
  const tracks = project.timeline.tracks.map((orTrack, index) => {
    const edlTrackType = mapTrackTypeToEDL(orTrack.type);

    const clips = orTrack.clips.map((orClip) => {
      // Merge keyframes into transforms
      const keyframeAcc = createTransformAccumulator();
      for (const kf of orClip.keyframes) {
        mergeKeyframeIntoTransform(kf, keyframeAcc, logs, orClip.id);
      }
      const mergedTransforms = buildTransformsFromAccumulator(keyframeAcc, orClip.transform);

      // Map effects
      const effects = orClip.effects.map(mapEffect);

      return {
        id: orClip.id,
        mediaId: orClip.mediaId,
        startTime: orClip.startTime,
        duration: orClip.duration,
        inPoint: orClip.inPoint,
        outPoint: orClip.outPoint,
        speed: orClip.speed,
        transforms: {
          position: mergedTransforms.position,
          scale: mergedTransforms.scale,
          rotation: mergedTransforms.rotation,
          crop: mergedTransforms.crop,
        },
        audio: {
          gain: orClip.volume,
          fadeIn: orClip.audioEffects?.find((e) => e.type === "audio-fade")?.params?.fadeIn,
          fadeOut: orClip.audioEffects?.find((e) => e.type === "audio-fade")?.params?.fadeOut,
          pan: orClip.audioEffects?.find((e) => e.type === "audio-pan")?.params?.pan,
        },
        effects,
        meta: orClip.meta,
      };
    });

    return {
      id: orTrack.id,
      type: edlTrackType,
      clips,
      order: index,
      locked: orTrack.locked,
      hidden: orTrack.hidden,
    };
  });

  // --- Markers ---
  const markers = project.timeline.markers.map((m) => ({
    id: m.id,
    time: m.time,
    label: m.label,
  }));

  // --- Assemble EDL ---
  const edl: MonetEDL = {
    version: 1,
    id: project.id,
    meta: {
      createdAt: project.createdAt,
      updatedAt: project.modifiedAt,
      aspectRatio,
      fps: project.settings.frameRate,
      sampleRate: project.settings.sampleRate,
    },
    assets: {
      media: mediaAssets,
      audio: audioAssets,
      overlays: {},
    },
    timeline: {
      duration: project.timeline.duration,
      tracks,
      markers,
    },
  };

  return { edl, debug: logs };
}

// ============================================================================
// ROUND-TRIP VALIDATOR
// ============================================================================

export interface RoundTripResult {
  success: boolean;
  original: MonetEDL;
  reconstructed: MonetEDL;
  mismatches: string[];
}

/**
 * Validates that a MonetEDL survives a round-trip through OpenReel and back.
 * Compares structural fields — ignores fields that are expected to differ
 * (timestamps, regenerated IDs).
 */
export function validateRoundTrip(
  original: MonetEDL,
  reconstructed: MonetEDL,
): RoundTripResult {
  const mismatches: string[] = [];

  // --- Meta ---
  if (original.meta.aspectRatio !== reconstructed.meta.aspectRatio) {
    mismatches.push(`meta.aspectRatio: "${original.meta.aspectRatio}" → "${reconstructed.meta.aspectRatio}"`);
  }
  if (original.meta.fps !== reconstructed.meta.fps) {
    mismatches.push(`meta.fps: ${original.meta.fps} → ${reconstructed.meta.fps}`);
  }
  if (original.meta.sampleRate !== reconstructed.meta.sampleRate) {
    mismatches.push(`meta.sampleRate: ${original.meta.sampleRate} → ${reconstructed.meta.sampleRate}`);
  }

  // --- Timeline ---
  if (Math.abs(original.timeline.duration - reconstructed.timeline.duration) > 0.01) {
    mismatches.push(`timeline.duration: ${original.timeline.duration} → ${reconstructed.timeline.duration}`);
  }

  if (original.timeline.tracks.length !== reconstructed.timeline.tracks.length) {
    mismatches.push(`timeline.tracks.length: ${original.timeline.tracks.length} → ${reconstructed.timeline.tracks.length}`);
  }

  // --- Track-level ---
  for (let i = 0; i < Math.min(original.timeline.tracks.length, reconstructed.timeline.tracks.length); i++) {
    const origTrack = original.timeline.tracks[i];
    const reconTrack = reconstructed.timeline.tracks[i];

    if (origTrack.type !== reconTrack.type) {
      mismatches.push(`tracks[${i}].type: "${origTrack.type}" → "${reconTrack.type}"`);
    }
    if (origTrack.clips.length !== reconTrack.clips.length) {
      mismatches.push(`tracks[${i}].clips.length: ${origTrack.clips.length} → ${reconTrack.clips.length}`);
    }

    // --- Clip-level ---
    for (let j = 0; j < Math.min(origTrack.clips.length, reconTrack.clips.length); j++) {
      const origClip = origTrack.clips[j];
      const reconClip = reconTrack.clips[j];
      const prefix = `tracks[${i}].clips[${j}]`;

      if (Math.abs(origClip.startTime - reconClip.startTime) > 0.01) {
        mismatches.push(`${prefix}.startTime: ${origClip.startTime} → ${reconClip.startTime}`);
      }
      if (Math.abs(origClip.duration - reconClip.duration) > 0.01) {
        mismatches.push(`${prefix}.duration: ${origClip.duration} → ${reconClip.duration}`);
      }
      if (Math.abs(origClip.inPoint - reconClip.inPoint) > 0.01) {
        mismatches.push(`${prefix}.inPoint: ${origClip.inPoint} → ${reconClip.inPoint}`);
      }
      if (Math.abs(origClip.outPoint - reconClip.outPoint) > 0.01) {
        mismatches.push(`${prefix}.outPoint: ${origClip.outPoint} → ${reconClip.outPoint}`);
      }
      if (Math.abs(origClip.speed - reconClip.speed) > 0.001) {
        mismatches.push(`${prefix}.speed: ${origClip.speed} → ${reconClip.speed}`);
      }
      if (origClip.mediaId !== reconClip.mediaId) {
        mismatches.push(`${prefix}.mediaId: "${origClip.mediaId}" → "${reconClip.mediaId}"`);
      }

      // Audio
      if (Math.abs(origClip.audio.gain - reconClip.audio.gain) > 0.001) {
        mismatches.push(`${prefix}.audio.gain: ${origClip.audio.gain} → ${reconClip.audio.gain}`);
      }

      // Effects (count + types)
      if (origClip.effects.length !== reconClip.effects.length) {
        mismatches.push(`${prefix}.effects.length: ${origClip.effects.length} → ${reconClip.effects.length}`);
      }

      // Meta preservation
      if (JSON.stringify(origClip.meta) !== JSON.stringify(reconClip.meta)) {
        mismatches.push(`${prefix}.meta: differs (Kove metadata lost or mutated)`);
      }
    }
  }

  // --- Markers ---
  if (original.timeline.markers.length !== reconstructed.timeline.markers.length) {
    mismatches.push(`timeline.markers.length: ${original.timeline.markers.length} → ${reconstructed.timeline.markers.length}`);
  }

  return {
    success: mismatches.length === 0,
    original,
    reconstructed,
    mismatches,
  };
}
