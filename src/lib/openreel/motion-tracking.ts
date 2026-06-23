import type { MonetEDL, MotionTrack, TextOverlay } from "@/server/types/edl";

function resolveNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { value?: unknown } | undefined;
    return resolveNumber(first?.value, defaultValue);
  }

  return defaultValue;
}

function resolvePoint(
  value: unknown,
  defaultValue: { x: number; y: number }
): { x: number; y: number } {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { value?: unknown } | undefined;
    return resolvePoint(first?.value, defaultValue);
  }

  if (typeof value === "object" && value !== null) {
    const point = value as { x?: unknown; y?: unknown };
    return {
      x: resolveNumber(point.x, defaultValue.x),
      y: resolveNumber(point.y, defaultValue.y),
    };
  }

  return defaultValue;
}

function createMotionTrackFromEDL(edl: MonetEDL, clipId: string): MotionTrack {
  const keyframes = edl.shots
    .filter((shot) => shot.source.clipId === clipId)
    .map((shot, index) => {
      const fallbackPosition = {
        x: -0.2 + index * 0.05,
        y: -0.25 + Math.sin(index * 0.6) * 0.08,
      };

      const position = resolvePoint(shot.transform?.position, fallbackPosition);

      return {
        time: shot.source.inPoint,
        x: position.x,
        y: position.y,
        scale: resolveNumber(shot.transform?.scale, 1),
        rotation: resolveNumber(shot.transform?.rotation, 0),
        confidence: 0.72,
      };
    });

  const fallback: MotionTrack["keyframes"] =
    keyframes.length > 0
      ? keyframes
      : [
          { time: 0, x: -0.2, y: -0.2, scale: 1, rotation: 0, confidence: 0.6 },
          {
            time: Math.max(1, edl.timeline.duration * 0.8),
            x: 0.18,
            y: -0.1,
            scale: 1,
            rotation: 0,
            confidence: 0.6,
          },
        ];

  return {
    id: `track-${clipId}-${Date.now()}`,
    clipId,
    method: "object",
    keyframes: fallback,
  };
}

export function addDemoTrackedTextOverlay(edl: MonetEDL, text: string): MonetEDL {
  const firstShot = edl.shots[0];
  if (!firstShot) {
    return edl;
  }

  const clipId = firstShot.source.clipId;
  const existingTrack = edl.motionTracks?.find((track) => track.clipId === clipId);
  const track = existingTrack ?? createMotionTrackFromEDL(edl, clipId);

  const overlay: TextOverlay = {
    id: `overlay-${Date.now()}`,
    text,
    startTime: 0,
    endTime: Math.min(edl.timeline.duration, 6),
    offset: { x: 0.08, y: -0.08 },
    style: {
      fontSize: 44,
      color: "#f8fafc",
      weight: "700",
      shadow: true,
    },
    tracking: {
      trackId: track.id,
      mode: "follow",
    },
  };

  return {
    ...edl,
    motionTracks: existingTrack ? edl.motionTracks : [...(edl.motionTracks ?? []), track],
    textOverlays: [...(edl.textOverlays ?? []), overlay],
  };
}