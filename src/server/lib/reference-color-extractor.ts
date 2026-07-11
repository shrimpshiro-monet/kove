interface FrameData {
  timestamp: number;
  brightness: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  sceneChange: number;
  saturation: number;
}

interface ColorGradeEntry {
  timestamp: number;
  saturation: number;
  brightness: number;
  contrast: number;
  temperature: number;
}

export function extractColorGrades(frameData: FrameData[]): ColorGradeEntry[] {
  if (frameData.length === 0) return [];

  const smoothed = smoothFrameData(frameData, 5);
  return detectKeyframes(smoothed);
}

function smoothFrameData(data: FrameData[], windowSize: number): FrameData[] {
  if (data.length <= windowSize) return data;

  const result: FrameData[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
    const window = data.slice(start, end);

    result.push({
      timestamp: data[i].timestamp,
      brightness: avg(window.map((f) => f.brightness)),
      contrast: avg(window.map((f) => f.contrast)),
      motionScore: avg(window.map((f) => f.motionScore)),
      edgeDensity: avg(window.map((f) => f.edgeDensity)),
      sceneChange: data[i].sceneChange,
      saturation: avg(window.map((f) => f.saturation)),
    });
  }

  return result;
}

function detectKeyframes(data: FrameData[]): ColorGradeEntry[] {
  if (data.length < 3) {
    return data.map((f) => ({
      timestamp: f.timestamp,
      saturation: f.saturation,
      brightness: f.brightness,
      contrast: f.contrast,
      temperature: 0,
    }));
  }

  const satStats = computeStats(data.map((f) => f.saturation));
  const brightStats = computeStats(data.map((f) => f.brightness));
  const contrastStats = computeStats(data.map((f) => f.contrast));

  const satThreshold = Math.max(satStats.stddev * 0.5, 0.05);
  const brightThreshold = Math.max(brightStats.stddev * 0.5, 0.05);
  const contrastThreshold = Math.max(contrastStats.stddev * 0.5, 0.05);

  const keyframes: ColorGradeEntry[] = [
    {
      timestamp: data[0].timestamp,
      saturation: data[0].saturation,
      brightness: data[0].brightness,
      contrast: data[0].contrast,
      temperature: estimateTemperature(data[0]),
    },
  ];

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    const satDelta = Math.abs(curr.saturation - prev.saturation);
    const brightDelta = Math.abs(curr.brightness - prev.brightness);
    const contrastDelta = Math.abs(curr.contrast - prev.contrast);

    const isSignificant =
      satDelta > satThreshold ||
      brightDelta > brightThreshold ||
      contrastDelta > contrastThreshold;

    if (isSignificant) {
      const prevKf = keyframes[keyframes.length - 1];
      const timeSinceLast = curr.timestamp - prevKf.timestamp;
      if (timeSinceLast > 0.5) {
        keyframes.push({
          timestamp: curr.timestamp,
          saturation: curr.saturation,
          brightness: curr.brightness,
          contrast: curr.contrast,
          temperature: estimateTemperature(curr),
        });
      }
    }
  }

  if (
    keyframes.length === 1 ||
    keyframes[keyframes.length - 1].timestamp !== data[data.length - 1].timestamp
  ) {
    const last = data[data.length - 1];
    keyframes.push({
      timestamp: last.timestamp,
      saturation: last.saturation,
      brightness: last.brightness,
      contrast: last.contrast,
      temperature: estimateTemperature(last),
    });
  }

  return keyframes;
}

function estimateTemperature(frame: FrameData): number {
  const warm = frame.brightness * 0.6 + frame.contrast * 0.4;
  return Math.max(-1, Math.min(1, (warm - 0.5) * 2));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeStats(values: number[]): {
  mean: number;
  stddev: number;
} {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}
