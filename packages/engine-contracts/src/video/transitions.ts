/**
 * Transitions Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/types/transitions.ts
 *                 apps/kove-advanced/packages/core/src/video/transition-engine.ts
 *
 * Defines all transition types, their params, and duration constraints.
 * Both editors use these exact types — no conversion needed.
 */
import { z } from "zod";

// ── Transition Types ────────────────────────────────────────────────────────

export const TransitionTypeSchema = z.enum([
  "crossfade",
  "dissolve",
  "fade",
  "wipe",
  "slide",
  "push",
  "zoom",
  "iris",
  "blur",
]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

// ── Direction Types ─────────────────────────────────────────────────────────

export const WipeDirectionSchema = z.enum([
  "left", "right", "up", "down",
  "diagonal-tl", "diagonal-tr", "diagonal-bl", "diagonal-br",
]);
export type WipeDirection = z.infer<typeof WipeDirectionSchema>;

export const SlideDirectionSchema = z.enum(["left", "right", "up", "down"]);
export type SlideDirection = z.infer<typeof SlideDirectionSchema>;

export const IrisShapeSchema = z.enum(["circle", "rectangle", "diamond", "star"]);
export type IrisShape = z.infer<typeof IrisShapeSchema>;

// ── Easing ──────────────────────────────────────────────────────────────────

export const TransitionEasingSchema = z.enum([
  "linear", "ease", "ease-in", "ease-out", "ease-in-out",
]);
export type TransitionEasing = z.infer<typeof TransitionEasingSchema>;

// ── Per-type Param Schemas ──────────────────────────────────────────────────

export const CrossfadeParamsSchema = z.object({
  audioFade: z.boolean().default(true),
  audioDuration: z.number().min(0).optional(),
});
export type CrossfadeParams = z.infer<typeof CrossfadeParamsSchema>;

export const DissolveParamsSchema = z.object({});
export type DissolveParams = z.infer<typeof DissolveParamsSchema>;

export const FadeParamsSchema = z.object({
  fadeToColor: z.string().default("#000000"),
});
export type FadeParams = z.infer<typeof FadeParamsSchema>;

export const WipeParamsSchema = z.object({
  direction: WipeDirectionSchema.default("right"),
  feather: z.number().min(0).max(100).default(0),
  angle: z.number().min(0).max(360).optional(),
});
export type WipeParams = z.infer<typeof WipeParamsSchema>;

export const SlideParamsSchema = z.object({
  direction: SlideDirectionSchema.default("left"),
  overlap: z.boolean().default(true),
});
export type SlideParams = z.infer<typeof SlideParamsSchema>;

export const PushParamsSchema = z.object({
  direction: SlideDirectionSchema.default("left"),
});
export type PushParams = z.infer<typeof PushParamsSchema>;

export const ZoomParamsSchema = z.object({
  scale: z.number().min(0.1).max(10).default(2),
  origin: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  zoomIn: z.boolean().default(true),
});
export type ZoomParams = z.infer<typeof ZoomParamsSchema>;

export const IrisParamsSchema = z.object({
  shape: IrisShapeSchema.default("circle"),
  origin: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  openToClose: z.boolean().default(false),
});
export type IrisParams = z.infer<typeof IrisParamsSchema>;

export const BlurTransitionParamsSchema = z.object({
  blurAmount: z.number().min(0).max(100).default(20),
});
export type BlurTransitionParams = z.infer<typeof BlurTransitionParamsSchema>;

// ── Unified Transition Schema ───────────────────────────────────────────────

export const TransitionSchema = z.object({
  id: z.string(),
  type: TransitionTypeSchema,
  duration: z.number().min(0).max(5000).describe("Duration in milliseconds"),
  easing: TransitionEasingSchema.default("linear"),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type Transition = z.infer<typeof TransitionSchema>;

// ── Duration Constraints ────────────────────────────────────────────────────

export const TRANSITION_DURATION = {
  min: 100,    // 100ms minimum
  max: 5000,   // 5s maximum
  default: 500,
  crossfade: { min: 100, max: 3000, default: 500 },
  wipe: { min: 200, max: 2000, default: 600 },
  slide: { min: 200, max: 2000, default: 500 },
  zoom: { min: 200, max: 2000, default: 600 },
  iris: { min: 300, max: 3000, default: 700 },
  blur: { min: 300, max: 3000, default: 600 },
} as const;

// ── Presets ─────────────────────────────────────────────────────────────────

export const TRANSITION_PRESETS = [
  { id: "crossfade", name: "Crossfade", type: "crossfade" as const, duration: 500, easing: "linear" as const },
  { id: "fade-black", name: "Fade to Black", type: "fade" as const, duration: 500, easing: "ease-in-out" as const, params: { fadeToColor: "#000000" } },
  { id: "fade-white", name: "Fade to White", type: "fade" as const, duration: 500, easing: "ease-in-out" as const, params: { fadeToColor: "#ffffff" } },
  { id: "dissolve", name: "Dissolve", type: "dissolve" as const, duration: 500, easing: "linear" as const },
  { id: "wipe-left", name: "Wipe Left", type: "wipe" as const, duration: 600, easing: "ease-in-out" as const, params: { direction: "left", feather: 0 } },
  { id: "wipe-right", name: "Wipe Right", type: "wipe" as const, duration: 600, easing: "ease-in-out" as const, params: { direction: "right", feather: 0 } },
  { id: "wipe-soft", name: "Soft Wipe", type: "wipe" as const, duration: 800, easing: "ease-in-out" as const, params: { direction: "right", feather: 50 } },
  { id: "slide-left", name: "Slide Left", type: "slide" as const, duration: 500, easing: "ease-out" as const, params: { direction: "left", overlap: true } },
  { id: "slide-right", name: "Slide Right", type: "slide" as const, duration: 500, easing: "ease-out" as const, params: { direction: "right", overlap: true } },
  { id: "push-left", name: "Push Left", type: "push" as const, duration: 500, easing: "ease-in-out" as const, params: { direction: "left" } },
  { id: "zoom-in", name: "Zoom In", type: "zoom" as const, duration: 600, easing: "ease-in" as const, params: { scale: 2, origin: { x: 0.5, y: 0.5 }, zoomIn: true } },
  { id: "zoom-out", name: "Zoom Out", type: "zoom" as const, duration: 600, easing: "ease-out" as const, params: { scale: 0.5, origin: { x: 0.5, y: 0.5 }, zoomIn: false } },
  { id: "iris-circle", name: "Iris Circle", type: "iris" as const, duration: 700, easing: "ease-in-out" as const, params: { shape: "circle", origin: { x: 0.5, y: 0.5 }, openToClose: false } },
  { id: "blur-dissolve", name: "Blur Dissolve", type: "blur" as const, duration: 600, easing: "ease-in-out" as const, params: { blurAmount: 20 } },
] as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateTransition(data: unknown): Transition {
  return TransitionSchema.parse(data);
}

export function clampTransitionDuration(duration: number, type: TransitionType): number {
  const bounds = TRANSITION_DURATION[type] ?? TRANSITION_DURATION;
  return Math.max(bounds.min, Math.min(bounds.max, duration));
}
