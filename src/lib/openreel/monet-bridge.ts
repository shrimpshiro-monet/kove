import type { MonetEDL, Shot } from "@/server/types/edl";
import { clipsOverlap, getGapBetweenClips } from "../../../openreel-video/packages/core/src/timeline/clip-manager";

type MutableBridgeClip = {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  effects: Array<{ id: string; type: string; params: Record<string, unknown>; enabled: boolean }>;
  audioEffects: Array<{ id: string; type: string; params: Record<string, unknown>; enabled: boolean }>;
  transform: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    anchor: { x: number; y: number };
    opacity: number;
  };
  volume: number;
  keyframes: Array<{
    id: string;
    time: number;
    property: string;
    value: unknown;
    easing: "linear";
  }>;
};

const OPENREEL_EDITING_ENABLED = import.meta.env.VITE_OPENREEL_EDITING !== "false";

export function shouldUseOpenReelEditing(): boolean {
  return OPENREEL_EDITING_ENABLED;
}

function shotToOpenReelClip(shot: Shot, _index: number): MutableBridgeClip {
  return {
    id: shot.id,
    mediaId: shot.source.clipId,
    trackId: "video-1",
    startTime: shot.timing.startTime,
    duration: shot.timing.duration,
    inPoint: shot.source.inPoint,
    outPoint: shot.source.outPoint,
    effects: [],
    audioEffects: [],
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
      opacity: 1,
    },
    volume: 1,
    keyframes: [],
  };
}

export function stabilizeMonetEDLWithOpenReel(edl: MonetEDL): MonetEDL {
  if (edl.shots.length <= 1) {
    return edl;
  }

  const ordered = [...edl.shots].sort(
    (a, b) => a.timing.startTime - b.timing.startTime
  );

  const clips = ordered.map((shot, idx) => shotToOpenReelClip(shot, idx));

  for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1];
    const current = clips[i];

    if (!clipsOverlap(prev, current)) {
      continue;
    }

    const overlap = Math.abs(getGapBetweenClips(prev, current));
    const prevEnd = prev.startTime + prev.duration;
    current.startTime = prevEnd;
    current.inPoint += overlap;
    current.outPoint = current.inPoint + current.duration;
  }

  let cursor = 0;
  const stabilizedShots = ordered.map((shot, index) => {
    const clip = clips[index];
    const safeDuration = Math.max(0.05, clip.duration);
    const stabilizedStart = Math.max(cursor, clip.startTime);
    cursor = stabilizedStart + safeDuration;

    return {
      ...shot,
      timing: {
        ...shot.timing,
        startTime: stabilizedStart,
        duration: safeDuration,
      },
      source: {
        ...shot.source,
        inPoint: clip.inPoint,
        outPoint: clip.inPoint + safeDuration,
      },
    };
  });

  return {
    ...edl,
    shots: stabilizedShots,
    timeline: {
      ...edl.timeline,
      duration: Math.max(
        0,
        stabilizedShots.reduce(
          (max, shot) => Math.max(max, shot.timing.startTime + shot.timing.duration),
          0
        )
      ),
    },
  };
}