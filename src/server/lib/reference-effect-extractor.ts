export interface FrameData {
  timestamp: number;
  brightness: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  sceneChange: number;
  saturation: number;
}

export interface ReferenceEditTrace {
  shots: Array<{ startTime: number; duration: number }>;
}

interface DetectedEffect {
  type: string;
  intensity: number;
  timing: "start" | "middle" | "end" | "throughout";
  params?: Record<string, number>;
}

interface EffectVocabularyEntry {
  shotIndex: number;
  startTime: number;
  duration: number;
  effects: DetectedEffect[];
  transition?: { type: string; duration: number };
}

export function extractEffectVocabulary(
  trace: ReferenceEditTrace,
  frameData: FrameData[]
): EffectVocabularyEntry[] {
  if (frameData.length === 0 || trace.shots.length === 0) return [];

  const brightnessStats = computeStats(frameData.map((f) => f.brightness));
  const motionStats = computeStats(frameData.map((f) => f.motionScore));
  const contrastStats = computeStats(frameData.map((f) => f.contrast));

  const result: EffectVocabularyEntry[] = [];

  for (let i = 0; i < trace.shots.length; i++) {
    const shot = trace.shots[i];
    const shotEnd = shot.startTime + shot.duration;
    const shotFrames = frameData.filter(
      (f) => f.timestamp >= shot.startTime && f.timestamp < shotEnd
    );
    if (shotFrames.length === 0) {
      result.push({
        shotIndex: i,
        startTime: shot.startTime,
        duration: shot.duration,
        effects: [],
      });
      continue;
    }

    const effects = detectEffectsForShot(
      shotFrames,
      frameData,
      shot,
      i,
      brightnessStats,
      motionStats,
      contrastStats,
      trace.shots
    );

    result.push({
      shotIndex: i,
      startTime: shot.startTime,
      duration: shot.duration,
      effects,
    });
  }

  return result;
}

function detectEffectsForShot(
  shotFrames: FrameData[],
  allFrames: FrameData[],
  shot: { startTime: number; duration: number },
  shotIndex: number,
  brightnessStats: { mean: number; stddev: number },
  motionStats: { mean: number; stddev: number },
  contrastStats: { mean: number; stddev: number },
  allShots: Array<{ startTime: number; duration: number }>
): DetectedEffect[] {
  const effects: DetectedEffect[] = [];

  const impactFlash = detectImpactFlash(shotFrames, brightnessStats);
  if (impactFlash) effects.push(impactFlash);

  const contextShake = detectContextShake(shotFrames, motionStats);
  if (contextShake) effects.push(contextShake);

  const speedRamp = detectSpeedRamp(shotFrames, motionStats);
  if (speedRamp) effects.push(speedRamp);

  const whipPan = detectWhipPan(shot, allFrames, allShots, shotIndex);
  if (whipPan) effects.push(whipPan);

  const colorPulse = detectColorPulse(shotFrames, brightnessStats, contrastStats);
  if (colorPulse) effects.push(colorPulse);

  const pushIn = detectPushIn(shotFrames);
  if (pushIn) effects.push(pushIn);

  return effects;
}

function detectImpactFlash(
  frames: FrameData[],
  brightnessStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (brightnessStats.stddev === 0) return null;

  const threshold = brightnessStats.mean + 2 * brightnessStats.stddev;
  const flashFrames = frames.filter((f) => f.brightness > threshold);
  if (flashFrames.length === 0) return null;

  const peakFrame = flashFrames.reduce((max, f) =>
    f.brightness > max.brightness ? f : max
  );
  const intensity = Math.min(
    1,
    (peakFrame.brightness - brightnessStats.mean) / (brightnessStats.stddev * 3)
  );
  const relPos = (peakFrame.timestamp - frames[0].timestamp) / (frames[frames.length - 1].timestamp - frames[0].timestamp);
  const timing = getTimingPosition(relPos);

  return {
    type: "impact_flash",
    intensity,
    timing,
    params: {
      peakBrightness: peakFrame.brightness,
      flashFrameCount: flashFrames.length,
    },
  };
}

function detectContextShake(
  frames: FrameData[],
  motionStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (frames.length < 3 || motionStats.mean === 0) return null;

  const motionVariance = frames.reduce((s, f) => {
    const dev = f.motionScore - motionStats.mean;
    return s + dev * dev;
  }, 0) / frames.length;
  const motionStddev = Math.sqrt(motionVariance);

  if (motionStddev < motionStats.mean * 0.3) return null;
  if (motionStats.mean < motionStats.mean * 0.5) return null;

  const avgMotion = frames.reduce((s, f) => s + f.motionScore, 0) / frames.length;
  const intensity = Math.min(1, motionStddev / Math.max(motionStats.stddev, 0.01));

  return {
    type: "context_shake",
    intensity,
    timing: "throughout",
    params: {
      avgMotion,
      motionStddev,
    },
  };
}

function detectSpeedRamp(
  frames: FrameData[],
  motionStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (frames.length < 5) return null;

  const motionValues = frames.map((f) => f.motionScore);
  const peak = Math.max(...motionValues);
  const trough = Math.min(...motionValues);
  const avgMotion = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;

  const hasUMotion = isUShaped(motionValues);
  const hasPeak = peak > avgMotion * 1.5;
  const hasTrough = trough < avgMotion * 0.5;

  if (!hasUMotion && !(hasPeak && hasTrough)) return null;

  const peakIdx = motionValues.indexOf(peak);
  const normalizedPeakPos = peakIdx / (motionValues.length - 1);

  const intensity = Math.min(
    1,
    (peak - trough) / Math.max(motionStats.mean, 0.01)
  );

  return {
    type: "speed_ramp",
    intensity,
    timing: normalizedPeakPos < 0.3 ? "start" : normalizedPeakPos > 0.7 ? "end" : "middle",
    params: {
      peakMotion: peak,
      troughMotion: trough,
      peakPosition: normalizedPeakPos,
    },
  };
}

function detectWhipPan(
  shot: { startTime: number; duration: number },
  allFrames: FrameData[],
  allShots: Array<{ startTime: number; duration: number }>,
  shotIndex: number
): DetectedEffect | null {
  if (allShots.length < 2) return null;

  const isLastShot = shotIndex === allShots.length - 1;
  if (isLastShot) return null;

  const boundaryWindow = Math.min(shot.duration * 0.15, 0.3);
  const boundaryStart = shot.startTime + shot.duration - boundaryWindow;
  const boundaryFrames = allFrames.filter(
    (f) => f.timestamp >= boundaryStart && f.timestamp < shot.startTime + shot.duration
  );

  if (boundaryFrames.length === 0) return null;

  const avgMotion =
    boundaryFrames.reduce((s, f) => s + f.motionScore, 0) / boundaryFrames.length;
  const avgEdge =
    boundaryFrames.reduce((s, f) => s + f.edgeDensity, 0) / boundaryFrames.length;

  if (avgMotion < 0.6 || avgEdge < 0.5) return null;

  const intensity = Math.min(1, (avgMotion + avgEdge) / 1.6);

  return {
    type: "whip_pan",
    intensity,
    timing: "end",
    params: {
      boundaryMotion: avgMotion,
      boundaryEdge: avgEdge,
    },
  };
}

function detectColorPulse(
  frames: FrameData[],
  brightnessStats: { mean: number; stddev: number },
  contrastStats: { mean: number; stddev: number }
): DetectedEffect | null {
  if (frames.length < 3) return null;

  const contrastValues = frames.map((f) => f.contrast);
  const peakContrast = Math.max(...contrastValues);

  if (contrastStats.stddev === 0) return null;

  const contrastThreshold = contrastStats.mean + 2 * contrastStats.stddev;
  const hasContrastSpike = peakContrast > contrastThreshold;
  if (!hasContrastSpike) return null;

  const brightnessValues = frames.map((f) => f.brightness);
  const brightnessVariance = computeVariance(brightnessValues);
  const hasBrightnessSpike =
    brightnessVariance > brightnessStats.stddev * brightnessStats.stddev * 2;

  if (hasBrightnessSpike) return null;

  const spikeFrame = frames[contrastValues.indexOf(peakContrast)];
  const relPos = (spikeFrame.timestamp - frames[0].timestamp) / (frames[frames.length - 1].timestamp - frames[0].timestamp);

  return {
    type: "color_pulse",
    intensity: Math.min(
      1,
      (peakContrast - contrastStats.mean) / (contrastStats.stddev * 3)
    ),
    timing: getTimingPosition(relPos),
    params: {
      peakContrast,
    },
  };
}

function detectPushIn(frames: FrameData[]): DetectedEffect | null {
  if (frames.length < 5) return null;

  const motionValues = frames.map((f) => f.motionScore);
  const firstHalf = motionValues.slice(0, Math.floor(motionValues.length / 2));
  const secondHalf = motionValues.slice(Math.floor(motionValues.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (secondAvg <= firstAvg) return null;

  const increase = (secondAvg - firstAvg) / Math.max(firstAvg, 0.01);
  if (increase < 0.3) return null;

  const intensity = Math.min(1, increase);

  return {
    type: "push_in",
    intensity,
    timing: "throughout",
    params: {
      motionIncrease: increase,
      firstHalfAvg: firstAvg,
      secondHalfAvg: secondAvg,
    },
  };
}

function isUShaped(values: number[]): boolean {
  if (values.length < 5) return false;

  const mid = Math.floor(values.length / 2);
  const firstQuarter = values.slice(0, Math.floor(values.length / 4));
  const lastQuarter = values.slice(Math.floor((values.length * 3) / 4));
  const middle = values.slice(
    Math.floor(values.length * 0.3),
    Math.floor(values.length * 0.7)
  );

  const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
  const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
  const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;

  return (
    avgFirst > avgMiddle * 1.2 &&
    avgLast > avgMiddle * 1.2 &&
    avgMiddle < Math.max(avgFirst, avgLast) * 0.7
  );
}

function computeStats(values: number[]): {
  mean: number;
  stddev: number;
} {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = computeVariance(values);
  return { mean, stddev: Math.sqrt(variance) };
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
}

function getTimingPosition(
  relativePosition: number
): "start" | "middle" | "end" {
  if (relativePosition < 0.3) return "start";
  if (relativePosition > 0.7) return "end";
  return "middle";
}
