/**
 * Beat Sync Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/audio/beat-detection-engine.ts
 *                 apps/web/src/engine/audio/beat-engine.ts
 *
 * Defines beat sync modes, BPM detection, and beat grid format.
 */
import { z } from "zod";

// ── Beat Sync Mode ──────────────────────────────────────────────────────────

export const BeatSyncModeSchema = z.enum([
  "cuts",
  "speed",
  "effects",
  "none",
]);
export type BeatSyncMode = z.infer<typeof BeatSyncModeSchema>;

// ── Beat Sync Params ────────────────────────────────────────────────────────

export const BeatSyncParamsSchema = z.object({
  mode: BeatSyncModeSchema.default("cuts"),
  sensitivity: z.number().min(0).max(1).default(0.5).describe("Beat detection sensitivity"),
  syncToDownbeats: z.boolean().default(true).describe("Align to downbeats instead of every beat"),
});
export type BeatSyncParams = z.infer<typeof BeatSyncParamsSchema>;

// ── Beat Grid ───────────────────────────────────────────────────────────────

export const BeatGridSchema = z.object({
  bpm: z.number().min(20).max(300),
  beats: z.array(z.number().min(0)).describe("Timestamps of each beat in seconds"),
  downbeats: z.array(z.number().min(0)).optional().describe("Timestamps of downbeats"),
  confidence: z.number().min(0).max(1).optional(),
  duration: z.number().min(0).describe("Total duration of the analyzed audio"),
});
export type BeatGrid = z.infer<typeof BeatGridSchema>;

// ── Beat Marker ─────────────────────────────────────────────────────────────

export const BeatMarkerSchema = z.object({
  time: z.number().min(0),
  strength: z.number().min(0).max(1),
  index: z.number().int().min(0),
  isDownbeat: z.boolean(),
});
export type BeatMarker = z.infer<typeof BeatMarkerSchema>;

// ── Timeline Beat Analysis ──────────────────────────────────────────────────

export const TimelineBeatAnalysisSchema = z.object({
  bpm: z.number().min(20).max(300),
  confidence: z.number().min(0).max(1),
  sourceClipId: z.string().optional(),
  analyzedAt: z.number(),
});
export type TimelineBeatAnalysis = z.infer<typeof TimelineBeatAnalysisSchema>;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateBeatSync(data: unknown): BeatSyncParams {
  return BeatSyncParamsSchema.parse(data);
}

export function validateBeatGrid(data: unknown): BeatGrid {
  return BeatGridSchema.parse(data);
}

export function findNearestBeat(beats: number[], time: number): { beat: number; index: number; offset: number } {
  let best = beats[0];
  let bestIndex = 0;
  let bestOffset = Math.abs(time - beats[0]);
  for (let i = 1; i < beats.length; i++) {
    const offset = Math.abs(time - beats[i]);
    if (offset < bestOffset) {
      best = beats[i];
      bestIndex = i;
      bestOffset = offset;
    }
  }
  return { beat: best, index: bestIndex, offset: time - best };
}
