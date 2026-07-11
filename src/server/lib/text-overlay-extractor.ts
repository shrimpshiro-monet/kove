export interface DetectedTextOverlay {
  text: string;
  startTime: number;
  duration: number;
  position: "top" | "center" | "bottom";
  style: {
    fontSize: number;
    color: string;
    hasStroke: boolean;
    fontWeight: string;
  };
}

export function extractTextOverlays(
  detections: Array<{
    text: string;
    timestamp: number;
    position: string;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    isWhite: boolean;
    hasStroke: boolean;
    confidence: number;
  }>,
  fps: number = 30
): DetectedTextOverlay[] {
  if (detections.length === 0) return [];

  const sorted = [...detections].sort((a, b) => a.timestamp - b.timestamp);
  const overlays: DetectedTextOverlay[] = [];
  let current = sorted[0];
  let group = [current];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const sameText = next.text === current.text;
    const samePosition = next.position === current.position;
    const timeGap = next.timestamp - current.timestamp;

    if (sameText && samePosition && timeGap < 1.0) {
      group.push(next);
      current = next;
    } else {
      overlays.push(buildOverlay(group));
      group = [next];
      current = next;
    }
  }

  if (group.length > 0) {
    overlays.push(buildOverlay(group));
  }

  return overlays;
}

function buildOverlay(group: Array<{
  text: string;
  timestamp: number;
  position: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  isWhite: boolean;
  hasStroke: boolean;
  confidence: number;
}>): DetectedTextOverlay {
  const first = group[0];
  const last = group[group.length - 1];
  const avgWidth = group.reduce((s, d) => s + d.centerX, 0) / group.length;
  const fontSize = Math.round(group[0].height * 100);

  return {
    text: first.text,
    startTime: first.timestamp,
    duration: last.timestamp - first.timestamp + (1 / 30),
    position: first.position as "top" | "center" | "bottom",
    style: {
      fontSize: Math.max(12, Math.min(72, fontSize)),
      color: first.isWhite ? "#FFFFFF" : "#000000",
      hasStroke: first.hasStroke,
      fontWeight: first.height > 0.05 ? "bold" : "normal",
    },
  };
}