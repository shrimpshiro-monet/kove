/**
 * @monet/edl-v3
 *
 * V3 EDL format — AI-native, shots-based, validated with Zod.
 * The canonical format for Jalebi's pipeline.
 */

// Schema (types + Zod validators)
export {
  // Top-level
  ShotEDLSchema,
  type ShotEDL,

  // Enums
  AspectRatioSchema,
  type AspectRatio,
  TransitionTypeSchema,
  type TransitionType,
  EasingTypeSchema,
  type EasingType,
  NarrativeRoleSchema,
  type NarrativeRole,
  SemanticTypeSchema,
  type SemanticType,

  // Shot parts
  ShotSchema,
  type Shot,
  ShotSourceSchema,
  type ShotSource,
  ShotTimingSchema,
  type ShotTiming,
  ShotTransitionSchema,
  type ShotTransition,
  ShotEffectSchema,
  type ShotEffect,
  ShotAudioSchema,
  type ShotAudio,
  ShotTransformSchema,
  type ShotTransform,

  // Keyframes
  KeyframeSchema,
  type Keyframe,
  Vec2KeyframeSchema,
  type Vec2Keyframe,

  // Overlays
  OverlaySchema,
  type Overlay,
  TextOverlaySchema,
  SvgOverlaySchema,
  StickerOverlaySchema,
  ElementOverlaySchema,

  // Music
  ShotEDLMusicSchema,
  type ShotEDLMusic,

  // Assets
  MediaAssetSchema,
  type MediaAsset,

  // Markers
  MarkerSchema,
  type Marker,
} from "./schema";

// Validation
export { validateShotEDL, assertValidShotEDL, type ValidationResult } from "./validate";

// Helpers
export {
  createEmptyShotEDL,
  createShot,
  registerAsset,
  addMarker,
  getTimelineEnd,
  getShotsInRange,
  getShotAtTime,
  getShotsByRole,
  getShotsByType,
  getAllEffects,
  countEffects,
  renormalizeTimeline,
  scaleDuration,
  removeShot,
  insertShot,
  toJSON,
  fromJSON,
  cloneEDL,
} from "./helpers";
