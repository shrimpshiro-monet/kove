export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

interface Clip {
  id: string;
  mediaId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  meta?: Record<string, unknown>;
}

interface Track {
  id: string;
  type: "video" | "audio" | "text" | "graphics";
  clips: Clip[];
  transitions: unknown[];
  locked: boolean;
  hidden: boolean;
}

interface Project {
  timeline: {
    tracks: Track[];
    duration: number;
    markers: unknown[];
  };
  mediaLibrary: {
    items: unknown[];
  };
  settings: {
    monet?: {
      edl?: unknown;
      lastSyncedAt?: number;
      syncVersion?: number;
    };
    [key: string]: unknown;
  };
  modifiedAt?: number;
}

interface AttachSpatialAnalysisParams {
  clipId: string;
  maskManifest?: unknown;
  depthManifest?: unknown;
  pointTrackManifest?: unknown;
}

interface ClipLookup {
  clip: Clip;
  track: Track;
}

interface MonetEDLClip {
  id: string;
  meta?: Record<string, unknown>;
  effects?: unknown[];
}

interface MonetEDLTrack {
  id: string;
  clips: MonetEDLClip[];
}

interface MonetEDL {
  version: 1;
  timeline: {
    tracks: MonetEDLTrack[];
  };
  meta?: {
    updatedAt?: number;
    [key: string]: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isManifestLike(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.clipId) &&
    isNonEmptyString(value.mediaId) &&
    Array.isArray(value.frames)
  );
}

function getEmbeddedEDL(project: Project): MonetEDL | null {
  const edl = project.settings.monet?.edl;

  if (!isRecord(edl)) return null;
  if (edl.version !== 1) return null;
  if (!isRecord(edl.timeline)) return null;
  if (!Array.isArray(edl.timeline.tracks)) return null;

  return edl as unknown as MonetEDL;
}

function findClipInProject(project: Project, clipId: string): ClipLookup | null {
  const clipMap = new Map<string, ClipLookup>();

  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      clipMap.set(clip.id, { clip, track });
    }
  }

  return clipMap.get(clipId) ?? null;
}

function findClipInEDL(edl: MonetEDL, clipId: string): MonetEDLClip | null {
  const clipMap = new Map<string, MonetEDLClip>();

  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      clipMap.set(clip.id, clip);
    }
  }

  return clipMap.get(clipId) ?? null;
}

function ensureMeta(clip: { meta?: Record<string, unknown> }): Record<string, unknown> {
  if (!isRecord(clip.meta)) {
    clip.meta = {};
  }

  return clip.meta;
}

function buildSpatialPayload(params: AttachSpatialAnalysisParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    updatedAt: Date.now(),
  };

  if (params.maskManifest !== undefined) {
    payload.maskManifest = params.maskManifest;
  }

  if (params.depthManifest !== undefined) {
    payload.depthManifest = params.depthManifest;
  }

  if (params.pointTrackManifest !== undefined) {
    payload.pointTrackManifest = params.pointTrackManifest;
  }

  return payload;
}

function parseParams(params: Record<string, unknown>): ActionResult<AttachSpatialAnalysisParams> {
  const clipId = params.clipId;

  if (!isNonEmptyString(clipId)) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_ID",
        message: "clipId must be a non-empty string",
      },
    };
  }

  if (!isManifestLike(params.maskManifest)) {
    return {
      success: false,
      error: {
        code: "INVALID_MASK_MANIFEST",
        message: "maskManifest must be a valid spatial manifest",
      },
    };
  }

  if (!isManifestLike(params.depthManifest)) {
    return {
      success: false,
      error: {
        code: "INVALID_DEPTH_MANIFEST",
        message: "depthManifest must be a valid spatial manifest",
      },
    };
  }

  if (!isManifestLike(params.pointTrackManifest)) {
    return {
      success: false,
      error: {
        code: "INVALID_POINT_TRACK_MANIFEST",
        message: "pointTrackManifest must be a valid spatial manifest",
      },
    };
  }

  return {
    success: true,
    data: {
      clipId,
      maskManifest: params.maskManifest,
      depthManifest: params.depthManifest,
      pointTrackManifest: params.pointTrackManifest,
    },
  };
}

export async function attachSpatialAnalysisAction(
  params: Record<string, unknown>,
  project: Project
): Promise<ActionResult<{ clipId: string; attached: string[] }>> {
  try {
    const parsed = parseParams(params);

    if (!parsed.success || !parsed.data) {
      return {
        success: false,
        error: parsed.error ?? {
          code: "INVALID_PARAMS",
          message: "Invalid spatial analysis params",
        },
      };
    }

    const lookup = findClipInProject(project, parsed.data.clipId);

    if (!lookup) {
      return {
        success: false,
        error: {
          code: "CLIP_NOT_FOUND",
          message: `Clip ${parsed.data.clipId} does not exist in project timeline`,
        },
      };
    }

    const edl = getEmbeddedEDL(project);

    if (!edl) {
      return {
        success: false,
        error: {
          code: "MONET_EDL_MISSING",
          message: "Project does not contain embedded MonetEDL",
        },
      };
    }

    const edlClip = findClipInEDL(edl, parsed.data.clipId);

    if (!edlClip) {
      return {
        success: false,
        error: {
          code: "EDL_CLIP_NOT_FOUND",
          message: `Clip ${parsed.data.clipId} does not exist in embedded MonetEDL`,
        },
      };
    }

    const spatialPayload = buildSpatialPayload(parsed.data);
    const attached: string[] = [];

    if (parsed.data.maskManifest !== undefined) attached.push("maskManifest");
    if (parsed.data.depthManifest !== undefined) attached.push("depthManifest");
    if (parsed.data.pointTrackManifest !== undefined) attached.push("pointTrackManifest");

    if (attached.length === 0) {
      return {
        success: false,
        error: {
          code: "NO_SPATIAL_DATA",
          message: "At least one spatial manifest is required",
        },
      };
    }

    const clipMeta = ensureMeta(lookup.clip);
    clipMeta.monetSpatial = {
      ...(isRecord(clipMeta.monetSpatial) ? clipMeta.monetSpatial : {}),
      ...spatialPayload,
    };

    const edlMeta = ensureMeta(edlClip);
    edlMeta.monetSpatial = {
      ...(isRecord(edlMeta.monetSpatial) ? edlMeta.monetSpatial : {}),
      ...spatialPayload,
    };

    if (!isRecord(edl.meta)) {
      edl.meta = {};
    }

    edl.meta.updatedAt = Date.now();

    project.settings.monet = {
      ...(project.settings.monet ?? {}),
      edl,
      lastSyncedAt: Date.now(),
      syncVersion: (project.settings.monet?.syncVersion ?? 0) + 1,
    };

    project.modifiedAt = Date.now();

    return {
      success: true,
      data: {
        clipId: parsed.data.clipId,
        attached,
      },
    };
  } catch (error) {
    console.error("[monet-spatial-actions] attachSpatialAnalysisAction failed", {
      error,
      clipId: params.clipId,
    });

    return {
      success: false,
      error: {
        code: "ATTACH_SPATIAL_ANALYSIS_FAILED",
        message: "Failed to attach spatial analysis to clip",
      },
    };
  }
}
