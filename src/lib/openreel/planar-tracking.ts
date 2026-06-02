import type { MonetEDL, PlanarTrack, TextOverlay } from "@/server/types/edl";

export function addDemoPlanarTextOverlay(edl: MonetEDL, text: string): MonetEDL {
  const firstShot = edl.shots[0];
  if (!firstShot) {
    return edl;
  }

  const clipId = firstShot.source.clipId;
  const sourceStart = firstShot.source.inPoint;
  const sourceEnd = firstShot.source.inPoint + Math.min(8, firstShot.timing.duration);

  const track: PlanarTrack = {
    id: `planar-track-${clipId}-${Date.now()}`,
    clipId,
    keyframes: [
      {
        time: sourceStart,
        corners: [
          { x: -0.45, y: -0.28 },
          { x: -0.05, y: -0.3 },
          { x: -0.03, y: -0.02 },
          { x: -0.47, y: 0.0 },
        ],
        confidence: 0.7,
      },
      {
        time: sourceEnd,
        corners: [
          { x: -0.28, y: -0.25 },
          { x: 0.08, y: -0.29 },
          { x: 0.11, y: 0.01 },
          { x: -0.31, y: 0.05 },
        ],
        confidence: 0.7,
      },
    ],
  };

  const overlay: TextOverlay = {
    id: `planar-overlay-${Date.now()}`,
    text,
    startTime: firstShot.timing.startTime,
    endTime: Math.min(edl.timeline.duration, firstShot.timing.startTime + Math.min(8, firstShot.timing.duration)),
    style: {
      fontSize: 36,
      color: "#fef08a",
      weight: "800",
      shadow: true,
    },
    tracking: {
      trackId: track.id,
      mode: "planar",
    },
  };

  return {
    ...edl,
    planarTracks: [...(edl.planarTracks ?? []), track],
    textOverlays: [...(edl.textOverlays ?? []), overlay],
  };
}
