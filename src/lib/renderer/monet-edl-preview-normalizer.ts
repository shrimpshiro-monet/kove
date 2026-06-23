import type { MonetEDL, Shot } from "../../server/types/edl";

export interface PreviewTimeResolution {
  timelineTime: number;
  duration: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function shotStart(shot: Shot): number {
  return readNumber(shot.timing?.startTime, 0);
}

function shotDuration(shot: Shot): number {
  return Math.max(0.05, readNumber(shot.timing?.duration, 1));
}

function shotEnd(shot: Shot): number {
  return shotStart(shot) + shotDuration(shot);
}

function calculateDuration(shots: Shot[], declaredDuration: number): number {
  const shotMax = shots.reduce((max, shot) => Math.max(max, shotEnd(shot)), 0);
  return Math.max(0.1, declaredDuration, shotMax);
}

export function findActiveShot(edl: MonetEDL, timelineTime: number): Shot | null {
  return edl.shots.find((shot) => {
    const start = shotStart(shot);
    const end = start + shotDuration(shot);
    return timelineTime >= start && timelineTime < end;
  }) || null;
}

export function getSourceTimeForShot(shot: any, timelineTime: number): number {
  const localTime = Math.max(0, timelineTime - shotStart(shot));
  const inPoint = readNumber(shot.source?.inPoint, 0);
  const duration = Math.max(0.001, readNumber(shot.timing?.duration, 0));
  const outPoint = readNumber(shot.source?.outPoint, inPoint + duration);

  let unclamped = 0;

  if (shot.timing?.speedRamp) {
    const startSpeed = Number(shot.timing.speedRamp.startSpeed ?? 1);
    const endSpeed = Number(shot.timing.speedRamp.endSpeed ?? startSpeed);

    const t = Math.max(0, Math.min(1, localTime / duration));
    const speedAtT = startSpeed + (endSpeed - startSpeed) * t;

    // Approximate integrated speed over local time.
    const averageSpeed = (startSpeed + speedAtT) / 2;

    unclamped = inPoint + localTime * averageSpeed;
  } else {
    const speed = Math.max(0.05, readNumber(shot.timing?.speed, 1));
    unclamped = inPoint + (localTime * speed);
  }

  return Math.max(inPoint, Math.min(outPoint, unclamped));
}

function normalizeFlatShot(rawShot: unknown, index: number): Shot | null {
  if (!isRecord(rawShot)) return null;

  const nestedSource = isRecord(rawShot.source) ? rawShot.source : undefined;
  const nestedTiming = isRecord(rawShot.timing) ? rawShot.timing : undefined;

  const clipId =
    readString(nestedSource?.clipId, "") ||
    readString(rawShot.clipId, "") ||
    readString(rawShot.mediaId, "");

  if (!clipId) {
    console.error("[MonetEDLPreviewNormalizer] Shot missing clipId", {
      index,
      rawShot,
    });
    return null;
  }

  const sourceStart = readNumber(nestedSource?.inPoint, Number.NaN);
  const sourceEnd = readNumber(nestedSource?.outPoint, Number.NaN);

  const inPoint = Number.isFinite(sourceStart)
    ? sourceStart
    : readNumber(rawShot.inPoint, readNumber(rawShot.sourceStart, 0));

  const duration = Math.max(
    0.05,
    readNumber(
      nestedTiming?.duration,
      readNumber(rawShot.duration, readNumber(rawShot.targetDuration, 1))
    )
  );

  const outPoint = Number.isFinite(sourceEnd)
    ? Math.max(inPoint + 0.01, sourceEnd)
    : Math.max(inPoint + 0.01, readNumber(rawShot.outPoint, inPoint + duration));

  const startTime = readNumber(
    nestedTiming?.startTime,
    readNumber(rawShot.startTime, readNumber(rawShot.timelineStart, 0))
  );

  const speed = Math.max(
    0.05,
    readNumber(nestedTiming?.speed, readNumber(rawShot.speed, 1))
  );

  return {
    ...(rawShot as unknown as Shot),
    id: readString(rawShot.id, `shot-${index + 1}`),
    source: {
      ...(isRecord(rawShot.source) ? rawShot.source : {}),
      clipId,
      inPoint,
      outPoint,
    },
    timing: {
      ...(isRecord(rawShot.timing) ? rawShot.timing : {}),
      startTime,
      duration,
      speed,
    },
    meta: isRecord(rawShot.meta) ? rawShot.meta : {},
    effects: Array.isArray(rawShot.effects) ? (rawShot.effects as Shot["effects"]) : [],
  };
}

export function normalizeEDLForPreview(input: MonetEDL): MonetEDL {
  const normalizedShots = input.shots
    .map((shot, index) => normalizeFlatShot(shot, index))
    .filter((shot): shot is Shot => shot !== null)
    .sort((a, b) => shotStart(a) - shotStart(b));

  if (normalizedShots.length === 0) {
    return {
      ...input,
      shots: [],
      timeline: {
        ...input.timeline,
        duration: Math.max(0.1, input.timeline?.duration ?? 0.1),
      },
    };
  }

  const firstStart = Math.min(...normalizedShots.map(shotStart));

  const rebasedShots = normalizedShots.map((shot) => ({
    ...shot,
    source: { ...shot.source },
    timing: {
      ...shot.timing,
      startTime: Math.max(0, shotStart(shot) - firstStart),
      duration: shotDuration(shot),
      speed: Math.max(0.05, readNumber(shot.timing.speed, 1)),
    },
    meta: { ...shot.meta },
  }));

  const duration = calculateDuration(
    rebasedShots,
    readNumber(input.timeline?.duration, 0)
  );

  return {
    ...input,
    timeline: {
      ...input.timeline,
      fps: Math.max(1, readNumber(input.timeline?.fps, 30)),
      duration,
      resolution: {
        width: Math.max(16, readNumber(input.timeline?.resolution?.width, 1920)),
        height: Math.max(16, readNumber(input.timeline?.resolution?.height, 1080)),
      },
    },
    shots: rebasedShots,
  };
}

export function resolvePreviewTime(edl: MonetEDL, requestedTime: number): PreviewTimeResolution {
  const duration = calculateDuration(
    edl.shots,
    readNumber(edl.timeline?.duration, 0)
  );

  if (!Number.isFinite(requestedTime)) {
    return { timelineTime: 0, duration };
  }

  if (duration <= 0.1) {
    return { timelineTime: 0, duration: 0.1 };
  }

  const wrapped = ((requestedTime % duration) + duration) % duration;

  return {
    timelineTime: wrapped,
    duration,
  };
}
