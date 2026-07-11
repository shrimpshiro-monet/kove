import type { ProjectEDL, Clip, MediaAsset } from "@monet/edl";

/**
 * Converts a server-generated shot-based EDL to the ProjectEDL format
 * that the web player (web-player.ts / timeline-resolver.ts) expects.
 *
 * Shot-based EDL shape:  { shots: [{ source: { clipId, inPoint, outPoint }, timing: { startTime, duration, speed } }] }
 * ProjectEDL shape:      { timeline: { tracks: [{ clips: [{ mediaId, startTime, ... }] }] }, assets: { media: { [id]: MediaAsset } } }
 */
export function convertShotEDLToProjectEDL(
  shotEdl: any,
  mediaUrlMap: Record<string, string> = {}
): ProjectEDL {
  const shots = shotEdl.shots ?? [];
  const duration = shotEdl.timeline?.duration ?? 0;
  const fps = shotEdl.timeline?.fps ?? 30;
  const resolution = shotEdl.timeline?.resolution ?? { width: 1920, height: 1080 };

  const assets: Record<string, MediaAsset> = {};
  const clips: Clip[] = [];

  // First pass: compute max outPoint per clipId to set correct asset duration
  const maxOutPointByClip: Record<string, number> = {};
  for (const shot of shots) {
    const clipId = shot.source?.clipId ?? shot.assetId ?? shot.id;
    if (!clipId) continue;
    const outPt = shot.source?.outPoint ?? 0;
    maxOutPointByClip[clipId] = Math.max(maxOutPointByClip[clipId] ?? 0, outPt);
  }

  for (const shot of shots) {
    // Accept both schemas: clipId (shot-based) and assetId (project-based)
    const clipId = shot.source?.clipId ?? shot.assetId ?? shot.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = shot.timing?.startTime ?? shot.start ?? 0;
    const shotDuration = shot.timing?.duration ?? shot.duration ?? Math.max((shot.source?.outPoint ?? 1) - (shot.source?.inPoint ?? 0), 0.01);
    const inPoint = shot.source?.inPoint ?? 0;
    const outPoint = shot.source?.outPoint ?? shotDuration;
    const speed = shot.timing?.speed ?? shot.speed ?? 1;

    // Build asset — accept both path and src
    if (!assets[clipId]) {
      const url = mediaUrlMap[clipId] ?? mediaUrlMap[shot.source?.clipId] ?? "";
      // Use max outPoint across all shots using this clip as the asset duration
      // This ensures the player can seek to any inPoint in the source footage
      const assetDuration = Math.max(shotDuration, maxOutPointByClip[clipId] ?? shotDuration);
      assets[clipId] = {
        id: clipId,
        path: url || (shot.src as string) || (shot.asset?.src as string) || "",
        duration: assetDuration,
        width: resolution.width,
        height: resolution.height,
      };
    }

    clips.push({
      id: shot.id ?? `clip-${clips.length}`,
      mediaId: clipId,
      startTime,
      duration: shotDuration,
      inPoint,
      outPoint,
      speed,
      transforms: {
        position: [{ time: 0, x: 0, y: 0 }],
        scale: [{ time: 0, value: 1 }],
        rotation: [{ time: 0, value: 0 }],
      },
      audio: { gain: 1 },
      effects: (shot.effects ?? []).map((fx: any) => ({
        id: fx.id ?? `fx-${Math.random().toString(36).slice(2, 8)}`,
        type: fx.type ?? "color_grade",
        start: fx.startTime ?? 0,
        duration: fx.duration ?? shotDuration,
        params: fx.params ?? {},
      })),
      meta: {
        ...shot.meta,
        aiRationale: shot.aiRationale,
        transition: shot.transition,
      },
    });
  }

  // Also add assets for any mediaUrlMap entries not already covered
  for (const [id, url] of Object.entries(mediaUrlMap)) {
    if (!assets[id]) {
      assets[id] = {
        id,
        path: url,
        duration: 0,
        width: resolution.width,
        height: resolution.height,
      };
    }
  }

  // [DEBUG-ROOTCAUSE] Stage 4: Post-conversion output
  console.log("[DEBUG-ROOTCAUSE] STAGE4_POST_CONVERSION", JSON.stringify({
    clipCount: clips.length,
    assetCount: Object.keys(assets).length,
    duration,
    sampleClipIds: clips.slice(0, 3).map((c) => c.id),
    sampleMediaIds: clips.slice(0, 3).map((c) => c.mediaId),
    sampleAssetPaths: Object.values(assets).slice(0, 3).map((a) => ({ id: a.id, path: a.path?.slice(0, 60) })),
    mediaUrlMapKeys: Object.keys(mediaUrlMap),
    mediaUrlMapSize: Object.keys(mediaUrlMap).length,
  }));

  return {
    version: 1,
    id: shotEdl.metadata?.projectId ?? shotEdl.id ?? `edl-${Date.now()}`,
    meta: {
      createdAt: shotEdl.metadata?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      aspectRatio: resolution.width > resolution.height ? "16:9" : "9:16",
      fps,
      sampleRate: 44100,
    },
    timeline: {
      duration,
      tracks: [
        {
          id: "video-main",
          type: "video",
          clips,
          order: 0,
          locked: false,
          hidden: false,
        },
      ],
      markers: [],
    },
    assets: {
      media: assets,
      audio: {},
      overlays: {},
    },
    // Preserve shots array for renderer compatibility
    shots: shotEdl.shots ?? [],
  } as ProjectEDL;
}
