import type {
  Clip as MonetClip,
  EffectBlock,
  MediaAsset,
  ProjectEDL as MonetEDL,
  Track as MonetTrack,
  TrackType,
} from "@monet/edl";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export type OpenReelTrackType = "video" | "audio" | "text" | "graphics";

export interface Project {
  timeline: {
    tracks: Track[];
    duration: number;
    markers: Marker[];
  };
  mediaLibrary: {
    items: MediaItem[];
  };
  settings: ProjectSettings;
  modifiedAt?: number;
}

export interface ProjectSettings {
  fps?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  monet?: {
    edl: MonetEDL;
    lastSyncedAt: number;
    syncVersion: number;
  };
  [key: string]: unknown;
}

export interface Marker {
  id: string;
  time: number;
  label?: string;
  type?: string;
}

export interface Track {
  id: string;
  type: OpenReelTrackType;
  clips: Clip[];
  transitions: Transition[];
  locked: boolean;
  hidden: boolean;
}

export interface Clip {
  id: string;
  mediaId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  meta?: Record<string, unknown>;
}

export interface Transition {
  id: string;
  fromClipId?: string;
  toClipId?: string;
  startTime?: number;
  duration?: number;
  type?: string;
  params?: Record<string, unknown>;
}

export interface MediaItem {
  id: string;
  src: string;
  duration: number;
  width?: number;
  height?: number;
  type: "video" | "audio" | "image";
  meta?: Record<string, unknown>;
}

export function convertEDLToProject(edl: MonetEDL): ActionResult<Project | null> {
  try {
    const validation = validateEDLForOpenReel(edl);

    if (!validation.success) {
      return validation;
    }

    const mediaItems = convertAssetsToMediaItems(edl);
    const tracks = edl.timeline.tracks.map(convertTrack);

    const project: Project = {
      timeline: {
        tracks,
        duration: calculateTimelineDuration(tracks),
        markers: edl.timeline.markers.map((marker: Marker) => ({
          id: marker.id,
          time: marker.time,
          label: marker.label,
          type: marker.type,
        })),
      },
      mediaLibrary: {
        items: mediaItems,
      },
      settings: {
        fps: edl.meta.fps,
        aspectRatio: edl.meta.aspectRatio,
        monet: {
          edl,
          lastSyncedAt: Date.now(),
          syncVersion: 1,
        },
      },
      modifiedAt: Date.now(),
    };

    return {
      success: true,
      data: project,
    };
  } catch (error) {
    console.error("[edl-to-openreel] convertEDLToProject failed", {
      error,
      edlId: edl?.id,
    });

    return {
      success: false,
      error: {
        code: "EDL_TO_OPENREEL_FAILED",
        message: "Failed to convert MonetEDL to OpenReel project",
      },
    };
  }
}

function validateEDLForOpenReel(edl: MonetEDL): ActionResult<null> {
  if (!edl || typeof edl !== "object") {
    return {
      success: false,
      error: {
        code: "INVALID_EDL",
        message: "EDL is required",
      },
    };
  }

  if (edl.version !== 1) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_EDL_VERSION",
        message: "Only MonetEDL version 1 is supported",
      },
    };
  }

  if (!edl.timeline || !Array.isArray(edl.timeline.tracks)) {
    return {
      success: false,
      error: {
        code: "INVALID_TIMELINE",
        message: "EDL timeline tracks are required",
      },
    };
  }

  for (const track of edl.timeline.tracks) {
    if (!track.id || !Array.isArray(track.clips)) {
      return {
        success: false,
        error: {
          code: "INVALID_TRACK",
          message: `Invalid track ${track.id || "unknown"}`,
        },
      };
    }

    for (const clip of track.clips) {
      if (!clip.id || !clip.mediaId) {
        return {
          success: false,
          error: {
            code: "INVALID_CLIP",
            message: `Invalid clip in track ${track.id}`,
          },
        };
      }

      if (
        !Number.isFinite(clip.startTime) ||
        !Number.isFinite(clip.duration) ||
        clip.duration <= 0
      ) {
        return {
          success: false,
          error: {
            code: "INVALID_CLIP_TIMING",
            message: `Clip ${clip.id} has invalid timing`,
          },
        };
      }
    }
  }

  return {
    success: true,
    data: null,
  };
}

function convertAssetsToMediaItems(edl: MonetEDL): MediaItem[] {
  const items: MediaItem[] = [];

  for (const asset of Object.values(edl.assets.media)) {
    items.push(convertMediaAsset(asset));
  }

  for (const asset of Object.values(edl.assets.audio)) {
    items.push({
      id: asset.id,
      src: asset.path,
      duration: asset.duration,
      type: "audio",
      meta: {
        monetAssetType: "audio",
      },
    });
  }

  for (const asset of Object.values(edl.assets.overlays)) {
    items.push({
      id: asset.id,
      src: asset.path,
      duration: 0,
      type: asset.type === "image" ? "image" : "video",
      meta: {
        monetAssetType: "overlay",
        overlayType: asset.type,
      },
    });
  }

  return items;
}

function convertMediaAsset(asset: MediaAsset): MediaItem {
  return {
    id: asset.id,
    src: asset.path,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    type: "video",
    meta: {
      monetAssetType: "media",
    },
  };
}

function convertTrack(track: MonetTrack): Track {
  return {
    id: track.id,
    type: mapTrackType(track.type),
    clips: track.clips.map((clip) => convertClip(track, clip)),
    transitions: extractTransitions(track),
    locked: track.locked,
    hidden: track.hidden,
  };
}

function mapTrackType(type: TrackType): OpenReelTrackType {
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  if (type === "text") return "text";

  return "graphics";
}

function convertClip(track: MonetTrack, clip: MonetClip): Clip {
  return {
    id: clip.id,
    mediaId: clip.mediaId,
    startTime: clip.startTime,
    duration: clip.duration,
    inPoint: clip.inPoint,
    outPoint: clip.outPoint,
    speed: clip.speed,
    meta: {
      ...(clip.meta ?? {}),
      monet: {
        trackId: track.id,
        trackType: track.type,
        effects: clip.effects,
        transforms: clip.transforms,
        audio: clip.audio,
        sourceClipId: clip.id,
      },
      effects: clip.effects,
      transforms: clip.transforms,
      audio: clip.audio,
    },
  };
}

function extractTransitions(track: MonetTrack): Transition[] {
  const transitions: Transition[] = [];

  for (const clip of track.clips) {
    for (const effect of clip.effects) {
      if (isTransitionEffect(effect)) {
        transitions.push({
          id: effect.id,
          fromClipId: clip.id,
          startTime: effect.start,
          duration: effect.duration,
          type: effect.type,
          params: effect.params,
        });
      }
    }
  }

  return transitions;
}

function isTransitionEffect(effect: EffectBlock): boolean {
  return effect.type === "gl_transition" || effect.type === "whip_transition";
}

function calculateTimelineDuration(tracks: Track[]): number {
  let maxDuration = 0;

  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;

      if (end > maxDuration) {
        maxDuration = end;
      }
    }
  }

  return Math.round(maxDuration * 1000) / 1000;
}
