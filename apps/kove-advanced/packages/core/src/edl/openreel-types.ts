/**
 * openreel-types.ts — Canonical OpenReel Project type definitions
 *
 * Since @kove/core does not exist as a workspace package, these types
 * are defined from actual codebase usage. Every type reflects the EXACT
 * shape of OpenReel project data as read and written across the codebase.
 *
 * Files where OpenReel data is read or written:
 *
 *   WRITE (canonical adapter):
 *     packages/openreel-adapter/src/edl-to-openreel.ts
 *     packages/kove-director/src/compiler.ts (actions)
 *
 *   WRITE (deprecated stub — re-exports package version):
 *     src/lib/kove/edl-to-openreel.ts
 *
 *   READ: apps/web/src/stores/edl-adapter.ts, project-store.ts,
 *         monet-action-executor.ts, engine/web-player.ts,
 *         engine/timeline-resolver.ts, engine/audio/*.ts,
 *         components/editor/ClipInspector.tsx, EffectInspector.tsx,
 *         SpatialVFXPanel.tsx, preview/BlueprintPreview.tsx,
 *         apps/api/src/api/vibe-generate.ts,
 *         lib/media/project-media-hydration.ts,
 *         src/lib/kove/editor-wrapper.ts
 */

// ============================================================================
// PROJECT
// ============================================================================

export interface OpenReelProject {
  /** Schema version — increment for breaking changes to support migration */
  version: number;
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  settings: OpenReelSettings;
  mediaLibrary: OpenReelMediaLibrary;
  timeline: OpenReelTimeline;
}

export interface OpenReelSettings {
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  /** Optional — only meaningful for audio items */
  channels?: number;
}

// ============================================================================
// MEDIA LIBRARY
// ============================================================================

export interface OpenReelMediaLibrary {
  items: OpenReelMediaItem[];
}

export interface OpenReelMediaItem {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  /**
   * Non-serializable browser objects. Excluded from EDL round-trip.
   * Rehydrated on media load. Null when deserialized from disk/API.
   */
  fileHandle: FileSystemFileHandle | null;
  blob: Blob | null;
  metadata: OpenReelMediaMetadata;
  thumbnailUrl: string | null;
  waveformData: OpenReelWaveformData | null;
}

export interface OpenReelMediaMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  sampleRate: number;
  /**
   * Optional at type level. REQUIRED at runtime for type: "audio" media items.
   * Audio engine (audio-timeline-engine.ts) will throw if missing on audio items.
   */
  channels?: number;
  fileSize: number;
}

export interface OpenReelWaveformData {
  peaks: number[];
  sampleRate: number;
  duration: number;
}

// ============================================================================
// TIMELINE
// ============================================================================

export interface OpenReelTimeline {
  tracks: OpenReelTrack[];
  subtitles: OpenReelSubtitle[];
  duration: number;
  markers: OpenReelMarker[];
}

export interface OpenReelMarker {
  id: string;
  time: number;
  label: string;
  /** Hex color (e.g. "#FF4E00" for Kove Orange) */
  color: string;
}

export interface OpenReelSubtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style?: Record<string, unknown>;
}

// ============================================================================
// TRACK
// ============================================================================

export type OpenReelTrackType = "video" | "audio" | "text" | "image" | "graphics";

export interface OpenReelTrack {
  id: string;
  type: OpenReelTrackType;
  name: string;
  clips: OpenReelClip[];
  /**
   * @deprecated Dead code — never populated or read at runtime.
   * Transitions are authoritative at clip level (OpenReelClip.transition).
   * Kept for serialization compatibility. Always empty array.
   */
  transitions: OpenReelTransition[];
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
  /** "monet/v1" for AI-generated tracks, absent for user-created */
  managed_by?: string;
}

// ============================================================================
// CLIP
// ============================================================================

export interface OpenReelClip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  effects: OpenReelEffect[];
  audioEffects: OpenReelEffect[];
  transform: OpenReelTransform;
  volume: number;
  keyframes: OpenReelKeyframe[];
  /** Incoming transition from the previous clip — authoritative transition location */
  transition?: OpenReelTransition;
  /**
   * Kove-specific metadata. Preserved 1:1 through round-trips.
   * Includes: semanticEvent, shotType, cameraMotion, importance, narrativeRole.
   */
  meta?: Record<string, unknown>;
}

// ============================================================================
// EFFECT / TRANSITION / TRANSFORM
// ============================================================================

export interface OpenReelEffect {
  id: string;
  type: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface OpenReelTransition {
  id: string;
  type: string;
  duration: number;
  params?: Record<string, unknown>;
}

export interface OpenReelTransform {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  anchor: { x: number; y: number };
  opacity: number;
}

// ============================================================================
// KEYFRAME
// ============================================================================

/**
 * Flattened scalar keyframes by design. The runtime engine (interpolator.ts,
 * effect-runner.ts) strictly requires value: number. Multi-dimensional props
 * are split: "position.x"/"position.y", "scale.x"/"scale.y".
 *
 * NOTE: Executor-created clip keyframes (push_in, pull_out, etc.) are orphaned
 * — the preview engine does not read clip.keyframes. Known gap.
 */
export interface OpenReelKeyframe {
  id: string;
  time: number;
  /** Dot-separated property path (e.g. "position.x", "transform.scale") */
  property: string;
  value: number;
  easing: OpenReelEasing;
}

export type OpenReelEasing =
  | "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bezier";

// ============================================================================
// ACTION (discriminated union — 12 real types from compiler.ts)
// ============================================================================

/**
 * Timeline mutation actions from the Kove Director compiler.
 * 13 real types. "audio/volume", "audio/fade", "color/grade"
 * do NOT exist — volume/fade via "clip/update", color via "effect/apply".
 */
export type OpenReelAction =
  | { type: "timeline/clear"; id: string; timestamp: number; params: Record<string, never> }
  | { type: "track/create"; id: string; timestamp: number; params: { trackId: string; trackType: string; name: string } }
  | { type: "clip/add"; id: string; timestamp: number; params: OpenReelClipAddParams }
  | { type: "clip/remove"; id: string; timestamp: number; params: { clipId: string } }
  | { type: "clip/update"; id: string; timestamp: number; params: OpenReelClipUpdateParams }
  | { type: "keyframe/add"; id: string; timestamp: number; params: OpenReelKeyframeAddParams }
  | { type: "transform/update"; id: string; timestamp: number; params: OpenReelTransformUpdateParams }
  | { type: "effect/apply"; id: string; timestamp: number; params: OpenReelEffectApplyParams }
  | { type: "audio/beat-sync"; id: string; timestamp: number; params: OpenReelAudioBeatSyncParams }
  | { type: "audio/ducking"; id: string; timestamp: number; params: OpenReelAudioDuckingParams }
  | { type: "transition/add"; id: string; timestamp: number; params: OpenReelTransitionAddParams }
  | { type: "marker/add"; id: string; timestamp: number; params: { time: number; label?: string; color?: string } }
  | { type: "subtitle/add"; id: string; timestamp: number; params: { clipId: string; style?: string; language?: string; maxCharsPerLine?: number } };

export interface OpenReelClipAddParams {
  clipId: string;
  mediaId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  trackId?: string;
  speed?: number;
  volume?: number;
}

export type OpenReelClipUpdateParams = { clipId: string } & (
  | { speed: number }
  | { volume: number }
  | { fade: { fadeIn: number; fadeOut: number } }
  | { stabilization: { enabled: true; strength: number; cropMode: string } }
  | { reframe: { targetRatio: string; lockSubject: string } }
);

export interface OpenReelKeyframeAddParams {
  clipId: string;
  property: string;
  time: number;
  value: number;
  easing?: string;
  effectType?: string;
}

export interface OpenReelTransformUpdateParams {
  clipId: string;
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  rotation?: number;
  opacity?: number;
  crop?: { x: number; y: number; width: number; height: number };
}

export type OpenReelEffectApplyParams = {
  target: "clip" | "track" | "timeline";
  targetId?: string;
} & (
  | { kind: "preset"; presetId: string; intensity?: number }
  | { kind: "color-grading"; preset?: string; adjustments?: {
      brightness?: number; contrast?: number; saturation?: number;
      temperature?: number; tint?: number; shadows?: number;
      midtones?: number; highlights?: number;
    }}
  | { kind: "custom"; effectType: string; params: Record<string, unknown> }
);

export interface OpenReelAudioBeatSyncParams {
  clipId: string;
  mode: "cuts" | "speed" | "effects";
  sensitivity?: number;
}

export interface OpenReelAudioDuckingParams {
  musicTrackId: string;
  voiceTrackId?: string;
  duckAmount?: number;
  attack?: number;
  release?: number;
}

export interface OpenReelTransitionAddParams {
  clipAId: string;
  clipBId: string;
  type?: string;
  duration?: number;
  params?: Record<string, unknown>;
}
