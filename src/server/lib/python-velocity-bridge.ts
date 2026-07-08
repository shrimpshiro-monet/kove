import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

interface VelocitySample {
  timestamp: number;
  magnitude: number;
}

interface PythonShot {
  index: number;
  start_time: number;
  end_time: number;
  duration: number;
  start_frame: number;
  end_frame: number;
}

interface PythonResult {
  total_duration: number;
  fps: number;
  total_frames: number;
  shots: PythonShot[];
  velocity_curve: VelocitySample[];
  dominant_palette: string[];
  audio: { bpm: number; beats: number[] } | null;
  cut_frequency: number;
  avg_shot_duration: number;
  pacing: string;
}

export interface StructuralMotionResult {
  motionEnergyProfile1s: number[];
  shotMotionProfile: Array<{
    shotIndex: number;
    startTime: number;
    duration: number;
    meanMotion: number;
    maxMotion: number;
  }>;
  earlyEnergy: number;
  lateEnergy: number;
  energyVarianceRatio: number;
  peakMotionTimestamp?: number;
  motionSource: string;
  motionSampleCount: number;
  nonzeroMotionSampleCount: number;
  pythonShots: PythonShot[];
  velocitySamples: VelocitySample[];
  dominantPalette: string[];
  audio: { bpm: number; beats: number[] } | null;
}

/**
 * Run Python deep_analysis.py and extract real motion + structural data.
 */
export async function runPythonVelocityAnalysis(
  videoPath: string
): Promise<StructuralMotionResult> {
  const scriptDir = path.resolve(
    process.cwd(),
    "workers/python-ai/workers"
  );

  try {
    const { stdout } = await execFileAsync(
      "python3",
      [
        "-c",
        `import json, sys; sys.path.insert(0, '${scriptDir}'); from deep_analysis import run_deep_analysis; res = run_deep_analysis(sys.argv[1]); print(json.dumps(res))`,
        videoPath,
      ],
      { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 }
    );

    const raw: PythonResult = JSON.parse(stdout.trim());
    const totalDuration = raw.total_duration;
    const numSeconds = Math.ceil(totalDuration);

    // Build 1s motion buckets from real velocity data
    const motionEnergyProfile1s = new Array(numSeconds).fill(0);
    const bucketCounts = new Array(numSeconds).fill(0);

    for (const sample of raw.velocity_curve) {
      const sec = Math.floor(sample.timestamp);
      if (sec >= 0 && sec < numSeconds) {
        motionEnergyProfile1s[sec] += sample.magnitude;
        bucketCounts[sec]++;
      }
    }

    for (let i = 0; i < numSeconds; i++) {
      if (bucketCounts[i] > 0)
        motionEnergyProfile1s[i] /= bucketCounts[i];
    }

    // Build per-shot motion profile
    const shotMotionProfile = raw.shots.map((shot) => {
      const shotSamples = raw.velocity_curve.filter(
        (v) => v.timestamp >= shot.start_time && v.timestamp < shot.end_time
      );
      const mags = shotSamples.map((s) => s.magnitude);
      return {
        shotIndex: shot.index,
        startTime: shot.start_time,
        duration: shot.duration,
        meanMotion:
          mags.length > 0
            ? mags.reduce((a, b) => a + b, 0) / mags.length
            : 0,
        maxMotion: mags.length > 0 ? Math.max(...mags) : 0,
      };
    });

    // Early/late energy split using real velocity
    const midpoint = totalDuration / 2;
    const earlySamples = raw.velocity_curve.filter(
      (v) => v.timestamp < midpoint
    );
    const lateSamples = raw.velocity_curve.filter(
      (v) => v.timestamp >= midpoint
    );
    const earlyEnergy =
      earlySamples.length > 0
        ? earlySamples.reduce((s, v) => s + v.magnitude, 0) /
          earlySamples.length
        : 0;
    const lateEnergy =
      lateSamples.length > 0
        ? lateSamples.reduce((s, v) => s + v.magnitude, 0) /
          lateSamples.length
        : 0;
    const energyVarianceRatio =
      earlyEnergy > 0 ? lateEnergy / earlyEnergy : 1;

    // Peak motion timestamp
    let peakMotionTimestamp: number | undefined;
    if (raw.velocity_curve.length > 0) {
      const peak = raw.velocity_curve.reduce(
        (max, s) => (s.magnitude > max.magnitude ? s : max),
        raw.velocity_curve[0]
      );
      peakMotionTimestamp = peak.timestamp;
    }

    const nonzeroSamples = raw.velocity_curve.filter(
      (v) => v.magnitude > 0.1
    );

    return {
      motionEnergyProfile1s,
      shotMotionProfile,
      earlyEnergy,
      lateEnergy,
      energyVarianceRatio,
      peakMotionTimestamp,
      motionSource:
        nonzeroSamples.length > raw.velocity_curve.length * 0.1
          ? "python_velocity"
          : "missing",
      motionSampleCount: raw.velocity_curve.length,
      nonzeroMotionSampleCount: nonzeroSamples.length,
      pythonShots: raw.shots,
      velocitySamples: raw.velocity_curve,
      dominantPalette: raw.dominant_palette ?? [],
      audio: raw.audio ?? null,
    };
  } catch (err) {
    console.error(
      `[python-velocity] Analysis failed: ${(err as Error).message}`
    );
    return {
      motionEnergyProfile1s: [],
      shotMotionProfile: [],
      earlyEnergy: 0,
      lateEnergy: 0,
      energyVarianceRatio: 1,
      motionSource: "error",
      motionSampleCount: 0,
      nonzeroMotionSampleCount: 0,
      pythonShots: [],
      velocitySamples: [],
      dominantPalette: [],
      audio: null,
    };
  }
}
