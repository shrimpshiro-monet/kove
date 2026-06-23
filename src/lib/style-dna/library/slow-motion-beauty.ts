import type { StyleDNA } from "../types";

export const SLOW_MOTION_BEAUTY: StyleDNA = {
  id: "slow_motion_beauty",
  name: "Slow Motion Beauty",
  category: "experimental",
  tags: ["slow_motion", "beauty", "smooth", "cinematic", "luxury", "elegant"],
  sourceInfluences: ["apple_ads", "luxury_commercials", "nature_documentary"],
  confidence: 0.87,

  grade: {
    lift: [0.02, 0.01, 0.03],
    gamma: [1.02, 1.0, 1.04],
    gain: [1.0, 0.98, 1.02],
    offset: [0, 0, 0],
    saturation: 0.7,
    vibrance: 0.1,
    contrast: 1.1,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: 10,
    tint: 0,
    exposure: 0.04,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    tealOrange: false,
    orangeTealIntensity: 0.6,
    bleachBypass: false,
    bleachBypassIntensity: 0.4,
    splitToning: null,
    filmStock: "fuji_provia_100f",
    grain: { intensity: 0.03, size: 0.3, color: true, temporal: true },
    vignette: { amount: 0.15, midpoint: 0.5, roundness: 0.8, feather: 0.4, color: [0, 0, 0] },
    bloom: { intensity: 0.15, threshold: 0.8, radius: 0.3, softness: 0.4, color: [1.0, 0.98, 0.95] },
    chromaticAberration: null,
  },

  globalEffects: { effects: [], overallIntensity: 0.8, blendMode: "normal" },
  heroEffects: { effects: [], overallIntensity: 1.0, blendMode: "screen" },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "slowburn",
    tempo: "leisurely",
    averageShotDurationSec: 4.0,
    stutterConfig: null,
    motionBlur: { enabled: true, shutterAngle: 270, samples: 16, directional: false },
  },

  camera: {
    energy: "steady",
    movement: { baseMovement: "drift", amplitude: 0.05, frequency: 0.08, randomJitter: 0.02 },
    lensSimulation: { focalLength: 100, distortion: 0, anamorphicSqueeze: 1.0, flareType: "subtle", flareIntensity: 0.15 },
    dofSimulation: { enabled: true, focalDepth: 0.3, aperture: 1.2, blurQuality: "high", edgeBoost: false },
  },

  graphics: {
    text: {
      fontFamily: "context_aware", sizeFeel: "small", weight: 300,
      animation: { entryAnimation: "fade_in", exitAnimation: "fade_out", idleBehavior: "gentle_float", perWordStagger: false, syncToAudio: false, bounceWiggle: 0, glitchFrequency: 0 },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.9, 0.88, 0.85] },
      outline: null, shadow: null, glow: { enabled: true, color: [1.0, 0.95, 0.9], size: 6 }, backgroundPlate: null,
      captionStyle: "timestamp_code",
    },
  },

  editorial: {
    avgShotDurationSec: 4.0, shotDurationVariance: 0.25,
    preferredDurations: [3, 4, 6, 8],
    cutStyle: "hard_cut", cutAlignment: "off_beat",
    closeupBias: 0.6, wideShotBias: 0.2,
    defaultTransition: { type: "dissolve", durationMs: 1000, ease: "linear" },
    heroTransition: { type: "dissolve", durationMs: 1500, ease: "linear" },
    pacingCurve: "flat",
  },

  audioReactivity: {
    enabled: false,
    onBeat: { triggerEffect: null, cutProbability: 0 },
  },
};
