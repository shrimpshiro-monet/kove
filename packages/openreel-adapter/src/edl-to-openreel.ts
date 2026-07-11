/**
 * edl-to-openreel.ts — Bridge from MonetEDL to OpenReel Project
 *
 * Converts our AI-generated EDL into OpenReel's NLE Project format,
 * enabling the Director→Operator pipeline where AI decisions drive
 * a professional browser-based video editor.
 */

import type { ProjectEDL as MonetEDL } from "@monet/edl";
import type {
  OpenReelProject as Project,
  OpenReelTrack,
  OpenReelClip,
  OpenReelEffect,
  OpenReelTransform as Transform,
  OpenReelKeyframe as Keyframe,
  OpenReelTransition as Transition,
} from "./openreel-types";

const ASPECT_RATIO_MAP: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

const EASING_MAP: Record<string, string> = {
  "linear": "linear",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  "bezier": "ease-in-out",
};

function mapTransform(monetTransform: any): Transform {
  const pos = monetTransform.position?.[0] ?? { x: 0, y: 0 };
  const scale = monetTransform.scale?.[0] ?? { value: 1 };
  const rotation = monetTransform.rotation?.[0] ?? { value: 0 };

  return {
    position: { x: pos.x ?? 0, y: pos.y ?? 0 },
    scale: { x: scale.value ?? 1, y: scale.value ?? 1 },
    rotation: rotation.value ?? 0,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
  };
}

function mapKeyframes(monetKeyframes: any[], property: string): Keyframe[] {
  if (!monetKeyframes?.length) return [];
  return monetKeyframes.map((kf: any) => ({
    id: `kf-${property}-${kf.time}-${Math.random().toString(36).slice(2, 8)}`,
    time: kf.time,
    property,
    value: kf.value ?? kf.x ?? 0,
    easing: (EASING_MAP[kf.easing] ?? "linear") as any,
  }));
}

function mapEffect(monetEffect: any): OpenReelEffect {
  return {
    id: monetEffect.id,
    type: monetEffect.type,
    params: {
      ...monetEffect.params,
      startTime: monetEffect.start,
      duration: monetEffect.duration,
    },
    enabled: true,
  };
}

function mapClip(monetClip: any, trackId: string): OpenReelClip {
  const keyframes: Keyframe[] = [
    ...mapKeyframes(monetClip.transforms?.position, "position.x"),
    ...mapKeyframes(monetClip.transforms?.scale, "scale.x"),
    ...mapKeyframes(monetClip.transforms?.rotation, "rotation"),
  ];

  return {
    id: monetClip.id,
    mediaId: monetClip.mediaId,
    trackId,
    startTime: monetClip.startTime,
    duration: monetClip.duration,
    inPoint: monetClip.inPoint,
    outPoint: monetClip.outPoint,
    effects: (monetClip.effects ?? []).map(mapEffect),
    audioEffects: [],
    transform: mapTransform(monetClip.transforms),
    volume: monetClip.audio?.gain ?? 1,
    keyframes,
    speed: monetClip.speed ?? 1,
    meta: monetClip.meta,
  };
}

function mapTrack(monetTrack: any): OpenReelTrack {
  const orType = mapTrackType(monetTrack.type);

  return {
    id: monetTrack.id,
    type: orType,
    name: `${orType} ${monetTrack.id}`,
    clips: monetTrack.clips.map((c: any) => mapClip(c, monetTrack.id)),
    transitions: [],
    locked: monetTrack.locked ?? false,
    hidden: monetTrack.hidden ?? false,
    muted: false,
    solo: false,
  };
}

function mapTrackType(type: string): "video" | "audio" | "image" | "text" | "graphics" {
  switch (type) {
    case "video": return "video";
    case "audio": return "audio";
    case "text": return "text";
    case "fx": return "graphics";
    case "mask": return "graphics";
    default: return "video";
  }
}

export function convertEDLToOpenReelProject(
  edl: MonetEDL,
  mediaItems: Array<{ id: string; name: string; type: "video" | "audio" | "image"; duration: number; width: number; height: number }> = [],
): Project {
  const ar = ASPECT_RATIO_MAP[edl.meta.aspectRatio] ?? ASPECT_RATIO_MAP["16:9"];

  return {
    version: 1,
    id: edl.id,
    name: `AI Edit — ${edl.id}`,
    createdAt: edl.meta.createdAt,
    modifiedAt: edl.meta.updatedAt,
    settings: {
      width: ar.width,
      height: ar.height,
      frameRate: edl.meta.fps,
      sampleRate: edl.meta.sampleRate,
      channels: 2,
    },
    mediaLibrary: {
      items: mediaItems.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        fileHandle: null,
        blob: null,
        metadata: {
          duration: m.duration,
          width: m.width,
          height: m.height,
          frameRate: edl.meta.fps,
          codec: "h264",
          sampleRate: edl.meta.sampleRate,
          channels: 2,
          fileSize: 0,
        },
        thumbnailUrl: null,
        waveformData: null,
      })),
    },
    timeline: {
      tracks: edl.timeline.tracks.map(mapTrack),
      subtitles: [],
      duration: edl.timeline.duration,
      markers: (edl.timeline.markers ?? []).map((m) => ({
        id: m.id,
        time: m.time,
        label: m.label ?? m.type ?? "marker",
        color: "#FF6B6B",
      })),
    },
  };
}
