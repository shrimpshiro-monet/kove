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

interface EnforceMinimumClipDurationParams {
  minDuration: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProject(value: unknown): value is Project {
  if (!isRecord(value)) return false;
  if (!isRecord(value.timeline)) return false;
  if (!Array.isArray(value.timeline.tracks)) return false;

  return true;
}

function isValidMinDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.1 && value <= 3;
}

function calculateTimelineDuration(project: Project): number {
  let maxDuration = 0;

  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;

      if (end > maxDuration) {
        maxDuration = end;
      }
    }
  }

  return Math.round(maxDuration * 1000) / 1000;
}

export async function enforceMinimumClipDurationAction(
  params: EnforceMinimumClipDurationParams,
  project: Project
): Promise<
  ActionResult<{
    changedClipIds: string[];
    minDuration: number;
  }>
> {
  try {
    if (!isProject(project)) {
      return {
        success: false,
        error: {
          code: "INVALID_PROJECT",
          message: "Project is invalid",
        },
      };
    }

    if (!isValidMinDuration(params.minDuration)) {
      return {
        success: false,
        error: {
          code: "INVALID_MIN_DURATION",
          message: "minDuration must be between 0.1 and 3 seconds",
        },
      };
    }

    const changedClipIds: string[] = [];
    const minDuration = params.minDuration;

    for (const track of project.timeline.tracks) {
      if (track.locked) {
        continue;
      }

      const sortedClips = track.clips
        .slice()
        .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));

      for (let index = 0; index < sortedClips.length; index += 1) {
        const clip = sortedClips[index];

        if (!clip) {
          return {
            success: false,
            error: {
              code: "CLIP_LOOKUP_FAILED",
              message: `Clip lookup failed in track ${track.id}`,
            },
          };
        }

        if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
          return {
            success: false,
            error: {
              code: "INVALID_CLIP_DURATION",
              message: `Clip ${clip.id} has invalid duration`,
            },
          };
        }

        if (clip.duration >= minDuration) {
          continue;
        }

        const nextClip = sortedClips[index + 1];
        const maxDurationBeforeNext =
          nextClip !== undefined ? Math.max(0.01, nextClip.startTime - clip.startTime) : minDuration;

        const nextDuration = Math.min(minDuration, maxDurationBeforeNext);

        if (nextDuration <= clip.duration) {
          continue;
        }

        const durationDelta = nextDuration - clip.duration;
        clip.duration = Math.round(nextDuration * 1000) / 1000;
        clip.outPoint = Math.round((clip.outPoint + durationDelta * clip.speed) * 1000) / 1000;

        clip.meta = {
          ...(isRecord(clip.meta) ? clip.meta : {}),
          monetMinimumDurationApplied: true,
          monetMinimumDuration: minDuration,
        };

        changedClipIds.push(clip.id);
      }
    }

    project.timeline.duration = calculateTimelineDuration(project);
    project.modifiedAt = Date.now();

    return {
      success: true,
      data: {
        changedClipIds,
        minDuration,
      },
    };
  } catch (error) {
    console.error("[monet-timeline-guards] enforceMinimumClipDurationAction failed", {
      error,
    });

    return {
      success: false,
      error: {
        code: "MIN_DURATION_GUARD_FAILED",
        message: "Failed to enforce minimum clip duration",
      },
    };
  }
}