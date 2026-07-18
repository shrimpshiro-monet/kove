import { buildPath, resolvePath, DEFAULT_SMOOTH_CFG } from "@monet/edl";
import type { CropRect, SmoothCfg } from "@monet/edl";
import { TrackCache } from "./track-cache";

const trackCache = new TrackCache();
const pathCache = new Map<string, Float64Array>();

function cfgHash(cfg: SmoothCfg): string {
  return `${cfg.minCutoff}:${cfg.beta}:${cfg.dCutoff}:${cfg.gapDecayMs}`;
}

export async function ensureTrack(
  sourceAssetId: string,
  clipId: string,
  mediaUrl: string,
  duration: number,
): Promise<void> {
  const key = `${sourceAssetId}:mediapipe:1.0`;
  await trackCache.ensureTrack(key, clipId, sourceAssetId, mediaUrl, duration);
}

/**
 * @param sourceAssetId - The source asset ID
 * @param targetRatio - Target aspect ratio string (e.g. "9:16")
 * @param localTime - Time in seconds within the clip
 * @param lockedTrackId - Optional subject track ID to lock onto
 * @param cfg - Smoothing configuration
 * @returns Crop rect or null if no track available
 *
 * Note: The first call for a new (targetRatio, cfg, lockedTrackId) combo triggers
 * a lazy `buildPath()` (~1800-step Float64Array math, <5ms). This is a one-time
 * cost per unique combo — subsequent calls hit the path cache.
 */
export async function getCropForFrame(
  sourceAssetId: string,
  targetRatio: string,
  localTime: number,
  lockedTrackId?: number,
  cfg: SmoothCfg = DEFAULT_SMOOTH_CFG,
): Promise<CropRect | null> {
  const trackKey = `${sourceAssetId}:mediapipe:1.0`;
  const track = await trackCache.get(trackKey);
  if (!track) return null;

  const ratio = parseRatio(targetRatio);
  const pathKey = `${sourceAssetId}:${targetRatio}:${cfgHash(cfg)}:${lockedTrackId ?? "auto"}`;

  let path = pathCache.get(pathKey);
  if (!path) {
    path = buildPath(track, ratio, cfg, lockedTrackId);
    pathCache.set(pathKey, path);
  }

  return resolvePath(path, localTime);
}

function parseRatio(s: string): { w: number; h: number } {
  switch (s) {
    case "9:16": return { w: 9, h: 16 };
    case "1:1": return { w: 1, h: 1 };
    case "4:5": return { w: 4, h: 5 };
    case "16:9": return { w: 16, h: 9 };
    default: return { w: 16, h: 9 };
  }
}
