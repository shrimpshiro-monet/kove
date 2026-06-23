import type { Clip, EffectBlock, MonetEDL, Track } from "@monet/edl/src/schemas";
import type { ActionResult, RenderDimensions } from "./timeline-types";

export function getFFmpegPath(): string {
  const value = process.env.FFMPEG_PATH;

  return value && value.trim().length > 0 ? value : "ffmpeg";
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function shellSafeLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/]/g, "\\]")
    .replace(/\n/g, " ");
}

export function getRenderDimensions(
  edl: MonetEDL,
  width?: number,
  height?: number
): ActionResult<RenderDimensions> {
  if (width !== undefined || height !== undefined) {
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return {
        success: false,
        error: {
          code: "INVALID_RENDER_DIMENSIONS",
          message: "width and height must both be positive finite numbers when provided"
        }
      };
    }

    return {
      success: true,
      data: {
        width: Math.round(width),
        height: Math.round(height)
      }
    };
  }

  if (edl.meta.aspectRatio === "9:16") {
    return {
      success: true,
      data: {
        width: 1080,
        height: 1920
      }
    };
  }

  if (edl.meta.aspectRatio === "1:1") {
    return {
      success: true,
      data: {
        width: 1080,
        height: 1080
      }
    };
  }

  return {
    success: true,
    data: {
      width: 1920,
      height: 1080
    }
  };
}

export function calculateTimelineDuration(edl: MonetEDL): number {
  let maxDuration = 0;

  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;

      if (end > maxDuration) {
        maxDuration = end;
      }
    }
  }

  return round3(maxDuration);
}

export function buildTrackMap(edl: MonetEDL): Map<string, Track> {
  const map = new Map<string, Track>();

  for (const track of edl.timeline.tracks) {
    map.set(track.id, track);
  }

  return map;
}

export function getVideoTracks(edl: MonetEDL): Track[] {
  return edl.timeline.tracks.filter((track) => track.type === "video");
}

export function getAudioTracks(edl: MonetEDL): Track[] {
  return edl.timeline.tracks.filter((track) => track.type === "audio");
}

export function getTextTracks(edl: MonetEDL): Track[] {
  return edl.timeline.tracks.filter((track) => track.type === "text");
}

export function getFxTracks(edl: MonetEDL): Track[] {
  return edl.timeline.tracks.filter((track) => track.type === "fx");
}

export function getClipEffectsByType(
  clip: Clip,
  type: EffectBlock["type"]
): EffectBlock[] {
  const effects = Array.isArray(clip.effects) ? clip.effects : [];

  return effects.filter((effect) => effect.type === type);
}

export function getNumberParam(
  params: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = params[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

export function getStringParam(
  params: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = params[key];

  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

export function assertValidEDL(edl: MonetEDL): ActionResult<null> {
  if (!edl || typeof edl !== "object") {
    return {
      success: false,
      error: {
        code: "INVALID_EDL",
        message: "EDL is required"
      }
    };
  }

  if (edl.version !== 1) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_EDL_VERSION",
        message: "Only MonetEDL version 1 is supported"
      }
    };
  }

  if (!edl.timeline || !Array.isArray(edl.timeline.tracks)) {
    return {
      success: false,
      error: {
        code: "INVALID_TIMELINE",
        message: "EDL timeline tracks are required"
      }
    };
  }

  const videoTracks = getVideoTracks(edl);

  if (videoTracks.length === 0) {
    return {
      success: false,
      error: {
        code: "VIDEO_TRACK_REQUIRED",
        message: "At least one video track is required to render"
      }
    };
  }

  const hasVideoClips = videoTracks.some((track) => track.clips.length > 0);

  if (!hasVideoClips) {
    return {
      success: false,
      error: {
        code: "VIDEO_CLIPS_REQUIRED",
        message: "At least one video clip is required to render"
      }
    };
  }

  return {
    success: true,
    data: null
  };
}

export function normalizeEvenDimension(value: number): number {
  const rounded = Math.round(value);

  return rounded % 2 === 0 ? rounded : rounded - 1;
}
