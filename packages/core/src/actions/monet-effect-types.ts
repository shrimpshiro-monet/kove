export type OpenReelTrackType = "video" | "audio" | "text" | "graphics";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export interface Action {
  type: string;
  id: string;
  timestamp: number;
  params: Record<string, unknown>;
}

export interface Marker {
  id: string;
  time: number;
  label?: string;
  type?: string;
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

export interface Track {
  id: string;
  type: OpenReelTrackType;
  clips: Clip[];
  transitions: Transition[];
  locked: boolean;
  hidden: boolean;
}

export interface ProjectSettings {
  fps?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  monet?: {
    edl?: MonetEDL;
    lastSyncedAt?: number;
    syncVersion?: number;
  };
  [key: string]: unknown;
}

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

export type MonetEffectType =
  | "speed_ramp"
  | "impact_flash"
  | "context_shake"
  | "color_grade"
  | "gl_transition"
  | "audio_fx"
  | "mask_composite";

export interface MonetEffectBlock {
  id: string;
  type: MonetEffectType;
  start: number;
  duration: number;
  params: Record<string, unknown>;
}

export type MonetEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bezier";

export interface MonetKeyframe {
  time: number;
  value: number;
  easing?: MonetEasing;
}

export interface MonetKeyframeVec2 {
  time: number;
  x: number;
  y: number;
  easing?: MonetEasing;
}

export interface MonetCropKeyframe {
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonetTransformKeyframes {
  position: MonetKeyframeVec2[];
  scale: MonetKeyframe[];
  rotation: MonetKeyframe[];
  crop?: MonetCropKeyframe[];
}

export interface MonetAudioProperties {
  gain: number;
  fadeIn?: number;
  fadeOut?: number;
  pan?: number;
}

export interface MonetClip {
  id: string;
  mediaId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  transforms: MonetTransformKeyframes;
  audio: MonetAudioProperties;
  effects: MonetEffectBlock[];
  meta?: Record<string, unknown>;
}

export interface MonetTrack {
  id: string;
  type: "video" | "audio" | "text" | "fx" | "mask";
  clips: MonetClip[];
  order: number;
  locked: boolean;
  hidden: boolean;
}

export interface MonetEDL {
  version: 1;
  id: string;
  meta: {
    createdAt: number;
    updatedAt: number;
    aspectRatio: "16:9" | "9:16" | "1:1";
    fps: number;
    sampleRate: number;
  };
  timeline: {
    duration: number;
    tracks: MonetTrack[];
    markers: Marker[];
  };
  assets: {
    media: Record<string, unknown>;
    audio: Record<string, unknown>;
    overlays: Record<string, unknown>;
  };
}

export interface UpsertClipEffectParams {
  clipId: string;
  effect: MonetEffectBlock;
}

export interface RemoveClipEffectParams {
  clipId: string;
  effectId: string;
}

export interface UpdateClipTransformsParams {
  clipId: string;
  transforms: MonetTransformKeyframes;
}

export interface ClipLookupResult {
  clip: Clip;
  track: Track;
}

export interface MonetClipLookupResult {
  clip: MonetClip;
  track: MonetTrack;
}
