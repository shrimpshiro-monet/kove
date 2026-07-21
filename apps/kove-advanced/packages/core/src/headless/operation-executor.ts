/**
 * Headless operation executor — converts OperationPlan JSON into a
 * Jalebi Advanced project that can be rendered without UI interaction.
 *
 * This is the programmatic bridge between the intent compiler's
 * OperationPlan and the kove-core engine's Project type.
 */

import type { OperationPlan, Operation } from "@monet/intent-compiler";
import type {
  Project,
  MediaItem,
  MediaMetadata,
} from "../types/project";
import type {
  Timeline,
  Track,
  Clip,
  Effect,
  Transform,
  Transition,
} from "../types/timeline";

export interface HeadlessMediaInput {
  readonly id: string;
  readonly name: string;
  readonly type: "video" | "audio" | "image";
  readonly blob: Blob | null;
  readonly metadata: {
    readonly duration: number;
    readonly width: number;
    readonly height: number;
    readonly frameRate?: number;
    readonly codec?: string;
    readonly sampleRate?: number;
    readonly channels?: number;
    readonly fileSize?: number;
  };
}

export type HeadlessProject = Project;

function generateId(prefix = "h"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTransform(): Transform {
  return {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
  };
}

function defaultEffectParams(): Effect[] {
  return [];
}

function createClip(
  trackId: string,
  mediaId: string,
  startTime: number,
  duration: number,
  inPoint: number,
  outPoint: number,
): Clip {
  return {
    id: generateId("clip"),
    mediaId,
    trackId,
    startTime,
    duration,
    inPoint,
    outPoint,
    effects: defaultEffectParams(),
    audioEffects: [],
    transform: defaultTransform(),
    volume: 1,
    keyframes: [],
    speed: 1,
  };
}

function resolveMediaType(
  inputType: HeadlessMediaInput["type"],
): MediaItem["type"] {
  if (inputType === "image") return "image";
  if (inputType === "audio") return "audio";
  return "video";
}

function toMediaMetadata(
  input: HeadlessMediaInput["metadata"],
): MediaMetadata {
  return {
    duration: input.duration,
    width: input.width,
    height: input.height,
    frameRate: input.frameRate ?? 30,
    codec: input.codec ?? "unknown",
    sampleRate: input.sampleRate ?? 44100,
    channels: input.channels ?? 2,
    fileSize: input.fileSize ?? 0,
  };
}

function toMediaItem(input: HeadlessMediaInput): MediaItem {
  return {
    id: input.id,
    name: input.name,
    type: resolveMediaType(input.type),
    fileHandle: null,
    blob: input.blob,
    metadata: toMediaMetadata(input.metadata),
    thumbnailUrl: null,
    waveformData: null,
  };
}

function findOrCreateTrack(
  tracks: Track[],
  trackIndex: number,
  trackType: Track["type"],
): Track {
  const trackId = `track-${trackIndex}`;
  let track = tracks.find((t) => t.id === trackId);
  if (!track) {
    track = {
      id: trackId,
      type: trackType,
      name: `Track ${trackIndex}`,
      clips: [],
      transitions: [],
      locked: false,
      hidden: false,
      muted: false,
      solo: false,
    };
    tracks.push(track);
  }
  return track;
}

function applyPlaceClip(
  tracks: Track[],
  op: Extract<Operation, { type: "place_clip" }>,
  mediaMap: Map<string, HeadlessMediaInput>,
): void {
  const mediaItem = mediaMap.get(op.clip_id);
  const trackType: Track["type"] =
    mediaItem?.type === "audio" ? "audio" : "video";
  const track = findOrCreateTrack(tracks, op.track, trackType);

  track.clips.push(
    createClip(track.id, op.clip_id, op.start_s, op.duration_s, op.in_point_s, op.out_point_s),
  );
}

function applySpeed(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_speed" }>,
): void {
  for (const track of tracks) {
    for (const clip of track.clips) {
      const matchesTarget =
        (op.target === "clip" && op.clip_id && clip.mediaId === op.clip_id) ||
        (op.target === "segment" && op.segment_index !== undefined);

      if (!matchesTarget) continue;

      const keyframes = op.curve.keyframes;
      if (keyframes.length === 0) continue;

      const avgSpeed =
        keyframes.reduce((sum, kf) => sum + kf.speed, 0) / keyframes.length;
      clip.speed = avgSpeed;
    }
  }
}

function applyTransition(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_transition" }>,
): void {
  const [trackIdxA, trackIdxB] = op.between;
  const trackA = tracks.find((t) => t.id === `track-${trackIdxA}`);
  const trackB = tracks.find((t) => t.id === `track-${trackIdxB}`);

  const clipsA = trackA?.clips ?? [];
  const clipsB = trackB?.clips ?? clipsA;

  if (clipsA.length === 0) return;

  const clipA = clipsA[clipsA.length - 1];
  const clipB = clipsB.find(
    (c) => Math.abs(c.startTime - (clipA.startTime + clipA.duration)) < 0.01,
  );

  if (!clipA || !clipB) return;

  const transitionTypeMap: Record<string, Transition["type"]> = {
    crossfade: "crossfade",
    wipe: "wipe",
    dissolve: "crossfade",
    hard: "cut",
  };

  const transition: Transition = {
    id: generateId("transition"),
    clipAId: clipA.id,
    clipBId: clipB.id,
    type: transitionTypeMap[op.transition_type] ?? "crossfade",
    duration: op.duration_s,
    params: {},
  };

  const targetTrack = trackA ?? findOrCreateTrack(tracks, trackIdxA, "video");
  targetTrack.transitions.push(transition);
}

function applyEffect(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_effect" }>,
): void {
  const effect: Effect = {
    id: generateId("fx"),
    type: op.effect.type,
    params: { intensity: op.effect.intensity, ...op.effect },
    enabled: true,
  };

  for (const track of tracks) {
    for (const clip of track.clips) {
      const matchesTarget =
        (op.target === "clip" && clip.mediaId) ||
        (op.target === "segment");

      if (!matchesTarget) continue;

      clip.effects.push(effect);
    }
  }
}

function applyColor(
  tracks: Track[],
  op: Extract<Operation, { type: "apply_color" }>,
): void {
  if (op.target === "global") {
    return;
  }

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (op.clip_id && clip.mediaId !== op.clip_id) continue;

      const colorEffect: Effect = {
        id: generateId("color"),
        type: "color",
        params: { ...op.params },
        enabled: true,
      };
      clip.effects.push(colorEffect);
    }
  }
}

function applyOperation(
  tracks: Track[],
  operation: Operation,
  mediaMap: Map<string, HeadlessMediaInput>,
): void {
  switch (operation.type) {
    case "place_clip":
      applyPlaceClip(tracks, operation, mediaMap);
      break;
    case "apply_speed":
      applySpeed(tracks, operation);
      break;
    case "apply_transition":
      applyTransition(tracks, operation);
      break;
    case "apply_effect":
      applyEffect(tracks, operation);
      break;
    case "apply_color":
      applyColor(tracks, operation);
      break;
  }
}

export function executePlan(
  plan: OperationPlan,
  media: HeadlessMediaInput[],
): HeadlessProject {
  const mediaMap = new Map(media.map((m) => [m.id, m]));
  const tracks: Track[] = [];

  for (const op of plan.operations) {
    applyOperation(tracks, op, mediaMap);
  }

  const timeline: Timeline = {
    tracks,
    subtitles: [],
    duration: plan.target_duration_s,
    markers: [],
  };

  const mediaLibrary = {
    items: media.map(toMediaItem),
  };

  const aspectParts = plan.aspect_ratio.split(":");
  const aspectW = Number(aspectParts[0]) || 16;
  const aspectH = Number(aspectParts[1]) || 9;
  const baseHeight = 1080;
  const width = Math.round((baseHeight * aspectW) / aspectH);

  return {
    id: generateId("project"),
    name: "Headless Export",
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    settings: {
      width,
      height: baseHeight,
      frameRate: 30,
      sampleRate: 44100,
      channels: 2,
    },
    mediaLibrary,
    timeline,
  };
}
