/**
 * Subtitle Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/text/subtitle-engine.ts
 *                 apps/kove-advanced/packages/core/src/types/timeline.ts (Subtitle types)
 *
 * Defines subtitle format, styling, and word-level sync.
 */
import { z } from "zod";

// ── Caption Animation Style ─────────────────────────────────────────────────

export const CaptionAnimationStyleSchema = z.enum([
  "none",
  "word-highlight",
  "word-by-word",
  "karaoke",
  "bounce",
  "typewriter",
]);
export type CaptionAnimationStyle = z.infer<typeof CaptionAnimationStyleSchema>;

// ── Subtitle Style ──────────────────────────────────────────────────────────

export const SubtitleStyleSchema = z.object({
  fontFamily: z.string().default("Inter"),
  fontSize: z.number().min(8).max(200).default(32),
  color: z.string().default("#ffffff"),
  backgroundColor: z.string().default("rgba(0,0,0,0.7)"),
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  highlightColor: z.string().optional().describe("Color for active/highlighted word"),
  upcomingColor: z.string().optional().describe("Color for upcoming words"),
});
export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>;

// ── Subtitle Word ───────────────────────────────────────────────────────────

export const SubtitleWordSchema = z.object({
  text: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
});
export type SubtitleWord = z.infer<typeof SubtitleWordSchema>;

// ── Subtitle ────────────────────────────────────────────────────────────────

export const SubtitleSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  style: SubtitleStyleSchema.optional(),
  words: z.array(SubtitleWordSchema).optional().describe("Word-level timestamps for animation"),
  animationStyle: CaptionAnimationStyleSchema.default("none"),
});
export type Subtitle = z.infer<typeof SubtitleSchema>;

// ── Subtitle Track ──────────────────────────────────────────────────────────

export const SubtitleTrackSchema = z.object({
  id: z.string(),
  language: z.string().default("en"),
  style: SubtitleStyleSchema,
  subtitles: z.array(SubtitleSchema),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateSubtitle(data: unknown): Subtitle {
  return SubtitleSchema.parse(data);
}

export function validateSubtitleTrack(data: unknown): SubtitleTrack {
  return SubtitleTrackSchema.parse(data);
}
