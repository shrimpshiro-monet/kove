/**
 * Title Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/text/title-engine.ts
 *                 apps/kove-advanced/packages/core/src/text/types.ts
 *
 * Defines text overlay styles, positions, and title types.
 */
import { z } from "zod";

// ── Font Weight ─────────────────────────────────────────────────────────────

export const FontWeightSchema = z.union([
  z.literal(100), z.literal(200), z.literal(300), z.literal(400),
  z.literal(500), z.literal(600), z.literal(700), z.literal(800), z.literal(900),
  z.enum(["normal", "bold"]),
]);
export type FontWeight = z.infer<typeof FontWeightSchema>;

// ── Text Align ──────────────────────────────────────────────────────────────

export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const VerticalAlignSchema = z.enum(["top", "middle", "bottom"]);
export type VerticalAlign = z.infer<typeof VerticalAlignSchema>;

// ── Text Style ──────────────────────────────────────────────────────────────

export const TextStyleSchema = z.object({
  fontFamily: z.string().default("Inter"),
  fontSize: z.number().min(8).max(400).default(48),
  fontWeight: FontWeightSchema.default("bold"),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  color: z.string().default("#ffffff"),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().min(0).max(20).optional(),
  shadowColor: z.string().optional(),
  shadowBlur: z.number().min(0).max(50).optional(),
  shadowOffsetX: z.number().min(-50).max(50).optional(),
  shadowOffsetY: z.number().min(-50).max(50).optional(),
  textAlign: TextAlignSchema.default("center"),
  verticalAlign: VerticalAlignSchema.default("middle"),
  lineHeight: z.number().min(0.5).max(3).default(1.2),
  letterSpacing: z.number().min(-10).max(20).default(0),
  textDecoration: z.enum(["none", "underline", "line-through", "overline"]).optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

// ── Text Position ───────────────────────────────────────────────────────────

export const TextPositionSchema = z.object({
  x: z.number().min(0).max(1).default(0.5).describe("Normalized 0-1"),
  y: z.number().min(0).max(1).default(0.5).describe("Normalized 0-1"),
});
export type TextPosition = z.infer<typeof TextPositionSchema>;

// ── Text Clip ───────────────────────────────────────────────────────────────

export const TextClipSchema = z.object({
  id: z.string(),
  text: z.string(),
  style: TextStyleSchema,
  position: TextPositionSchema,
  startTime: z.number().min(0),
  duration: z.number().min(0.1),
  behindSubject: z.boolean().default(false).describe("Render text behind the subject"),
});
export type TextClip = z.infer<typeof TextClipSchema>;

// ── Title Types ─────────────────────────────────────────────────────────────

export const TITLE_TYPES = {
  "lower-third": {
    position: { x: 0.1, y: 0.85 },
    style: { fontSize: 32, fontWeight: "bold", color: "#ffffff", backgroundColor: "rgba(0,0,0,0.7)", textAlign: "left" as const },
  },
  "center-title": {
    position: { x: 0.5, y: 0.5 },
    style: { fontSize: 64, fontWeight: "bold", color: "#ffffff", textAlign: "center" as const },
  },
  "top-banner": {
    position: { x: 0.5, y: 0.1 },
    style: { fontSize: 28, fontWeight: "600", color: "#ffffff", textAlign: "center" as const },
  },
  "subtitle": {
    position: { x: 0.5, y: 0.9 },
    style: { fontSize: 24, fontWeight: "normal", color: "#ffffff", textAlign: "center" as const },
  },
  "watermark": {
    position: { x: 0.95, y: 0.95 },
    style: { fontSize: 16, fontWeight: "normal", color: "rgba(255,255,255,0.5)", textAlign: "right" as const },
  },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateTextStyle(data: unknown): TextStyle {
  return TextStyleSchema.parse(data);
}

export function validateTextClip(data: unknown): TextClip {
  return TextClipSchema.parse(data);
}
