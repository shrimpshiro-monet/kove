/**
 * Chroma Key Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/video/chroma-key-engine.ts
 *                 apps/kove-advanced/packages/core/src/types/effects.ts (chromaKey params)
 *
 * Defines green screen / blue screen removal parameters.
 */
import { z } from "zod";

// ── Chroma Key Params ───────────────────────────────────────────────────────

export const ChromaKeyParamsSchema = z.object({
  keyColor: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255),
  }).describe("The color to key out (remove)"),
  tolerance: z.number().min(0).max(1).default(0.3).describe("How much color variation to accept"),
  edgeSoftness: z.number().min(0).max(1).default(0.1).describe("Softness of the key edge"),
  spillSuppression: z.number().min(0).max(1).default(0.5).describe("Remove color spill from foreground"),
});
export type ChromaKeyParams = z.infer<typeof ChromaKeyParamsSchema>;

// ── Common Key Colors ───────────────────────────────────────────────────────

export const CHROMA_KEY_COLORS = {
  "green": { r: 0, g: 255, b: 0 },
  "blue": { r: 0, g: 0, b: 255 },
  "white": { r: 255, g: 255, b: 255 },
  "black": { r: 0, g: 0, b: 0 },
} as const;

// ── Presets ─────────────────────────────────────────────────────────────────

export const CHROMA_KEY_PRESETS = {
  "green-screen": {
    keyColor: CHROMA_KEY_COLORS.green,
    tolerance: 0.3,
    edgeSoftness: 0.1,
    spillSuppression: 0.5,
  },
  "blue-screen": {
    keyColor: CHROMA_KEY_COLORS.blue,
    tolerance: 0.3,
    edgeSoftness: 0.1,
    spillSuppression: 0.5,
  },
  "green-tight": {
    keyColor: CHROMA_KEY_COLORS.green,
    tolerance: 0.15,
    edgeSoftness: 0.05,
    spillSuppression: 0.7,
  },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateChromaKey(data: unknown): ChromaKeyParams {
  return ChromaKeyParamsSchema.parse(data);
}
