interface FrameData {
  timestamp: number;
  brightness: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  sceneChange: number;
  saturation: number;
}

interface ReferenceEditTrace {
  shots: Array<{ startTime: number; duration: number }>;
}

interface VelocityRampEntry {
  shotIndex: number;
  startTime: number;
  duration: number;
  entrySpeed: number;
  anchorSpeed: number;
  exitSpeed: number;
  anchorPosition: number;
  easing: string;
}

export function extractVelocityRamps(
  trace: ReferenceEditTrace,
  frameData: FrameData[],
  beatTimestamps: number[] = []
): VelocityRampEntry[] {
  if (frameData.length === 0 || trace.shots.length === 0) return [];

  const motionByShot = computeMotionPerShot(trace, frameData);
  const ramps: VelocityRampEntry[] = [];

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const motion = motionByShot.get(i);
    if (!motion || motion.length < 5) continue;

    const isRamp = detectURampPattern(motion);
    if (!isRamp) continue;

    const entrySpeed = motion[0];
    const anchorSpeed = Math.min(...motion);
    const exitSpeed = motion[motion.length - 1];

    const anchorIdx = motion.indexOf(anchorSpeed);
    const normalizedAnchor = anchorIdx / Math.max(1, motion.length - 1);

    const snappedAnchor = snapToBeat(normalizedAnchor, beatTimestamps, shot.startTime, shot.duration);

    const easing = classifyEasing(motion, anchorIdx);

    ramps.push({
      shotIndex: i,
      startTime: shot.startTime,
      duration: shot.duration,
      entrySpeed,
      anchorSpeed,
      exitSpeed,
      anchorPosition: snappedAnchor,
      easing,
    });
  }

  return ramps;
}

function computeMotionPerShot(
  trace: ReferenceEditTrace,
  frameData: FrameData[]
): Map<number, number[]> {
  const result = new Map<number, number[]>();

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const shotEnd = shot.startTime + shot.duration;
    const shotFrames = frameData.filter(
      (f) => f.timestamp >= shot.startTime && f.timestamp < shotEnd
    );
    result.set(i, shotFrames.map((f) => f.motionScore));
  }

  return result;
}

function detectURampPattern(motionValues: number[]): boolean {
  if (motionValues.length < 5) return false;

  const peak = Math.max(...motionValues);
  const trough = Math.min(...motionValues);
  const avg = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;

  const dynamicRange = peak - trough;
  if (dynamicRange < avg * 0.3) return false;

  const firstQuarter = motionValues.slice(0, Math.floor(motionValues.length / 4));
  const lastQuarter = motionValues.slice(Math.floor((motionValues.length * 3) / 4));
  const middle = motionValues.slice(
    Math.floor(motionValues.length * 0.3),
    Math.floor(motionValues.length * 0.7)
  );

  const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
  const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
  const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;

  return (
    avgFirst > avgMiddle * 1.15 &&
    avgLast > avgMiddle * 1.15 &&
    avgMiddle < peak * 0.8
  );
}

function snapToBeat(normalizedPosition: number, beats: number[], shotStart: number, shotDuration: number): number {
  if (beats.length === 0) return normalizedPosition;

  const absolutePosition = shotStart + normalizedPosition * shotDuration;
  let closest = beats[0];
  let minDist = Math.abs(absolutePosition - closest);

  for (const beat of beats) {
    const dist = Math.abs(absolutePosition - beat);
    if (dist < minDist) {
      minDist = dist;
      closest = beat;
    }
  }

  if (minDist < 0.15) {
    return Math.max(0, Math.min(1, (closest - shotStart) / shotDuration));
  }
  return normalizedPosition;
}

function classifyEasing(motionValues: number[], anchorIdx: number): string {
  if (motionValues.length < 3) return "linear";

  const entryCurve = motionValues.slice(0, anchorIdx + 1);
  const exitCurve = motionValues.slice(anchorIdx);

  const entryDecel = isDecelerating(entryCurve);
  const exitAccel = isAccelerating(exitCurve);

  if (entryDecel && exitAccel) return "ease-in-out";
  if (entryDecel) return "ease-out";
  if (exitAccel) return "ease-in";
  return "linear";
}

function isDecelerating(values: number[]): boolean {
  if (values.length < 3) return false;

  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    diffs.push(values[i] - values[i - 1]);
  }

  const isDecreasing = diffs[diffs.length - 1] < diffs[0];
  return isDecreasing;
}

function isAccelerating(values: number[]): boolean {
  if (values.length < 3) return false;

  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    diffs.push(values[i] - values[i - 1]);
  }

  const isIncreasing = diffs[diffs.length - 1] > diffs[0];
  return isIncreasing;
}
