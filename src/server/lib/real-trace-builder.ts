/**
 * Real ReferenceEditTrace builder.
 *
 * Replaces the mock trace generator in analyze-reference.ts with
 * ground-truth data from FFmpeg scene detection and energy analysis.
 *
 * This is the core of making reference video analysis actually work.
 */

import type { SceneDetectionResult } from "./scene-detection";
import type { EnergyAnalysisResult } from "./energy-analysis";
import type {
  ReferenceEditTrace,
  ReferenceEditEvent,
  ReferenceEditEventType,
} from "../director/reference-edit-trace";
import type { ReferenceStyle } from "../types/reference-style";

/**
 * Build a real ReferenceEditTrace from FFmpeg analysis data.
 *
 * @param scenes - Scene change detection results
 * @param energy - Energy analysis results
 * @param style - Gemini-extracted ReferenceStyle (for effect/event hints)
 * @param sourceId - Identifier for the source video
 */
export function buildRealTrace(
  scenes: SceneDetectionResult,
  energy: EnergyAnalysisResult,
  style: ReferenceStyle | null,
  sourceId: string
): ReferenceEditTrace {
  const duration = energy.totalDuration || scenes.totalDuration;
  if (duration <= 0) {
    return emptyTrace(sourceId);
  }

  // Build events from scene changes (these are real cuts)
  const events: ReferenceEditEvent[] = [];

  for (let i = 0; i < scenes.scenes.length; i++) {
    const scene = scenes.scenes[i];
    const normalizedTime = duration > 0 ? scene.timestamp / duration : 0;

    // Determine the visual role based on position and energy
    const visualRole = inferVisualRole(i, scenes.scenes.length, normalizedTime, energy);

    events.push({
      timeSec: scene.timestamp,
      normalizedTime,
      type: "cut",
      intensity: scene.score,
      beatAligned: false, // Will be set later if music analysis is available
      visualRole,
      notes: `Scene change at ${scene.timestamp.toFixed(2)}s (score: ${scene.score.toFixed(2)})`,
    });
  }

  // Add energy-derived events (flashes, shakes, etc.)
  const energyEvents = extractEnergyEvents(energy, duration);
  events.push(...energyEvents);

  // Sort by timestamp
  events.sort((a, b) => a.timeSec - b.timeSec);

  // Calculate effect density
  const effectEvents = events.filter(e => e.type !== "cut");
  const effectDensityPer10Sec = duration > 0
    ? (effectEvents.length / duration) * 10
    : 0;

  // Calculate motion density (events with motion-related types)
  const motionTypes: ReferenceEditEventType[] = ["push_in", "speed_ramp", "shake", "whip"];
  const motionEvents = events.filter(e => motionTypes.includes(e.type));
  const motionDensityPer10Sec = duration > 0
    ? (motionEvents.length / duration) * 10
    : 0;

  return {
    sourceId,
    durationSec: duration,
    avgShotDurationSec: scenes.avgShotDuration,
    events,
    shotDurations: scenes.shotDurations,
    energyCurve: energy.energyCurve,
    effectDensityPer10Sec,
    motionDensityPer10Sec,
  };
}

/**
 * Build a real trace from buffer data (for Worker environments).
 * Uses pre-computed scene and energy data.
 */
export function buildRealTraceFromData(
  data: {
    scenes: Array<{ timestamp: number; score: number }>;
    totalDuration: number;
    avgShotDuration: number;
    shotDurations: number[];
    energyCurve: number[];
    climaxPosition: number;
    breathingMoments: number[];
  },
  style: ReferenceStyle | null,
  sourceId: string
): ReferenceEditTrace {
  const { totalDuration, avgShotDuration, shotDurations, energyCurve } = data;
  if (totalDuration <= 0) return emptyTrace(sourceId);

  const events: ReferenceEditEvent[] = data.scenes.map((scene) => {
    const normalizedTime = totalDuration > 0 ? scene.timestamp / totalDuration : 0;
    return {
      timeSec: scene.timestamp,
      normalizedTime,
      type: "cut" as const,
      intensity: scene.score,
      beatAligned: false,
      visualRole: inferVisualRoleFromPosition(normalizedTime),
    };
  });

  events.sort((a, b) => a.timeSec - b.timeSec);

  const effectEvents = events.filter(e => e.type !== "cut");
  const effectDensityPer10Sec = totalDuration > 0
    ? (effectEvents.length / totalDuration) * 10 : 0;

  return {
    sourceId,
    durationSec: totalDuration,
    avgShotDurationSec: avgShotDuration,
    events,
    shotDurations,
    energyCurve,
    effectDensityPer10Sec,
    motionDensityPer10Sec: effectDensityPer10Sec * 0.6,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────

/**
 * Extract non-cut events from energy analysis.
 * Detects flashes (brightness spikes), shakes (motion spikes),
 * and pushes (gradual motion increases).
 */
function extractEnergyEvents(
  energy: EnergyAnalysisResult,
  duration: number
): ReferenceEditEvent[] {
  const events: ReferenceEditEvent[] = [];
  const { frames } = energy;

  if (frames.length < 3) return events;

  for (let i = 1; i < frames.length - 1; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    const next = frames[i + 1];

    const brightnessSpike = curr.brightness > prev.brightness * 1.5 &&
      curr.brightness > next.brightness * 1.3;
    const motionSpike = curr.motion > prev.motion * 2.0 &&
      curr.motion > 0.4;

    if (brightnessSpike) {
      events.push({
        timeSec: curr.timestamp,
        normalizedTime: duration > 0 ? curr.timestamp / duration : 0,
        type: "flash",
        intensity: Math.min(1, curr.brightness),
        durationSec: 0.1,
        notes: "Brightness spike detected",
      });
    }

    if (motionSpike) {
      events.push({
        timeSec: curr.timestamp,
        normalizedTime: duration > 0 ? curr.timestamp / duration : 0,
        type: "shake",
        intensity: Math.min(1, curr.motion),
        durationSec: 0.2,
        notes: "High motion detected",
      });
    }
  }

  // Detect speed ramps: sustained motion increase followed by decrease
  for (let i = 2; i < frames.length - 2; i++) {
    const window = frames.slice(i - 2, i + 3);
    const motionValues = window.map(f => f.motion);
    const isRamp = motionValues[0] < motionValues[2] * 0.7 &&
      motionValues[4] < motionValues[2] * 0.7 &&
      motionValues[2] > 0.5;

    if (isRamp) {
      events.push({
        timeSec: frames[i].timestamp,
        normalizedTime: duration > 0 ? frames[i].timestamp / duration : 0,
        type: "speed_ramp",
        intensity: Math.min(1, frames[i].motion),
        durationSec: 1.0,
        notes: "Motion peak surrounded by lower motion",
      });
    }
  }

  return events;
}

/**
 * Infer the visual role of a shot based on its position in the edit.
 */
function inferVisualRole(
  sceneIndex: number,
  totalScenes: number,
  normalizedTime: number,
  energy: EnergyAnalysisResult
): ReferenceEditEvent["visualRole"] {
  // First shot is always establishing
  if (sceneIndex === 0) return "establishing";

  // Last shots are reactions/closings
  if (sceneIndex >= totalScenes - 2) return "reaction";

  // Near the climax = impact
  const climaxDist = Math.abs(normalizedTime - energy.climaxPosition);
  if (climaxDist < 0.1) return "impact";

  // Breathing moments
  const nearBreathing = energy.breathingMoments.some(
    bt => Math.abs(bt - sceneIndex * energy.totalDuration / totalScenes) < 1.0
  );
  if (nearBreathing) return "breath";

  // Default based on position
  if (normalizedTime < 0.2) return "establishing";
  if (normalizedTime > 0.8) return "reaction";
  return "action";
}

function inferVisualRoleFromPosition(normalizedTime: number): ReferenceEditEvent["visualRole"] {
  if (normalizedTime < 0.15) return "establishing";
  if (normalizedTime > 0.85) return "reaction";
  if (normalizedTime > 0.4 && normalizedTime < 0.7) return "impact";
  return "action";
}

function emptyTrace(sourceId: string): ReferenceEditTrace {
  return {
    sourceId,
    durationSec: 0,
    avgShotDurationSec: 1.0,
    events: [],
    shotDurations: [],
    energyCurve: new Array(10).fill(0.5),
    effectDensityPer10Sec: 0,
    motionDensityPer10Sec: 0,
  };
}
