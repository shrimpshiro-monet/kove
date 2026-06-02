import type { MonetEDL } from "../types/edl";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateAndNormalizeAdvancedEDL(edl: MonetEDL): MonetEDL {
  const clipIds = new Set(edl.shots.map((shot) => shot.source.clipId));
  const timelineEnd = Math.max(0, edl.timeline.duration);

  const motionTracks = (edl.motionTracks ?? [])
    .filter((track) => clipIds.has(track.clipId))
    .map((track) => {
      const keyframes = [...track.keyframes]
        .filter((key) => isFiniteNumber(key.time) && isFiniteNumber(key.x) && isFiniteNumber(key.y))
        .map((key) => ({
          ...key,
          x: clamp(key.x, -1, 1),
          y: clamp(key.y, -1, 1),
          confidence: key.confidence !== undefined ? clamp(key.confidence, 0, 1) : key.confidence,
        }))
        .sort((a, b) => a.time - b.time);

      return {
        ...track,
        keyframes,
      };
    })
    .filter((track) => track.keyframes.length > 0);

  const planarTracks = (edl.planarTracks ?? [])
    .filter((track) => clipIds.has(track.clipId))
    .map((track) => {
      const keyframes = [...track.keyframes]
        .filter((key) =>
          isFiniteNumber(key.time) &&
          Array.isArray(key.corners) &&
          key.corners.length === 4 &&
          key.corners.every((corner) => isFiniteNumber(corner.x) && isFiniteNumber(corner.y))
        )
        .map((key) => ({
          ...key,
          corners: key.corners.map((corner) => ({
            x: clamp(corner.x, -1, 1),
            y: clamp(corner.y, -1, 1),
          })) as typeof key.corners,
          confidence: key.confidence !== undefined ? clamp(key.confidence, 0, 1) : key.confidence,
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

  const textOverlays = (edl.textOverlays ?? [])
    .filter((overlay) => typeof overlay.text === "string" && overlay.text.trim().length > 0)
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

  return {
    ...edl,
    motionTracks,
    planarTracks,
    textOverlays,
  };
}
