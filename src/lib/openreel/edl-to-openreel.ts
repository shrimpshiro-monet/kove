import type { MonetEDL, Effect as MonetEffect } from "@/server/types/edl";

interface OpenReelMediaMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

interface OpenReelMediaItem {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  fileHandle: null;
  blob: null;
  metadata: OpenReelMediaMetadata;
  thumbnailUrl: string | null;
  waveformData: null;
  isPlaceholder?: boolean;
  originalUrl?: string;
}

interface OpenReelClip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  effects: Array<{
    id: string;
    type: string;
    enabled: boolean;
    params: Record<string, number>;
  }>;
  audioEffects: Array<{
    id: string;
    type: string;
    enabled: boolean;
    params: Record<string, number>;
  }>;
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
  speed?: number;
}

interface OpenReelProject {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  settings: {
    width: number;
    height: number;
    frameRate: number;
    sampleRate: number;
    channels: number;
  };
  mediaLibrary: {
    items: OpenReelMediaItem[];
  };
  timeline: {
    tracks: Array<{
      id: string;
      type: "video" | "audio" | "image" | "text" | "graphics";
      name: string;
      clips: OpenReelClip[];
      transitions: Array<{
        id: string;
        clipAId: string;
        clipBId: string;
        type: "crossfade" | "wipe" | "slide" | "zoom" | "push" | "dipToBlack" | "dipToWhite";
        duration: number;
        params: Record<string, unknown>;
      }>;
      locked: boolean;
      hidden: boolean;
      muted: boolean;
      solo: boolean;
    }>;
    subtitles: Array<{
      id: string;
      text: string;
      startTime: number;
      endTime: number;
      style?: {
        fontFamily: string;
        fontSize: number;
        color: string;
        backgroundColor: string;
        position: "top" | "center" | "bottom";
      };
    }>;
    duration: number;
    markers: Array<{ id: string; time: number; label: string; color: string }>;
    beatMarkers?: Array<{ time: number; strength: number; index: number; isDownbeat: boolean }>;
    beatAnalysis?: {
      bpm: number;
      confidence: number;
      sourceClipId?: string;
      analyzedAt: number;
    };
  };
}

function normalizeMonetPosition(value: number | undefined): number {
  if (typeof value !== "number") return 0.5;
  // Monet uses -1..1 while OpenReel defaults around 0.5 center.
  return Math.max(0, Math.min(1, 0.5 + value * 0.5));
}

function mapEffect(effect: MonetEffect, index: number): OpenReelClip["effects"][number] {
  switch (effect.type) {
    case "blur":
      return {
        id: `fx-${index}`,
        type: "blur",
        enabled: true,
        params: { radius: 10 + effect.intensity * 35 },
      };
    case "glow":
      return {
        id: `fx-${index}`,
        type: "glow",
        enabled: true,
        params: { intensity: effect.intensity * 2, radius: 8 + effect.intensity * 18 },
      };
    case "brightness":
      return {
        id: `fx-${index}`,
        type: "brightness",
        enabled: true,
        params: { value: (effect.intensity - 0.5) * 100 },
      };
    case "contrast":
      return {
        id: `fx-${index}`,
        type: "contrast",
        enabled: true,
        params: { value: (effect.intensity - 0.5) * 100 },
      };
    case "saturation":
      return {
        id: `fx-${index}`,
        type: "saturation",
        enabled: true,
        params: { value: (effect.intensity - 0.5) * 100 },
      };
    case "shake":
      return {
        id: `fx-${index}`,
        type: "motion-blur",
        enabled: true,
        params: { amount: Math.max(0.1, effect.intensity) },
      };
    case "zoom_pulse":
      return {
        id: `fx-${index}`,
        type: "brightness",
        enabled: true,
        params: { value: effect.intensity * 20 },
      };
    default:
      return {
        id: `fx-${index}`,
        type: "contrast",
        enabled: true,
        params: { value: 0 },
      };
  }
}

function createVideoMediaItem(
  clipId: string,
  duration: number,
  sourceUrl?: string,
  frameRate = 30,
  width = 1920,
  height = 1080
): OpenReelMediaItem {
  return {
    id: clipId,
    name: clipId,
    type: "video",
    fileHandle: null,
    blob: null,
    metadata: {
      duration,
      width,
      height,
      frameRate,
      codec: "h264",
      sampleRate: 48000,
      channels: 2,
      fileSize: 0,
    },
    thumbnailUrl: null,
    waveformData: null,
    isPlaceholder: !sourceUrl,
    originalUrl: sourceUrl,
  };
}

export function convertMonetEDLToOpenReelProject(
  edl: MonetEDL,
  options?: {
    projectId?: string;
    projectName?: string;
    mediaUrlMap?: Map<string, string>;
  }
): OpenReelProject {
  const now = Date.now();
  const projectId = options?.projectId ?? `monet-openreel-${now}`;
  const projectName = options?.projectName ?? (edl.metadata.title || "Monet Edit");
  const frameRate = edl.timeline.fps || 30;
  const width = edl.timeline.resolution.width || 1920;
  const height = edl.timeline.resolution.height || 1080;

  const perClipDuration = new Map<string, number>();
  for (const shot of edl.shots) {
    const prev = perClipDuration.get(shot.source.clipId) ?? 0;
    perClipDuration.set(shot.source.clipId, Math.max(prev, shot.source.outPoint));
  }

  const mediaItems: OpenReelMediaItem[] = Array.from(perClipDuration.entries()).map(([clipId, duration]) =>
    createVideoMediaItem(clipId, duration || edl.timeline.duration, options?.mediaUrlMap?.get(clipId), frameRate, width, height)
  );

  if (edl.music?.sourceId) {
    const musicSourceUrl = options?.mediaUrlMap?.get(edl.music.sourceId);
    mediaItems.push({
      id: edl.music.sourceId,
      name: edl.music.sourceId,
      type: "audio",
      fileHandle: null,
      blob: null,
      metadata: {
        duration: edl.timeline.duration,
        width: 0,
        height: 0,
        frameRate: 0,
        codec: "aac",
        sampleRate: 48000,
        channels: 2,
        fileSize: 0,
      },
      thumbnailUrl: null,
      waveformData: null,
      isPlaceholder: !musicSourceUrl,
      originalUrl: musicSourceUrl,
    });
  }

  const videoTrackId = "video-1";
  const audioTrackId = "audio-1";

  const videoClips: OpenReelClip[] = edl.shots.map((shot, index) => ({
    id: shot.id,
    mediaId: shot.source.clipId,
    trackId: videoTrackId,
    startTime: shot.timing.startTime,
    duration: shot.timing.duration,
    inPoint: shot.source.inPoint,
    outPoint: shot.source.outPoint,
    effects: (shot.effects ?? []).map((effect, fxIndex) => mapEffect(effect, fxIndex + index * 10)),
    audioEffects: [],
    transform: {
      position: {
        x: normalizeMonetPosition(shot.transform?.position?.x),
        y: normalizeMonetPosition(shot.transform?.position?.y),
      },
      scale: {
        x: shot.transform?.scale ?? 1,
        y: shot.transform?.scale ?? 1,
      },
      rotation: shot.transform?.rotation ?? 0,
      anchor: { x: 0.5, y: 0.5 },
      opacity: 1,
    },
    volume: 1,
    keyframes: [],
    speed: shot.timing.speed,
  }));

  const transitions = edl.shots
    .map((shot, index) => {
      if (index === 0) return null;
      const prev = edl.shots[index - 1];
      const transition = shot.transition;
      if (!transition || transition.type === "cut") return null;

      return {
        id: `transition-${prev.id}-${shot.id}`,
        clipAId: prev.id,
        clipBId: shot.id,
        type: "crossfade" as const,
        duration: transition.duration,
        params: {
          easing: transition.easing ?? "linear",
        },
      };
    })
    .filter((value): value is NonNullable<typeof value> => !!value);

  const markers = edl.shots.map((shot, index) => ({
    id: `marker-${shot.id}`,
    time: shot.timing.startTime,
    label: `#${index + 1} ${shot.aiRationale ? shot.aiRationale.slice(0, 28) : shot.source.clipId}`,
    color: shot.beatLock ? "#22c55e" : "#60a5fa",
  }));

  const subtitles = (edl.textOverlays ?? []).map((overlay) => ({
    id: overlay.id,
    text: overlay.text,
    startTime: overlay.startTime,
    endTime: overlay.endTime,
    style: {
      fontFamily: "Inter",
      fontSize: overlay.style?.fontSize ?? 48,
      color: overlay.style?.color ?? "#ffffff",
      backgroundColor: "transparent",
      position: "center" as const,
    },
  }));

  const audioClips: OpenReelClip[] = edl.music?.sourceId
    ? [
        {
          id: "music-main",
          mediaId: edl.music.sourceId,
          trackId: audioTrackId,
          startTime: 0,
          duration: edl.timeline.duration,
          inPoint: 0,
          outPoint: edl.timeline.duration,
          effects: [],
          audioEffects: [],
          transform: {
            position: { x: 0.5, y: 0.5 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 },
            opacity: 1,
          },
          volume: edl.music.volume,
          keyframes: [],
        },
      ]
    : [];

  return {
    id: projectId,
    name: projectName,
    createdAt: now,
    modifiedAt: now,
    settings: {
      width,
      height,
      frameRate,
      sampleRate: 48000,
      channels: 2,
    },
    mediaLibrary: {
      items: mediaItems,
    },
    timeline: {
      tracks: [
        {
          id: videoTrackId,
          type: "video",
          name: "Monet Video",
          clips: videoClips,
          transitions,
          locked: false,
          hidden: false,
          muted: false,
          solo: false,
        },
        {
          id: audioTrackId,
          type: "audio",
          name: "Monet Music",
          clips: audioClips,
          transitions: [],
          locked: false,
          hidden: false,
          muted: false,
          solo: false,
        },
      ],
      subtitles,
      duration: edl.timeline.duration,
      markers,
      beatMarkers: edl.music?.beatGrid?.map((time, index) => ({
        time,
        strength: index % 4 === 0 ? 1 : 0.65,
        index,
        isDownbeat: index % 4 === 0,
      })),
      beatAnalysis: edl.music
        ? {
            bpm: edl.music.bpm,
            confidence: 0.9,
            sourceClipId: edl.music.sourceId,
            analyzedAt: now,
          }
        : undefined,
    },
  };
}
