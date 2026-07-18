import type { SubjectTrackFrame, SubjectBBox } from "../analysis-types.js";

interface MediaPipeFace {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  categories?: { score: number; categoryName?: string }[];
}

export function normalizeMediaPipeFace(
  face: MediaPipeFace,
  frameIndex: number,
  time: number,
  frameWidth: number,
  frameHeight: number,
  trackId: number,
): SubjectTrackFrame {
  const rawX = face.boundingBox?.originX ?? 0;
  const rawY = face.boundingBox?.originY ?? 0;
  const rawW = face.boundingBox?.width ?? 0;
  const rawH = face.boundingBox?.height ?? 0;

  const x = rawX / frameWidth;
  const y = rawY / frameHeight;
  const width = rawW / frameWidth;
  const height = rawH / frameHeight;

  return {
    time,
    frame: frameIndex,
    bbox: { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 },
    source: "mediapipe",
    confidence: face.categories?.[0]?.score ?? 0,
    trackId,
    label: "face",
  };
}

export function iou(a: SubjectBBox, b: SubjectBBox): number {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const union = aArea + bArea - intersection;
  return union > 0 ? intersection / union : 0;
}
