import { buildPath, resolvePath } from "../build-path.js";
import type { SubjectTrack } from "../types.js";

function makeTrack(duration: number, frames: Partial<SubjectTrack> = {}): SubjectTrack {
  return {
    clipId: "test",
    sourceAssetId: "test-src",
    model: "mediapipe",
    createdAt: Date.now(),
    duration,
    fps: 30,
    detections: [],
    gapPolicy: "hold-last",
    ...frames,
  };
}

const empty = buildPath(makeTrack(5), { w: 9, h: 16 });
console.assert(empty.length === 0, "empty track should produce empty path");
const resolved = resolvePath(empty, 1.0);
console.assert(resolved === null, "empty path resolve should be null");

const singleTrack = makeTrack(5, {
  detections: [{ time: 0, frame: 0, bbox: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, centerX: 0.35, centerY: 0.35 }, source: "mediapipe", confidence: 0.9, trackId: 1, label: "face" }],
});
const singlePath = buildPath(singleTrack, { w: 9, h: 16 });
console.assert(singlePath.length > 0, "valid track should produce a path");
const crop = resolvePath(singlePath, 2.5);
console.assert(crop !== null, "should resolve to a crop");
if (!crop) process.exit(1);
console.assert(crop.x >= 0 && crop.x <= 1, "crop x in bounds");
console.assert(crop.y >= 0 && crop.y <= 1, "crop y in bounds");
console.assert(crop.width > 0 && crop.width <= 1, "crop width in bounds");
console.assert(crop.height > 0 && crop.height <= 1, "crop height in bounds");

const orderedPath = buildPath(singleTrack, { w: 9, h: 16 });
const r1 = resolvePath(orderedPath, 1.0)!;
const r2 = resolvePath(orderedPath, 2.0)!;
const revPath = buildPath(singleTrack, { w: 9, h: 16 });
const rev2 = resolvePath(revPath, 2.0)!;
const rev1 = resolvePath(revPath, 1.0)!;
console.assert(
  Math.abs(r1.x - rev1.x) < 0.001 && Math.abs(r2.x - rev2.x) < 0.001,
  "resolve must be order-independent"
);

console.log("All build-path tests passed");
