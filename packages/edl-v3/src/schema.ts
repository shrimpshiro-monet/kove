/**
 * ShotEDL V3 Schema
 *
 * The canonical AI-native EDL format for Jalebi.
 * Shots-based (not tracks/clips) — what the AI naturally produces.
 *
 * Converts to/from:
 * - ProjectEDL (tracks/clips) via openreel-adapter
 * - OpenReel projects via openreel-adapter
 * - FFmpeg commands via renderer
 */
import { z } from "zod";

// ── Enums ───────────────────────────────────────────────────────────────────

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const TransitionTypeSchema = z.enum([
  "cut", "crossfade", "dissolve", "fade", "wipe", "slide", "push", "zoom", "iris", "blur",
]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const EasingTypeSchema = z.enum([
  "linear", "ease-in", "ease-out", "ease-in-out",
]);
export type EasingType = z.infer<typeof EasingTypeSchema>;

export const NarrativeRoleSchema = z.enum([
  "hook", "setup", "build", "peak", "reveal", "cta", "outro", "montage", "breathing",
]);
export type NarrativeRole = z.infer<typeof NarrativeRoleSchema>;

export const SemanticTypeSchema = z.enum([
  "speech", "action", "b-roll", "beauty", "reaction", "establishing", "transition", "graphics",
]);
export type SemanticType = z.infer<typeof SemanticTypeSchema>;

// ── Source (where the footage comes from) ───────────────────────────────────

export const ShotSourceSchema = z.object({
  clipId: z.string().describe("Reference to an asset in the assets registry"),
  inPoint: z.number().min(0).describe("Start time within the source clip (seconds)"),
  outPoint: z.number().min(0).describe("End time within the source clip (seconds)"),
});
export type ShotSource = z.infer<typeof ShotSourceSchema>;

// ── Timing ──────────────────────────────────────────────────────────────────

export const ShotTimingSchema = z.object({
  startTime: z.number().min(0).describe("Position on the timeline (seconds)"),
  duration: z.number().min(0.01).describe("How long this shot plays (seconds)"),
  speed: z.number().min(0.1).max(20).default(1).describe("Playback speed multiplier"),
  beatLocked: z.boolean().default(false).describe("Whether this shot is synced to a beat"),
  beatIndex: z.number().int().optional().describe("Which beat this shot starts on"),
});
export type ShotTiming = z.infer<typeof ShotTimingSchema>;

// ── Transition ──────────────────────────────────────────────────────────────

export const ShotTransitionSchema = z.object({
  type: TransitionTypeSchema.default("cut"),
  duration: z.number().min(0).max(5000).default(0).describe("Transition duration in milliseconds"),
  easing: EasingTypeSchema.default("linear"),
  params: z.record(z.string(), z.unknown()).default({}).describe("Type-specific params"),
});
export type ShotTransition = z.infer<typeof ShotTransitionSchema>;

// ── Effect (references engine-contracts) ────────────────────────────────────

export const ShotEffectSchema = z.object({
  id: z.string(),
  type: z.string().describe("Effect type from engine-contracts (e.g. 'speed_ramp', 'impact_flash')"),
  intensity: z.number().min(0).max(3).default(1),
  startTime: z.number().min(0).optional().describe("When effect starts within the shot (seconds)"),
  duration: z.number().min(0).optional().describe("Effect duration (seconds)"),
  params: z.record(z.string(), z.unknown()).default({}).describe("Effect-specific params from engine-contracts"),
});
export type ShotEffect = z.infer<typeof ShotEffectSchema>;

// ── Audio ───────────────────────────────────────────────────────────────────

export const ShotAudioSchema = z.object({
  gain: z.number().min(0).max(2).default(1).describe("Volume multiplier (0=silence, 1=normal, 2=double)"),
  fadeIn: z.number().min(0).max(30).default(0).describe("Fade in duration (seconds)"),
  fadeOut: z.number().min(0).max(30).default(0).describe("Fade out duration (seconds)"),
  pan: z.number().min(-1).max(1).default(0).describe("Stereo pan (-1=left, 0=center, 1=right)"),
});
export type ShotAudio = z.infer<typeof ShotAudioSchema>;

// ── Transform ───────────────────────────────────────────────────────────────

export const KeyframeSchema = z.object({
  time: z.number().min(0),
  value: z.number(),
  easing: EasingTypeSchema.default("linear"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const Vec2KeyframeSchema = z.object({
  time: z.number().min(0),
  x: z.number(),
  y: z.number(),
  easing: EasingTypeSchema.default("linear"),
});
export type Vec2Keyframe = z.infer<typeof Vec2KeyframeSchema>;

export const ShotTransformSchema = z.object({
  position: z.array(Vec2KeyframeSchema).default([{ time: 0, x: 0, y: 0 }]).describe("Position keyframes (normalized 0-1)"),
  scale: z.array(KeyframeSchema).default([{ time: 0, value: 1 }]).describe("Scale keyframes"),
  rotation: z.array(KeyframeSchema).default([{ time: 0, value: 0 }]).describe("Rotation keyframes (degrees)"),
  opacity: z.array(KeyframeSchema).optional().describe("Opacity keyframes (0=transparent, 1=opaque)"),
});
export type ShotTransform = z.infer<typeof ShotTransformSchema>;

// ── Overlay (text, graphics, elements on top of this shot) ──────────────────

export const OverlayTypeSchema = z.enum(["text", "svg", "sticker", "element"]);
export type OverlayType = z.infer<typeof OverlayTypeSchema>;

export const TextOverlaySchema = z.object({
  type: z.literal("text"),
  id: z.string(),
  text: z.string(),
  style: z.object({
    fontFamily: z.string().default("Inter"),
    fontSize: z.number().min(8).max(400).default(48),
    fontWeight: z.union([z.number(), z.string()]).default("bold"),
    color: z.string().default("#ffffff"),
    backgroundColor: z.string().optional(),
    textAlign: z.enum(["left", "center", "right"]).default("center"),
  }).default({}),
  position: z.object({ x: z.number().min(0).max(1).default(0.5), y: z.number().min(0).max(1).default(0.5) }).default({}),
  animation: z.object({
    preset: z.string().default("none"),
    inDuration: z.number().min(0).max(5).default(0.3),
    outDuration: z.number().min(0).max(5).default(0.3),
  }).optional(),
  behindSubject: z.boolean().default(false).describe("Render behind the subject (requires subject mask)"),
});

export const SvgOverlaySchema = z.object({
  type: z.literal("svg"),
  id: z.string(),
  content: z.string().describe("SVG markup"),
  viewBox: z.object({ minX: z.number(), minY: z.number(), width: z.number(), height: z.number() }),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  scale: z.number().min(0.1).max(10).default(1),
  animation: z.object({
    type: z.string().default("none"),
    duration: z.number().min(0).max(10).default(1),
    delay: z.number().min(0).max(10).default(0),
  }).optional(),
});

export const StickerOverlaySchema = z.object({
  type: z.literal("sticker"),
  id: z.string(),
  imageUrl: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  scale: z.number().min(0.1).max(10).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  animation: z.object({
    preset: z.string().default("none"),
    duration: z.number().min(0).max(5).default(0.5),
  }).optional(),
});

export const ElementOverlaySchema = z.object({
  type: z.literal("element"),
  id: z.string(),
  name: z.string(),
  layers: z.array(z.any()).describe("Nested composition layers"),
  transform: z.any().describe("Element-level transform keyframes"),
});

export const OverlaySchema = z.discriminatedUnion("type", [
  TextOverlaySchema,
  SvgOverlaySchema,
  StickerOverlaySchema,
  ElementOverlaySchema,
]);
export type Overlay = z.infer<typeof OverlaySchema>;

// ── Shot ────────────────────────────────────────────────────────────────────

export const ShotSchema = z.object({
  id: z.string().describe("Unique shot identifier"),
  source: ShotSourceSchema.describe("Where the footage comes from"),
  timing: ShotTimingSchema.describe("When this shot plays on the timeline"),
  transition: ShotTransitionSchema.default({}).describe("Incoming transition from previous shot"),
  effects: z.array(ShotEffectSchema).default([]).describe("Visual effects applied to this shot"),
  audio: ShotAudioSchema.default({}).describe("Audio properties for this shot's source audio"),
  transform: ShotTransformSchema.default({}).describe("Position, scale, rotation keyframes"),
  overlays: z.array(OverlaySchema).default([]).describe("Text, graphics, elements layered on top"),
  meta: z.object({
    narrativeRole: NarrativeRoleSchema.optional().describe("Story function (hook, build, peak, etc.)"),
    semanticType: SemanticTypeSchema.optional().describe("Content type (speech, action, b-roll, etc.)"),
    importance: z.number().min(0).max(1).optional().describe("How important this shot is (0=removable, 1=essential)"),
    faceVisible: z.boolean().optional().describe("Whether a face is visible in this shot"),
    speechCoverage: z.number().min(0).max(1).optional().describe("Percentage of shot that has speech"),
    aiRationale: z.string().optional().describe("Why the AI chose this shot"),
  }).default({}).describe("AI-generated metadata about this shot"),
});
export type Shot = z.infer<typeof ShotSchema>;

// ── Music ───────────────────────────────────────────────────────────────────

export const ShotEDLMusicSchema = z.object({
  sourceId: z.string().describe("Reference to an asset in the assets registry"),
  bpm: z.number().min(20).max(300).describe("Beats per minute"),
  beatGrid: z.array(z.number().min(0)).default([]).describe("Timestamps of each beat (seconds)"),
  downbeats: z.array(z.number().min(0)).default([]).describe("Timestamps of downbeats"),
  volume: z.number().min(0).max(2).default(1).describe("Music volume"),
  fadeIn: z.number().min(0).max(30).default(0).describe("Music fade in (seconds)"),
  fadeOut: z.number().min(0).max(30).default(0).describe("Music fade out (seconds)"),
}).optional();
export type ShotEDLMusic = z.infer<typeof ShotEDLMusicSchema>;

// ── Asset Registry ──────────────────────────────────────────────────────────

export const MediaAssetSchema = z.object({
  id: z.string(),
  path: z.string().describe("File path or R2 key"),
  duration: z.number().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  mimeType: z.string().optional(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

// ── Marker ──────────────────────────────────────────────────────────────────

export const MarkerSchema = z.object({
  id: z.string(),
  time: z.number().min(0),
  label: z.string().optional(),
  type: z.enum(["beat", "hook", "chapter", "transient", "caption", "impact", "custom"]).default("custom"),
});
export type Marker = z.infer<typeof MarkerSchema>;

// ── ShotEDL (the top-level document) ────────────────────────────────────────

export const ShotEDLSchema = z.object({
  version: z.literal(3).describe("EDL format version"),
  id: z.string().describe("Unique EDL identifier"),

  meta: z.object({
    aspectRatio: AspectRatioSchema.default("9:16"),
    fps: z.number().min(1).max(120).default(30),
    duration: z.number().min(0).describe("Total timeline duration (seconds)"),
    createdAt: z.number().describe("Creation timestamp (ms)"),
    prompt: z.string().optional().describe("User's original prompt"),
    analysisId: z.string().optional().describe("Reference to footage analysis"),
    referenceStyleId: z.string().optional().describe("Reference to reference analysis"),
    generationMode: z.enum(["scripted", "montage", "reference", "hybrid"]).optional().describe("How this EDL was generated"),
  }),

  shots: z.array(ShotSchema).min(1).describe("Ordered list of shots on the timeline"),

  music: ShotEDLMusicSchema.describe("Music track info (beat grid, BPM)"),

  assets: z.object({
    media: z.record(z.string(), MediaAssetSchema).default({}).describe("Source footage registry"),
  }).default({}).describe("All media assets referenced by shots"),

  markers: z.array(MarkerSchema).default([]).describe("Timeline markers (beats, chapters, etc.)"),
});
export type ShotEDL = z.infer<typeof ShotEDLSchema>;
