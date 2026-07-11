import type { ProjectEDL as MonetEDL, Clip, Track, MediaAsset, AudioAsset } from "@monet/edl/src/schemas";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export interface TimelineRenderInput {
  edl: MonetEDL;
  outputPath: string;
  mode: "preview" | "final";
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (progress: number) => void;
}

export interface TimelineRenderResult {
  outputPath: string;
  filterComplex: string;
  inputCount: number;
  duration: number;
}

export interface RenderDimensions {
  width: number;
  height: number;
}

export interface IndexedVideoClip {
  clip: Clip;
  track: Track;
  inputIndex: number;
  asset: MediaAsset;
  outputVideoLabel: string;
  outputAudioLabel?: string;
}

export interface IndexedAudioClip {
  clip: Clip;
  track: Track;
  inputIndex: number;
  asset: AudioAsset;
  outputAudioLabel: string;
}

export interface FFmpegInput {
  path: string;
  kind: "video" | "audio";
  clipId: string;
  mediaId: string;
}

export interface CompiledTimelineGraph {
  filterComplex: string;
  videoOutputLabel: string;
  audioOutputLabel?: string;
  inputs: FFmpegInput[];
  duration: number;
  dimensions: RenderDimensions;
}