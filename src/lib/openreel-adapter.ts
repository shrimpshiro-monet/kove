/**
 * Monet <-> OpenReel Adapter
 *
 * ARCHITECTURAL MANDATE:
 * This is the only public Monet-side adapter allowed to translate MonetEDL
 * into an OpenReel-compatible editing/rendering project.
 *
 * This file does not modify OpenReel internals.
 * It creates an OpenReel-compatible project model and provides a real Canvas2D
 * preview renderer so Monet can actually preview edits before deeper engine
 * integration.
 */

import type { MonetEDL } from "../server/types/edl";

export type AdapterResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };

export type OpenReelTrackType = "video" | "audio" | "text" | "graphics";

export interface OpenReelCompatibleProject {
  id: string;
  timeline: {
    tracks: OpenReelTrack[];
    duration: number;
    markers: OpenReelMarker[];
  };
  mediaLibrary: {
    items: OpenReelMediaItem[];
  };
  settings: OpenReelProjectSettings;
  metadata: {
    source: "monet-edl";
    monetVersion: string;
    title: string;
    createdAt: number;
  };
}

export interface OpenReelTrack {
  id: string;
  type: OpenReelTrackType;
  clips: OpenReelClip[];
  transitions: OpenReelTransition[];
  locked: boolean;
  hidden: boolean;
}

export interface OpenReelClip {
  id: string;
  mediaId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  meta: Record<string, unknown>;
}

export interface OpenReelTransition {
  id: string;
  type: "cut" | "crossfade";
  fromClipId: string;
  toClipId: string;
  startTime: number;
  duration: number;
  meta: Record<string, unknown>;
}

export interface OpenReelMarker {
  id: string;
  time: number;
  type: "beat" | "cut" | "climax" | "note";
  label: string;
  meta: Record<string, unknown>;
}

export interface OpenReelMediaItem {
  id: string;
  type: "video" | "audio" | "text" | "graphics";
  src: string;
  name: string;
  duration?: number;
  mimeType?: string;
  meta: Record<string, unknown>;
}

export interface OpenReelProjectSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
}

export interface RenderFrameOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

type MonetShot = MonetEDL["shots"][number];

interface ActiveClipLookup {
  clip: OpenReelClip;
  track: OpenReelTrack;
}

interface LoadedVideo {
  mediaId: string;
  src: string;
  element: HTMLVideoElement;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;
const DEFAULT_BACKGROUND = "#000000";

const videoCache = new Map<string, LoadedVideo>();

export const openReelAdapter = {
  createProject,
  renderFrame,
  convertEDLToOpenReelProject,
  calculateTimelineDuration,
};

/**
 * Create an OpenReel-compatible project from MonetEDL.
 */
export async function createProject(
  edl: MonetEDL
): Promise<AdapterResult<OpenReelCompatibleProject>> {
  try {
    const validation = validateEDLForAdapter(edl);
    if (!validation.success) {
      return validation;
    }

    const project = convertEDLToOpenReelProject(edl);

    return {
      success: true,
      data: project,
    };
  } catch (error) {
    console.error("[openreel-adapter] Failed to create project", {
      operation: "createProject",
      error,
    });

    return {
      success: false,
      error: {
        code: "OPENREEL_PROJECT_CREATE_FAILED",
        message: "Failed to create OpenReel project from MonetEDL",
      },
    };
  }
}

/**
 * Convert MonetEDL into a stable OpenReel-compatible project model.
 */
export function convertEDLToOpenReelProject(
  edl: MonetEDL
): OpenReelCompatibleProject {
  const settings = buildProjectSettings(edl);
  const mediaItems = buildMediaLibrary(edl);
  const videoTrack = buildVideoTrack(edl);
  const audioTrack = buildAudioTrack(edl);
  const textTrack = buildTextTrack(edl);
  const graphicsTrack = buildGraphicsTrack(edl);

  const tracks = [videoTrack, audioTrack, textTrack, graphicsTrack].filter(
    (track) => track.clips.length > 0 || track.type === "video"
  );

  const duration = Math.max(
    edl.timeline.duration,
    calculateTracksDuration(tracks)
  );

  return {
    id: `openreel-${crypto.randomUUID()}`,
    timeline: {
      tracks,
      duration,
      markers: buildMarkers(edl),
    },
    mediaLibrary: {
      items: mediaItems,
    },
    settings,
    metadata: {
      source: "monet-edl",
      monetVersion: edl.version,
      title: edl.metadata?.title ?? "Untitled Monet Edit",
      createdAt: Date.now(),
    },
  };
}

/**
 * Render a frame from an OpenReel-compatible project using Canvas2D.
 *
 * This is a real MVP preview path:
 * - finds active clip at time
 * - loads /api/media/{mediaId}
 * - seeks to source time
 * - draws video frame to canvas
 * - overlays simple text/graphics metadata when available
 * - returns ImageBitmap
 */
export async function renderFrame(
  project: OpenReelCompatibleProject,
  time: number,
  options: RenderFrameOptions = {}
): Promise<AdapterResult<ImageBitmap>> {
  try {
    if (!isBrowserRuntime()) {
      return {
        success: false,
        error: {
          code: "RENDER_BROWSER_ONLY",
          message: "Canvas preview rendering is only available in the browser",
        },
      };
    }

    if (time < 0 || time > project.timeline.duration + 0.001) {
      return {
        success: false,
        error: {
          code: "RENDER_TIME_OUT_OF_RANGE",
          message: `Render time ${time}s is outside project duration ${project.timeline.duration}s`,
        },
      };
    }

    const width = options.width ?? project.settings.width;
    const height = options.height ?? project.settings.height;
    const backgroundColor =
      options.backgroundColor ?? project.settings.backgroundColor;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        success: false,
        error: {
          code: "CANVAS_CONTEXT_UNAVAILABLE",
          message: "Unable to create Canvas2D context",
        },
      };
    }

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const activeVideo = findActiveClip(project, time, "video");

    if (activeVideo) {
      const drawResult = await drawVideoClip(ctx, project, activeVideo.clip, time, {
        width,
        height,
      });

      if (!drawResult.success) {
        return drawResult;
      }
    }

    drawActiveTextClips(ctx, project, time, {
      width,
      height,
    });

    drawActiveGraphicsClips(ctx, project, time, {
      width,
      height,
    });

    const bitmap = await createImageBitmap(canvas);

    return {
      success: true,
      data: bitmap,
    };
  } catch (error) {
    console.error("[openreel-adapter] Failed to render frame", {
      operation: "renderFrame",
      time,
      projectId: project.id,
      error,
    });

    return {
      success: false,
      error: {
        code: "RENDER_FRAME_FAILED",
        message: "Failed to render preview frame",
      },
    };
  }
}

function buildProjectSettings(edl: MonetEDL): OpenReelProjectSettings {
  return {
    width: edl.timeline?.resolution?.width ?? DEFAULT_WIDTH,
    height: edl.timeline?.resolution?.height ?? DEFAULT_HEIGHT,
    fps: edl.timeline?.fps ?? DEFAULT_FPS,
    backgroundColor: DEFAULT_BACKGROUND,
  };
}

function buildMediaLibrary(edl: MonetEDL): OpenReelMediaItem[] {
  const items = new Map<string, OpenReelMediaItem>();

  for (const shot of edl.shots) {
    const mediaId = getShotMediaId(shot);
    if (!mediaId || items.has(mediaId)) {
      continue;
    }

    items.set(mediaId, {
      id: mediaId,
      type: getShotMediaType(shot),
      src: buildMediaUrl(mediaId),
      name: mediaId,
      duration: getShotSourceDuration(shot),
      meta: {
        source: "monet-shot",
      },
    });
  }

  if (edl.music?.sourceId && !items.has(edl.music.sourceId)) {
    items.set(edl.music.sourceId, {
      id: edl.music.sourceId,
      type: "audio",
      src: buildMediaUrl(edl.music.sourceId),
      name: edl.music.sourceId,
      meta: {
        source: "monet-music",
        bpm: edl.music.bpm,
      },
    });
  }

  return Array.from(items.values());
}

function buildVideoTrack(edl: MonetEDL): OpenReelTrack {
  const clips: OpenReelClip[] = [];

  for (const shot of edl.shots) {
    if (getShotMediaType(shot) !== "video") {
      continue;
    }

    clips.push(convertShotToClip(shot));
  }

  return {
    id: "track-video-primary",
    type: "video",
    clips,
    transitions: buildTransitions(clips, edl),
    locked: false,
    hidden: false,
  };
}

function buildAudioTrack(edl: MonetEDL): OpenReelTrack {
  const clips: OpenReelClip[] = [];

  if (edl.music?.sourceId) {
    clips.push({
      id: `audio-${edl.music.sourceId}`,
      mediaId: edl.music.sourceId,
      startTime: 0,
      duration: edl.timeline.duration,
      inPoint: 0,
      outPoint: edl.timeline.duration,
      speed: 1,
      meta: {
        role: "music",
        volume: edl.music.volume,
        bpm: edl.music.bpm,
        fadeIn: edl.music.fadeIn,
      },
    });
  }

  return {
    id: "track-audio-music",
    type: "audio",
    clips,
    transitions: [],
    locked: false,
    hidden: false,
  };
}

function buildTextTrack(edl: MonetEDL): OpenReelTrack {
  const clips: OpenReelClip[] = [];

  for (const shot of edl.shots) {
    if (getShotMediaType(shot) !== "text") {
      continue;
    }

    clips.push(convertShotToClip(shot));
  }

  return {
    id: "track-text-primary",
    type: "text",
    clips,
    transitions: [],
    locked: false,
    hidden: false,
  };
}

function buildGraphicsTrack(edl: MonetEDL): OpenReelTrack {
  const clips: OpenReelClip[] = [];

  for (const shot of edl.shots) {
    if (getShotMediaType(shot) !== "graphics") {
      continue;
    }

    clips.push(convertShotToClip(shot));
  }

  return {
    id: "track-graphics-primary",
    type: "graphics",
    clips,
    transitions: [],
    locked: false,
    hidden: false,
  };
}

function convertShotToClip(shot: MonetShot): OpenReelClip {
  const mediaId = getShotMediaId(shot);
  const startTime = shot.timing.startTime;
  const duration = shot.timing.duration;
  const inPoint = getShotSourceStart(shot);
  const outPoint = getShotSourceEnd(shot, inPoint, duration);
  const speed = getShotSpeed(shot);

  return {
    id: shot.id,
    mediaId,
    startTime,
    duration,
    inPoint,
    outPoint,
    speed,
    meta: {
      aiRationale: shot.aiRationale,
      beatLock: shot.beatLock,
      effects: shot.effects ?? [],
      source: shot.source,
      timing: shot.timing,
    },
  };
}

function buildTransitions(
  clips: OpenReelClip[],
  edl: MonetEDL
): OpenReelTransition[] {
  const transitions: OpenReelTransition[] = [];

  for (let index = 1; index < clips.length; index++) {
    const previous = clips[index - 1];
    const current = clips[index];

    const gap = current.startTime - (previous.startTime + previous.duration);

    if (Math.abs(gap) <= 0.001) {
      transitions.push({
        id: `transition-${previous.id}-${current.id}`,
        type: resolveTransitionType(edl),
        fromClipId: previous.id,
        toClipId: current.id,
        startTime: current.startTime,
        duration: resolveTransitionDuration(edl),
        meta: {
          source: "monet-auto-transition",
        },
      });
    }
  }

  return transitions;
}

function buildMarkers(edl: MonetEDL): OpenReelMarker[] {
  const markers: OpenReelMarker[] = [];

  if (edl.music?.beatGrid) {
    for (let index = 0; index < edl.music.beatGrid.length; index++) {
      markers.push({
        id: `beat-${index}`,
        time: edl.music.beatGrid[index],
        type: "beat",
        label: `Beat ${index + 1}`,
        meta: {
          bpm: edl.music.bpm,
        },
      });
    }
  }

  for (const shot of edl.shots) {
    markers.push({
      id: `cut-${shot.id}`,
      time: shot.timing.startTime,
      type: "cut",
      label: `Cut: ${shot.id}`,
      meta: {
        aiRationale: shot.aiRationale,
      },
    });
  }

  return markers.sort((a, b) => a.time - b.time);
}

async function drawVideoClip(
  ctx: CanvasRenderingContext2D,
  project: OpenReelCompatibleProject,
  clip: OpenReelClip,
  time: number,
  dimensions: { width: number; height: number }
): Promise<AdapterResult<ImageBitmap>> {
  const media = project.mediaLibrary.items.find((item) => item.id === clip.mediaId);
  if (!media) {
    return {
      success: false,
      error: {
        code: "MEDIA_ITEM_NOT_FOUND",
        message: `Media item not found for clip ${clip.id}`,
      },
    };
  }

  const videoResult = await getVideoElement(media);
  if (!videoResult.success) {
    return videoResult;
  }

  const video = videoResult.data;
  const sourceTime = clip.inPoint + (time - clip.startTime) * clip.speed;

  const seekResult = await seekVideo(video, sourceTime);
  if (!seekResult.success) {
    return seekResult;
  }

  drawContainCoverVideo(ctx, video, dimensions.width, dimensions.height);

  return {
    success: true,
    data: await createImageBitmap(ctx.canvas),
  };
}

async function getVideoElement(
  media: OpenReelMediaItem
): Promise<AdapterResult<HTMLVideoElement>> {
  const cached = videoCache.get(media.id);
  if (cached) {
    return {
      success: true,
      data: cached.element,
    };
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = media.src;

    const cleanup = (): void => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
    };

    const handleLoaded = (): void => {
      cleanup();
      videoCache.set(media.id, {
        mediaId: media.id,
        src: media.src,
        element: video,
      });

      resolve({
        success: true,
        data: video,
      });
    };

    const handleError = (): void => {
      cleanup();

      resolve({
        success: false,
        error: {
          code: "VIDEO_LOAD_FAILED",
          message: `Failed to load video media ${media.id}`,
        },
      });
    };

    video.addEventListener("loadedmetadata", handleLoaded, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

async function seekVideo(
  video: HTMLVideoElement,
  time: number
): Promise<AdapterResult<void>> {
  const boundedTime = Math.max(0, Math.min(time, video.duration || time));

  if (Math.abs(video.currentTime - boundedTime) < 0.025) {
    return {
      success: true,
      data: undefined,
    };
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();

      resolve({
        success: false,
        error: {
          code: "VIDEO_SEEK_TIMEOUT",
          message: `Timed out seeking video to ${boundedTime}s`,
        },
      });
    }, 2500);

    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    const handleSeeked = (): void => {
      cleanup();

      resolve({
        success: true,
        data: undefined,
      });
    };

    const handleError = (): void => {
      cleanup();

      resolve({
        success: false,
        error: {
          code: "VIDEO_SEEK_FAILED",
          message: `Failed seeking video to ${boundedTime}s`,
        },
      });
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });

    video.currentTime = boundedTime;
  });
}

function drawContainCoverVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
): void {
  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;

  const scale = Math.max(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  ctx.drawImage(video, x, y, drawWidth, drawHeight);
}

function drawActiveTextClips(
  ctx: CanvasRenderingContext2D,
  project: OpenReelCompatibleProject,
  time: number,
  dimensions: { width: number; height: number }
): void {
  const textTrack = project.timeline.tracks.find((track) => track.type === "text");
  if (!textTrack) {
    return;
  }

  for (const clip of textTrack.clips) {
    if (!isClipActiveAtTime(clip, time)) {
      continue;
    }

    const text = getMetaString(clip.meta, "text") ?? clip.mediaId;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 64px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 12;
    ctx.fillText(text, dimensions.width / 2, dimensions.height * 0.82);
    ctx.restore();
  }
}

function drawActiveGraphicsClips(
  ctx: CanvasRenderingContext2D,
  project: OpenReelCompatibleProject,
  time: number,
  dimensions: { width: number; height: number }
): void {
  const graphicsTrack = project.timeline.tracks.find(
    (track) => track.type === "graphics"
  );

  if (!graphicsTrack) {
    return;
  }

  for (const clip of graphicsTrack.clips) {
    if (!isClipActiveAtTime(clip, time)) {
      continue;
    }

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 4;
    ctx.strokeRect(
      dimensions.width * 0.08,
      dimensions.height * 0.08,
      dimensions.width * 0.84,
      dimensions.height * 0.84
    );
    ctx.restore();
  }
}

function findActiveClip(
  project: OpenReelCompatibleProject,
  time: number,
  type: OpenReelTrackType
): ActiveClipLookup | null {
  for (const track of project.timeline.tracks) {
    if (track.type !== type || track.hidden) {
      continue;
    }

    for (const clip of track.clips) {
      if (isClipActiveAtTime(clip, time)) {
        return {
          clip,
          track,
        };
      }
    }
  }

  return null;
}

function isClipActiveAtTime(clip: OpenReelClip, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}

export function calculateTimelineDuration(
  project: OpenReelCompatibleProject
): number {
  return calculateTracksDuration(project.timeline.tracks);
}

function calculateTracksDuration(tracks: OpenReelTrack[]): number {
  let max = 0;

  for (const track of tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startTime + clip.duration);
    }
  }

  return max;
}

function validateEDLForAdapter(
  edl: MonetEDL
): AdapterResult<true> {
  if (!edl.shots || edl.shots.length === 0) {
    return {
      success: false,
      error: {
        code: "EMPTY_EDL",
        message: "Cannot create OpenReel project from an EDL with no shots",
      },
    };
  }

  if (!edl.timeline || edl.timeline.duration <= 0) {
    return {
      success: false,
      error: {
        code: "INVALID_TIMELINE",
        message: "Cannot create OpenReel project from invalid timeline duration",
      },
    };
  }

  for (const shot of edl.shots) {
    const mediaId = getShotMediaId(shot);

    if (!mediaId) {
      return {
        success: false,
        error: {
          code: "SHOT_MEDIA_MISSING",
          message: `Shot ${shot.id} is missing source media`,
        },
      };
    }

    if (shot.timing.duration <= 0) {
      return {
        success: false,
        error: {
          code: "SHOT_DURATION_INVALID",
          message: `Shot ${shot.id} has invalid duration`,
        },
      };
    }
  }

  return {
    success: true,
    data: true,
  };
}

function buildMediaUrl(mediaId: string): string {
  return `/api/media/${encodeURIComponent(mediaId)}`;
}

function getShotMediaId(shot: MonetShot): string {
  if ("source" in shot && shot.source && typeof shot.source.clipId === "string") {
    return shot.source.clipId;
  }

  return shot.id;
}

function getShotMediaType(shot: MonetShot): OpenReelMediaItem["type"] {
  const shotType = "type" in shot ? shot.type : undefined;

  if (shotType === "text") {
    return "text";
  }

  if (shotType === "graphics") {
    return "graphics";
  }

  return "video";
}

function getShotSourceStart(shot: MonetShot): number {
  if ("source" in shot && shot.source && "inPoint" in shot.source && typeof shot.source.inPoint === "number") {
    return shot.source.inPoint;
  }

  return 0;
}

function getShotSourceEnd(
  shot: MonetShot,
  sourceStart: number,
  duration: number
): number {
  if ("source" in shot && shot.source && "outPoint" in shot.source && typeof shot.source.outPoint === "number") {
    return shot.source.outPoint;
  }

  return sourceStart + duration;
}

function getShotSourceDuration(shot: MonetShot): number | undefined {
  const start = getShotSourceStart(shot);
  const end = getShotSourceEnd(shot, start, shot.timing.duration);

  return end > start ? end - start : undefined;
}

function getShotSpeed(shot: MonetShot): number {
  if ("speed" in shot && typeof shot.speed === "number" && shot.speed > 0) {
    return shot.speed;
  }

  if (
    "motion" in shot &&
    shot.motion &&
    typeof shot.motion === "object" &&
    "speed" in shot.motion &&
    typeof shot.motion.speed === "number" &&
    shot.motion.speed > 0
  ) {
    return shot.motion.speed;
  }

  return 1;
}

function resolveTransitionType(edl: MonetEDL): OpenReelTransition["type"] {
  const transitionStyle = "transitionStyle" in (edl.globalEffects || {}) 
    ? (edl.globalEffects as unknown as Record<string, unknown>).transitionStyle 
    : undefined;

  if (transitionStyle === "crossfade" || transitionStyle === "smooth") {
    return "crossfade";
  }

  return "cut";
}

function resolveTransitionDuration(edl: MonetEDL): number {
  const transitionStyle = "transitionStyle" in (edl.globalEffects || {}) 
    ? (edl.globalEffects as unknown as Record<string, unknown>).transitionStyle 
    : undefined;

  if (transitionStyle === "crossfade" || transitionStyle === "smooth") {
    return 0.25;
  }

  return 0;
}

function getMetaString(
  meta: Record<string, unknown>,
  key: string
): string | null {
  const value = meta[key];
  return typeof value === "string" ? value : null;
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
