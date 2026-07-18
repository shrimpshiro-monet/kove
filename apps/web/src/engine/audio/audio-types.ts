import type { ProjectEDL as MonetEDL, Clip, AudioAsset } from "@monet/edl";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export interface ScheduledAudioClip {
  clip: Clip;
  asset: AudioAsset;
  gain: number;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  fadeIn: number;
  fadeOut: number;
}

export interface ActiveAudioSource {
  clipId: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startedAtContextTime: number;
  scheduledTimelineTime: number;
}

export interface AudioTimelineEngine {
  load(): Promise<ActionResult<{ decodedAssets: number; scheduledClips: number }>>;
  play(): Promise<ActionResult<{ startedAt: number }>>;
  pause(): ActionResult<{ pausedAt: number }>;
  seek(time: number): ActionResult<{ time: number }>;
  stop(): ActionResult<{ stoppedAt: number }>;
  dispose(): ActionResult<{ disposed: true }>;
  getTimelineTime(): number;
  getState(): AudioTimelineState;
}

export interface AudioTimelineState {
  loaded: boolean;
  playing: boolean;
  timelineOffset: number;
  contextStartTime: number;
  duration: number;
  decodedAssetCount: number;
  scheduledClipCount: number;
}

export interface BeatPoint {
  time: number;
  strength: number;
  kind: "beat" | "transient";
}

export interface BeatEngine {
  getNearestBeat(time: number): BeatPoint | null;
  getNearestTransient(time: number): BeatPoint | null;
  isBeatHit(time: number, threshold?: number): boolean;
  isTransientHit(time: number, threshold?: number): boolean;
  getBeatPulse(time: number, window?: number): number;
  getTransientPulse(time: number, window?: number): number;
  getPoints(): BeatPoint[];
}

export interface CreateAudioTimelineEngineInput {
  edl: MonetEDL;
  audioContext?: AudioContext;
  lookaheadSeconds?: number;
  scheduleIntervalMs?: number;
}
