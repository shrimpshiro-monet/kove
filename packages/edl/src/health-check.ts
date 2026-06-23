import type { Clip, ProjectEDL as MonetEDL, Track } from "./schemas";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

export interface EDLHealthIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  clipId?: string;
  trackId?: string;
}

export interface EDLHealthReport {
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: EDLHealthIssue[];
}

export function checkEDLHealth(edl: MonetEDL): ActionResult<EDLHealthReport> {
  try {
    const issues: EDLHealthIssue[] = [];

    if (!edl || edl.version !== 1) {
      return {
        success: false,
        error: {
          code: "INVALID_EDL",
          message: "Expected MonetEDL version 1",
        },
      };
    }

    const assetIds = new Set<string>([
      ...Object.keys(edl.assets.media),
      ...Object.keys(edl.assets.audio),
      ...Object.keys(edl.assets.overlays),
    ]);

    const clipIdSet = new Set<string>();

    for (const track of edl.timeline.tracks) {
      inspectTrack(track, issues);

      for (const clip of track.clips) {
        inspectClip(track, clip, assetIds, clipIdSet, issues);
      }
    }

    const errorCount = issues.filter((issue) => issue.severity === "error").length;
    const warningCount = issues.filter((issue) => issue.severity === "warning").length;

    return {
      success: true,
      data: {
        issueCount: issues.length,
        errorCount,
        warningCount,
        issues,
      },
    };
  } catch (error) {
    console.error("[edl-health-check] failed", {
      error,
      edlId: edl?.id,
    });

    return {
      success: false,
      error: {
        code: "EDL_HEALTH_CHECK_FAILED",
        message: "Failed to check EDL health",
      },
    };
  }
}

function inspectTrack(track: Track, issues: EDLHealthIssue[]): void {
  if (!track.id || track.id.trim().length === 0) {
    issues.push({
      severity: "error",
      code: "TRACK_ID_MISSING",
      message: "Track is missing id",
    });
  }

  if (!Array.isArray(track.clips)) {
    issues.push({
      severity: "error",
      code: "TRACK_CLIPS_INVALID",
      message: `Track ${track.id} clips must be an array`,
      trackId: track.id,
    });
  }
}

function inspectClip(
  track: Track,
  clip: Clip,
  assetIds: Set<string>,
  clipIdSet: Set<string>,
  issues: EDLHealthIssue[]
): void {
  if (!clip.id || clip.id.trim().length === 0) {
    issues.push({
      severity: "error",
      code: "CLIP_ID_MISSING",
      message: `Clip in track ${track.id} is missing id`,
      trackId: track.id,
    });
    return;
  }

  if (clipIdSet.has(clip.id)) {
    issues.push({
      severity: "error",
      code: "DUPLICATE_CLIP_ID",
      message: `Duplicate clip id ${clip.id}`,
      clipId: clip.id,
      trackId: track.id,
    });
  }

  clipIdSet.add(clip.id);

  if (!assetIds.has(clip.mediaId)) {
    issues.push({
      severity: "error",
      code: "MISSING_ASSET",
      message: `Clip ${clip.id} references missing asset ${clip.mediaId}`,
      clipId: clip.id,
      trackId: track.id,
    });
  }

  if (!Number.isFinite(clip.startTime) || clip.startTime < 0) {
    issues.push({
      severity: "error",
      code: "INVALID_START_TIME",
      message: `Clip ${clip.id} has invalid startTime`,
      clipId: clip.id,
      trackId: track.id,
    });
  }

  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    issues.push({
      severity: "error",
      code: "INVALID_DURATION",
      message: `Clip ${clip.id} has invalid duration`,
      clipId: clip.id,
      trackId: track.id,
    });
  }

  if (clip.duration > 0 && clip.duration < 0.3) {
    issues.push({
      severity: "warning",
      code: "VERY_SHORT_CLIP",
      message: `Clip ${clip.id} is shorter than 0.3s`,
      clipId: clip.id,
      trackId: track.id,
    });
  }

  if (!Number.isFinite(clip.speed) || clip.speed <= 0) {
    issues.push({
      severity: "error",
      code: "INVALID_SPEED",
      message: `Clip ${clip.id} has invalid speed`,
      clipId: clip.id,
      trackId: track.id,
    });
  }

  if (clip.outPoint <= clip.inPoint) {
    issues.push({
      severity: "error",
      code: "INVALID_IN_OUT",
      message: `Clip ${clip.id} has invalid in/out range`,
      clipId: clip.id,
      trackId: track.id,
    });
  }
}