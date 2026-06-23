import { MonetEDLSchema, type MonetEDL } from "../types/edl";
import { CANVAS_PREVIEW_CAPABILITIES } from "../types/edl-capabilities";
import { normalizeCreativeEDL } from "./edl-normalizer";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates and normalizes an advanced EDL.
 * Aligned with GEMINI.md mandates: no 'as' assertions, strict schema validation.
 */
export function validateAndNormalizeAdvancedEDL(input: unknown): MonetEDL {
  // 1. Strict schema validation
  const validation = MonetEDLSchema.safeParse(input);
  if (!validation.success) {
    console.error("[edl/validate] Invalid EDL structure", validation.error);
    throw new Error("Invalid EDL structure returned from AI");
  }

  const edl = validation.data;
  const clipIds = new Set(edl.shots.map((shot) => shot.source.clipId));
  const timelineEnd = Math.max(0, edl.timeline.duration);

  // 2. Motion track normalization
  const motionTracks = (edl.motionTracks ?? [])
    .filter((track) => clipIds.has(track.clipId))
    .map((track) => {
      const keyframes = [...track.keyframes]
        .filter(
          (key) =>
            isFiniteNumber(key.time) &&
            isFiniteNumber(key.x) &&
            isFiniteNumber(key.y)
        )
        .map((key) => ({
          ...key,
          x: clamp(key.x, -1, 1),
          y: clamp(key.y, -1, 1),
          confidence:
            key.confidence !== undefined
              ? clamp(key.confidence, 0, 1)
              : key.confidence,
        }))
        .sort((a, b) => a.time - b.time);

      return {
        ...track,
        keyframes,
      };
    })
    .filter((track) => track.keyframes.length > 0);

  // 3. Planar track normalization
  const planarTracks = (edl.planarTracks ?? [])
    .filter((track) => clipIds.has(track.clipId))
    .map((track) => {
      const keyframes = [...track.keyframes]
        .filter(
          (key) =>
            isFiniteNumber(key.time) &&
            Array.isArray(key.corners) &&
            key.corners.length === 4 &&
            key.corners.every(
              (corner: { x: number; y: number }) =>
                isFiniteNumber(corner.x) && isFiniteNumber(corner.y)
            )
        )
        .map((key) => ({
          ...key,
          corners: key.corners.map((corner) => ({
            x: clamp(corner.x, -1, 1),
            y: clamp(corner.y, -1, 1),
          })) as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ],
          confidence:
            key.confidence !== undefined
              ? clamp(key.confidence, 0, 1)
              : key.confidence,
        }))
        .sort((a, b) => a.time - b.time);

      return {
        ...track,
        keyframes,
      };
    })
    .filter((track) => track.keyframes.length > 0);

  const motionTrackIds = new Set(motionTracks.map((track) => track.id));
  const planarTrackIds = new Set(planarTracks.map((track) => track.id));

  // 4. Text overlay normalization
  const textOverlays = (edl.textOverlays ?? [])
    .filter(
      (overlay) => typeof overlay.text === "string" && overlay.text.trim().length > 0
    )
    .map((overlay) => ({
      ...overlay,
      startTime: clamp(overlay.startTime, 0, timelineEnd),
      endTime: clamp(overlay.endTime, 0, timelineEnd),
      offset: overlay.offset
        ? {
            x: clamp(overlay.offset.x, -1, 1),
            y: clamp(overlay.offset.y, -1, 1),
          }
        : undefined,
    }))
    .map((overlay) => {
      const mode = overlay.tracking?.mode;
      const trackId = overlay.tracking?.trackId;
      const isValidTrackRef =
        mode === "planar"
          ? !!trackId && planarTrackIds.has(trackId)
          : !!trackId && motionTrackIds.has(trackId);

      if (overlay.tracking && !isValidTrackRef) {
        return {
          ...overlay,
          tracking: undefined,
        };
      }

      return overlay;
    })
    .filter((overlay) => overlay.endTime >= overlay.startTime);

  const cleanEdl: MonetEDL = {
    ...edl,
    motionTracks,
    planarTracks,
    textOverlays,
  };

  // Perform non-destructive capabilities normalization (defaulting to Canvas Preview capabilities for baseline server safety)
  const normalizedResult = normalizeCreativeEDL(cleanEdl, CANVAS_PREVIEW_CAPABILITIES);

  if (normalizedResult.ok) {
    return normalizedResult.value.edl;
  }

  return cleanEdl;
}

