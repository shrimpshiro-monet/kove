export type TrackType =
  | "video"
  | "audio"
  | "text"
  | "fx"
  | "mask";

export interface ProjectEDL {
  version: 1;
  id: string;
  meta: EDLMeta;
  timeline: Timeline;
  assets: AssetRegistry;
}

export interface EDLMeta {
  createdAt: number;
  updatedAt: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  fps: number;
  sampleRate: number;
  intentId?: string;
  analysisId?: string;
  projectId?: string;
}

export interface Timeline {
  duration: number;
  tracks: Track[];
  markers: Marker[];
}

export interface Marker {
  id: string;
  time: number;
  label?: string;
  type?: "beat" | "hook" | "chapter" | "transient" | "caption" | "impact";
}

export interface Track {
  id: string;
  type: TrackType;
  clips: Clip[];
  order: number;
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

  transforms: TransformKeyframes;
  audio: AudioProperties;
  effects: EffectBlock[];

  meta?: Record<string, unknown>;
}

export interface TransformKeyframes {
  position: KeyframeVec2[];
  scale: Keyframe[];
  rotation: Keyframe[];
  crop?: CropKeyframe[];
}

export interface Keyframe {
  time: number;
  value: number;
  easing?: Easing;
}

export interface KeyframeVec2 {
  time: number;
  x: number;
  y: number;
  easing?: Easing;
}

export interface CropKeyframe {
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Easing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bezier";

export interface AudioProperties {
  gain: number;
  fadeIn?: number;
  fadeOut?: number;
  pan?: number;
}

import type { MonetEffectType } from "./effect-types";

export interface EffectBlock {
  id: string;
  type: MonetEffectType;

  start: number;
  duration: number;

  params: Record<string, unknown>;
}

export interface AssetRegistry {
  media: Record<string, MediaAsset>;
  audio: Record<string, AudioAsset>;
  overlays: Record<string, OverlayAsset>;
}

export interface MediaAsset {
  id: string;
  path: string;
  duration: number;
  width: number;
  height: number;
}

export interface AudioAsset {
  id: string;
  path: string;
  duration: number;
}

export interface OverlayAsset {
  id: string;
  path: string;
  type: "image" | "video" | "canvas" | "text" | "generated";
}
