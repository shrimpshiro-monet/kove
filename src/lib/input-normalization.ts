/**
 * Input Normalization Service
 *
 * Determines optimal output settings (resolution, aspect ratio, FPS, color space)
 * based on the collection of input clips. This ensures consistent internal
 * representation regardless of input format.
 *
 * Handles: mixed resolutions, vertical/horizontal, 24/30/60fps, rotation.
 */

export interface ClipMetadata {
  clipId: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  rotation: number;
  codec?: string;
  mimeType?: string;
}

export interface NormalizationResult {
  /** Output resolution for the timeline */
  resolution: { width: number; height: number };
  /** Timeline FPS — highest common factor of inputs */
  fps: number;
  /** Detected dominant aspect ratio category */
  aspectCategory: "landscape" | "portrait" | "square" | "ultrawide";
  /** Normalized aspect ratio (width/height) */
  aspectRatio: number;
  /** Whether rotation correction is needed per clip */
  needsRotationCorrection: boolean;
  /** Per-clip normalization instructions */
  clipAdjustments: Map<string, ClipAdjustment>;
  /** Human-readable summary for logging */
  summary: string;
}

export interface ClipAdjustment {
  clipId: string;
  /** Whether this clip needs rotation */
  rotation: number;
  /** Whether this clip's aspect differs from output */
  needsAspectCorrection: boolean;
  /** Scale factor relative to output */
  scaleFactor: number;
  /** Whether the clip needs downscaling */
  needsDownscale: boolean;
}

// Common broadcast resolutions with their aspect ratios
const STANDARD_RESOLUTIONS = [
  { width: 1920, height: 1080, aspect: 16 / 9, label: "1080p landscape" },
  { width: 1080, height: 1920, aspect: 9 / 16, label: "1080p portrait" },
  { width: 1280, height: 720, aspect: 16 / 9, label: "720p landscape" },
  { width: 720, height: 1280, aspect: 9 / 16, label: "720p portrait" },
  { width: 1080, height: 1080, aspect: 1, label: "1080p square" },
  { width: 3840, height: 2160, aspect: 16 / 9, label: "4K landscape" },
  { width: 2560, height: 1440, aspect: 16 / 9, label: "1440p landscape" },
  { width: 2160, height: 3840, aspect: 9 / 16, label: "4K portrait" },
];

// Maximum output resolution per tier
const TIER_MAX_RESOLUTION: Record<string, { width: number; height: number }> = {
  free: { width: 1920, height: 1080 },
  pro: { width: 3840, height: 2160 },
  enterprise: { width: 3840, height: 2160 },
};

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function snapToFps(measured: number): number {
  const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  let best = 30;
  let bestDist = Infinity;
  for (const fps of common) {
    const dist = Math.abs(measured - fps);
    if (dist < bestDist) {
      bestDist = dist;
      best = fps;
    }
  }
  return bestDist / measured < 0.15 ? best : Math.round(measured);
}

function classifyAspect(aspectRatio: number): "landscape" | "portrait" | "square" | "ultrawide" {
  if (aspectRatio > 2.0) return "ultrawide";
  if (aspectRatio > 1.05) return "landscape";
  if (aspectRatio < 0.95) return "portrait";
  return "square";
}

function findBestOutputResolution(
  clips: ClipMetadata[],
  tier: string = "free"
): { width: number; height: number; aspectCategory: "landscape" | "portrait" | "square" | "ultrawide" } {
  if (clips.length === 0) {
    return { width: 1920, height: 1080, aspectCategory: "landscape" };
  }

  // Determine dominant orientation
  let portraitCount = 0;
  let landscapeCount = 0;
  let squareCount = 0;
  let ultrawideCount = 0;

  for (const clip of clips) {
    const w = clip.rotation === 90 || clip.rotation === 270 ? clip.height : clip.width;
    const h = clip.rotation === 90 || clip.rotation === 270 ? clip.width : clip.height;
    const cat = classifyAspect(w / h);
    if (cat === "portrait") portraitCount++;
    else if (cat === "square") squareCount++;
    else if (cat === "ultrawide") ultrawideCount++;
    else landscapeCount++;
  }

  const dominant = Math.max(portraitCount, landscapeCount, squareCount, ultrawideCount);
  let aspectCategory: "landscape" | "portrait" | "square" | "ultrawide" = "landscape";
  if (dominant === portraitCount) aspectCategory = "portrait";
  else if (dominant === squareCount) aspectCategory = "square";
  else if (dominant === ultrawideCount) aspectCategory = "ultrawide";

  // Find the maximum pixel dimensions among clips (after rotation correction)
  let maxW = 1920;
  let maxH = 1080;
  for (const clip of clips) {
    const w = clip.rotation === 90 || clip.rotation === 270 ? clip.height : clip.width;
    const h = clip.rotation === 90 || clip.rotation === 270 ? clip.width : clip.height;
    maxW = Math.max(maxW, w);
    maxH = Math.max(maxH, h);
  }

  // Scale down to tier limit if needed
  const tierMax = TIER_MAX_RESOLUTION[tier] ?? TIER_MAX_RESOLUTION.free;

  // For the detected aspect category, pick the best standard resolution
  if (aspectCategory === "portrait") {
    // Portrait: height > width
    const height = Math.min(maxW, tierMax.height);
    const width = Math.round(height * (9 / 16));
    return { width, height, aspectCategory };
  }

  if (aspectCategory === "square") {
    const size = Math.min(Math.max(maxW, maxH), tierMax.height);
    return { width: size, height: size, aspectCategory };
  }

  if (aspectCategory === "ultrawide") {
    // Ultrawide: wider than 16:9
    const width = Math.min(maxW, tierMax.width);
    const height = Math.round(width / 2.35);
    return { width, height, aspectCategory };
  }

  // Landscape (default)
  const width = Math.min(maxW, tierMax.width);
  const height = Math.min(maxH, tierMax.height);
  return { width, height, aspectCategory };
}

/**
 * Compute optimal FPS from a collection of clips.
 * Uses the highest common standard FPS that all clips can be converted to.
 */
function computeOptimalFps(clips: ClipMetadata[]): number {
  if (clips.length === 0) return 30;

  const fpsValues = clips.map((c) => snapToFps(c.fps || 30));
  const maxFps = Math.max(...fpsValues);
  const minFps = Math.min(...fpsValues);

  // If all clips are the same standard FPS, use it
  if (maxFps === minFps) return maxFps;

  // If we have a mix of 24/30, use 30 (30 is divisible by both in terms of frame duplication)
  if (minFps <= 24 && maxFps >= 30) return 30;

  // If we have 30/60, use 30 (downconvert 60fps)
  if (minFps >= 30 && maxFps <= 60) return 30;

  // If we have 60fps only, use 60
  if (minFps >= 60) return 60;

  // Default: use the most common FPS or 30
  const counts = new Map<number, number>();
  for (const fps of fpsValues) {
    counts.set(fps, (counts.get(fps) ?? 0) + 1);
  }
  let bestFps = 30;
  let bestCount = 0;
  for (const [fps, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestFps = fps;
    }
  }
  return bestFps;
}

/**
 * Main normalization function.
 * Given a list of clip metadata, determines optimal output settings
 * and per-clip adjustments needed.
 */
export function normalizeInputs(
  clips: ClipMetadata[],
  opts?: { tier?: string; targetAspect?: "landscape" | "portrait" | "square" | "auto" }
): NormalizationResult {
  const tier = opts?.tier ?? "free";
  const targetAspect = opts?.targetAspect ?? "auto";

  // 1. Determine output resolution
  let output = findBestOutputResolution(clips, tier);

  // Override aspect if user specified one
  if (targetAspect === "landscape" && output.aspectCategory === "portrait") {
    output = { width: 1920, height: 1080, aspectCategory: "landscape" };
  } else if (targetAspect === "portrait" && output.aspectCategory === "landscape") {
    output = { width: 1080, height: 1920, aspectCategory: "portrait" };
  } else if (targetAspect === "square") {
    output = { width: 1080, height: 1080, aspectCategory: "square" };
  }

  // 2. Determine optimal FPS
  const fps = computeOptimalFps(clips);

  // 3. Check if any clip needs rotation
  const needsRotationCorrection = clips.some((c) => c.rotation !== 0);

  // 4. Compute per-clip adjustments
  const clipAdjustments = new Map<string, ClipAdjustment>();
  const outputAspect = output.width / output.height;

  for (const clip of clips) {
    const clipW = clip.rotation === 90 || clip.rotation === 270 ? clip.height : clip.width;
    const clipH = clip.rotation === 90 || clip.rotation === 270 ? clip.width : clip.height;
    const clipAspect = clipW / clipH;

    const needsAspectCorrection = Math.abs(clipAspect - outputAspect) > 0.05;
    const scaleFactor = Math.min(output.width / clipW, output.height / clipH);
    const needsDownscale = clipW > output.width || clipH > output.height;

    clipAdjustments.set(clip.clipId, {
      clipId: clip.clipId,
      rotation: clip.rotation,
      needsAspectCorrection,
      scaleFactor,
      needsDownscale,
    });
  }

  // 5. Build summary
  const summary = [
    `Output: ${output.width}x${output.height} (${output.aspectCategory})`,
    `FPS: ${fps}`,
    `Clips: ${clips.length}`,
    needsRotationCorrection ? "Rotation correction needed" : "No rotation",
    `Tier: ${tier}`,
  ].join(" | ");

  return {
    resolution: output,
    fps,
    aspectCategory: output.aspectCategory,
    aspectRatio: outputAspect,
    needsRotationCorrection,
    clipAdjustments,
    summary,
  };
}
