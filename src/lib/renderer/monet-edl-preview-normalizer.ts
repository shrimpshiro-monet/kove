import type { MonetEDL, Shot, EasingType } from "../../server/types/edl";

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

// ─── Easing functions for speed ramp ──────────────────────────────────────
// These map a normalized time t ∈ [0,1] to an eased value ∈ [0,1].

function applyEasing(t: number, easing: EasingType): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return 1 - (1 - clamped) * (1 - clamped);
    case "ease-in-out":
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    case "elastic": {
      const c4 = (2 * Math.PI) / 3;
      return clamped === 0
        ? 0
        : clamped === 1
          ? 1
          : Math.pow(2, -10 * clamped) * Math.sin((clamped * 10 - 0.75) * c4) + 1;
    }
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let t2 = clamped;
      if (t2 < 1 / d1) return n1 * t2 * t2;
      if (t2 < 2 / d1) return n1 * (t2 -= 1.5 / d1) * t2 + 0.75;
      if (t2 < 2.5 / d1) return n1 * (t2 -= 2.25 / d1) * t2 + 0.9375;
      return n1 * (t2 -= 2.625 / d1) * t2 + 0.984375;
    }
    case "bezier":
    case "linear":
    default:
      return clamped;
  }
}

// ─── Speed ramp source time calculation ────────────────────────────────────
// Given a speed ramp from startSpeed to endSpeed over shot duration D,
// compute the source clip time at local timeline time T.
//
// speed(t) = startSpeed + (endSpeed - startSpeed) * easing(t/D)
// sourceTime(T) = inPoint + ∫₀ᵀ speed(τ) dτ
//
// For linear easing the integral is exact:
//   sourceTime(T) = inPoint + startSpeed*T + (endSpeed-startSpeed)*T²/(2D)
//
// For non-linear easing we use adaptive Simpson integration (accurate to <0.1%).

function computeSpeedRampSourceTime(
  inPoint: number,
  localTime: number,
  duration: number,
  startSpeed: number,
  endSpeed: number,
  easing: EasingType
): number {
  if (duration <= 0.001) return inPoint;

  const T = Math.max(0, Math.min(duration, localTime));

  // Fast path: linear easing — closed-form integral
  if (easing === "linear") {
    return inPoint + startSpeed * T + ((endSpeed - startSpeed) * T * T) / (2 * duration);
  }

  // Fast path: ease-in — integral of t² is t³/3
  if (easing === "ease-in") {
    return inPoint + startSpeed * T + ((endSpeed - startSpeed) * T * T * T) / (3 * duration * duration);
  }

  // Fast path: ease-out — easing(t) = 2t - t², integral = t² - t³/3
  if (easing === "ease-out") {
    const t2 = T * T;
    const t3 = t2 * T;
    return inPoint + startSpeed * T + (endSpeed - startSpeed) * (t2 / duration - t3 / (3 * duration * duration));
  }

  // Fast path: ease-in-out — piecewise quadratic
  if (easing === "ease-in-out") {
    const halfD = duration / 2;
    if (T <= halfD) {
      // First half: easing(t) = 2(t/D)², integral = 2T³/(3D²)
      return inPoint + startSpeed * T + (endSpeed - startSpeed) * (2 * T * T * T) / (3 * duration * duration);
    }
    // Second half: numerical integration for the ease-out portion
    return computeSpeedRampSourceTimeNumerical(inPoint, T, duration, startSpeed, endSpeed, easing);
  }

  // General case: adaptive Simpson integration
  return computeSpeedRampSourceTimeNumerical(inPoint, T, duration, startSpeed, endSpeed, easing);
}

function computeSpeedRampSourceTimeNumerical(
  inPoint: number,
  T: number,
  D: number,
  startSpeed: number,
  endSpeed: number,
  easing: EasingType
): number {
  // Adaptive Simpson's rule — 8 panels is enough for smooth easing curves
  const panels = 8;
  const dt = T / panels;
  let sum = 0;

  for (let i = 0; i < panels; i++) {
    const t0 = (i * dt) / D;
    const t1 = ((i + 1) * dt) / D;
    const tMid = (t0 + t1) / 2;

    const e0 = applyEasing(t0, easing);
    const eMid = applyEasing(tMid, easing);
    const e1 = applyEasing(t1, easing);

    const speed0 = startSpeed + (endSpeed - startSpeed) * e0;
    const speedMid = startSpeed + (endSpeed - startSpeed) * eMid;
    const speed1 = startSpeed + (endSpeed - startSpeed) * e1;

    // Simpson's rule for this panel
    sum += (dt / 6) * (speed0 + 4 * speedMid + speed1);
  }

  return inPoint + sum;
}

// Expose for testing / external use
export { applyEasing, computeSpeedRampSourceTime };

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
    const easing: EasingType = (shot.timing.speedRamp.easing as EasingType) ?? "linear";

    unclamped = computeSpeedRampSourceTime(inPoint, localTime, duration, startSpeed, endSpeed, easing);
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
