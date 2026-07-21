/**
 * Graphics Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/graphics/graphics-engine.ts
 *                 apps/kove-advanced/packages/core/src/graphics/types.ts
 *
 * Defines shapes, stickers, SVG overlays, and graphic animations.
 */
import { z } from "zod";

// ── Graphic Type ────────────────────────────────────────────────────────────

export const GraphicTypeSchema = z.enum(["shape", "svg", "sticker", "emoji"]);
export type GraphicType = z.infer<typeof GraphicTypeSchema>;

// ── Shape Type ──────────────────────────────────────────────────────────────

export const ShapeTypeSchema = z.enum([
  "rectangle", "circle", "ellipse", "triangle", "arrow", "line", "polygon", "star",
]);
export type ShapeType = z.infer<typeof ShapeTypeSchema>;

// ── Fill Style ──────────────────────────────────────────────────────────────

export const FillStyleSchema = z.object({
  type: z.enum(["solid", "gradient", "none"]).default("solid"),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).default(1),
  gradient: z.object({
    type: z.enum(["linear", "radial"]),
    angle: z.number().optional(),
    stops: z.array(z.object({ offset: z.number().min(0).max(1), color: z.string() })),
  }).optional(),
});
export type FillStyle = z.infer<typeof FillStyleSchema>;

// ── Stroke Style ────────────────────────────────────────────────────────────

export const StrokeStyleSchema = z.object({
  color: z.string().default("#000000"),
  width: z.number().min(0).max(50).default(1),
  opacity: z.number().min(0).max(1).default(1),
  dashArray: z.array(z.number()).optional(),
  lineCap: z.enum(["butt", "round", "square"]).optional(),
  lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
});
export type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

// ── Shape Style ─────────────────────────────────────────────────────────────

export const ShapeStyleSchema = z.object({
  fill: FillStyleSchema,
  stroke: StrokeStyleSchema,
  shadow: z.object({
    color: z.string().default("#000000"),
    blur: z.number().min(0).max(50).default(0),
    offsetX: z.number().min(-50).max(50).default(0),
    offsetY: z.number().min(-50).max(50).default(0),
  }).optional(),
  cornerRadius: z.number().min(0).max(100).optional(),
});
export type ShapeStyle = z.infer<typeof ShapeStyleSchema>;

// ── Graphic Animation ───────────────────────────────────────────────────────

export const GraphicAnimationTypeSchema = z.enum([
  "none", "fade", "slide-left", "slide-right", "slide-up", "slide-down",
  "scale", "rotate", "bounce", "pop", "draw", "wipe-left", "wipe-right",
  "wipe-up", "wipe-down", "reveal-center", "reveal-edges", "elastic",
  "flip-horizontal", "flip-vertical",
]);
export type GraphicAnimationType = z.infer<typeof GraphicAnimationTypeSchema>;

export const GraphicAnimationSchema = z.object({
  type: GraphicAnimationTypeSchema.default("none"),
  duration: z.number().min(0).max(5).default(0.5),
  easing: z.string().default("ease-out"),
});
export type GraphicAnimation = z.infer<typeof GraphicAnimationSchema>;

// ── Emphasis Animation ──────────────────────────────────────────────────────

export const EmphasisAnimationTypeSchema = z.enum([
  "none", "pulse", "shake", "bounce", "float", "spin", "flash",
  "heartbeat", "swing", "wobble", "jello", "rubber-band", "tada",
  "vibrate", "flicker", "glow", "breathe", "wave", "tilt",
  "zoom-pulse", "focus-zoom", "pan-left", "pan-right", "pan-up", "pan-down", "ken-burns",
]);
export type EmphasisAnimationType = z.infer<typeof EmphasisAnimationTypeSchema>;

export const EmphasisAnimationSchema = z.object({
  type: EmphasisAnimationTypeSchema.default("none"),
  speed: z.number().min(0.1).max(5).default(1),
  intensity: z.number().min(0).max(3).default(1),
  loop: z.boolean().default(true),
  focusPoint: z.object({ x: z.number(), y: z.number() }).optional(),
  zoomScale: z.number().optional(),
});
export type EmphasisAnimation = z.infer<typeof EmphasisAnimationSchema>;

// ── Graphic Clip ────────────────────────────────────────────────────────────

export const GraphicClipSchema = z.object({
  id: z.string(),
  type: GraphicTypeSchema,
  startTime: z.number().min(0),
  duration: z.number().min(0.1),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  scale: z.number().min(0.1).max(10).default(1),
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  animation: GraphicAnimationSchema.optional(),
  emphasis: EmphasisAnimationSchema.optional(),
});
export type GraphicClip = z.infer<typeof GraphicClipSchema>;

// ── Shape Clip ──────────────────────────────────────────────────────────────

export const ShapeClipSchema = GraphicClipSchema.extend({
  type: z.literal("shape"),
  shapeType: ShapeTypeSchema,
  style: ShapeStyleSchema,
});
export type ShapeClip = z.infer<typeof ShapeClipSchema>;

// ── SVG Clip ────────────────────────────────────────────────────────────────

export const SVGClipSchema = GraphicClipSchema.extend({
  type: z.literal("svg"),
  svgContent: z.string(),
  viewBox: z.object({ minX: z.number(), minY: z.number(), width: z.number(), height: z.number() }),
});
export type SVGClip = z.infer<typeof SVGClipSchema>;

// ── Sticker Clip ────────────────────────────────────────────────────────────

export const StickerClipSchema = GraphicClipSchema.extend({
  type: z.enum(["sticker", "emoji"]),
  imageUrl: z.string(),
  category: z.string().optional(),
  name: z.string().optional(),
});
export type StickerClip = z.infer<typeof StickerClipSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateGraphicClip(data: unknown): GraphicClip {
  return GraphicClipSchema.parse(data);
}

export function validateShapeClip(data: unknown): ShapeClip {
  return ShapeClipSchema.parse(data);
}
