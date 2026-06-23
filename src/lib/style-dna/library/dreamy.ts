import type { StyleDNA } from "../types";

export const DREAMY_SOFT: StyleDNA = {
  id: "dreamy_soft",
  name: "Dreamy Soft",
  category: "experimental",
  tags: ["dreamy", "soft", "ethereal", "glow", "pastel", "romantic"],
  sourceInfluences: ["wes_anderson", " Sofia Coppola", "tumblr_aesthetic"],
  confidence: 0.85,

  grade: {
    lift: [0.03, 0.02, 0.04],
    gamma: [1.05, 1.02, 1.08],
    gain: [1.0, 0.98, 1.02],
    offset: [0, 0, 0],
    saturation: 0.5,
    vibrance: 0,
    contrast: 0.85,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: 12,
    tint: 2,
    exposure: 0.07,
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
    grain: { intensity: 0.05, size: 0.3, color: true, temporal: true },
    vignette: { amount: 0.2, midpoint: 0.5, roundness: 0.8, feather: 0.4, color: [0, 0, 0] },
    bloom: { intensity: 0.25, threshold: 0.7, radius: 0.4, softness: 0.5, color: [1.0, 0.95, 0.9] },
    chromaticAberration: null,
  },

  globalEffects: { effects: [], overallIntensity: 0.7, blendMode: "normal" },
  heroEffects: { effects: [], overallIntensity: 1.0, blendMode: "screen" },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "slowburn",
    tempo: "leisurely",
    averageShotDurationSec: 4.0,
    stutterConfig: null,
    motionBlur: { enabled: true, shutterAngle: 180, samples: 8, directional: false },
  },

  camera: {
    energy: "steady",
    movement: { baseMovement: "drift", amplitude: 0.08, frequency: 0.1, randomJitter: 0.05 },
    lensSimulation: { focalLength: 85, distortion: 0, anamorphicSqueeze: 1.0, flareType: "subtle", flareIntensity: 0.2 },
    dofSimulation: { enabled: true, focalDepth: 0.3, aperture: 1.4, blurQuality: "high", edgeBoost: false },
  },

  graphics: {
    text: {
      fontFamily: "context_aware", sizeFeel: "small", weight: 300,
      animation: { entryAnimation: "fade_in", exitAnimation: "fade_out", idleBehavior: "gentle_float", perWordStagger: false, syncToAudio: false, bounceWiggle: 0, glitchFrequency: 0 },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.95, 0.9, 0.85] },
      outline: null, shadow: null, glow: { enabled: true, color: [1.0, 0.9, 0.8], size: 8 }, backgroundPlate: null,
      captionStyle: "timestamp_code",
    },
  },

  editorial: {
    avgShotDurationSec: 4.0, shotDurationVariance: 0.3,
    preferredDurations: [2, 4, 6, 8],
    cutStyle: "hard_cut", cutAlignment: "off_beat",
    closeupBias: 0.5, wideShotBias: 0.3,
    defaultTransition: { type: "dissolve", durationMs: 800, ease: "linear" },
    heroTransition: { type: "dissolve", durationMs: 1200, ease: "linear" },
    pacingCurve: "flat",
  },

  audioReactivity: {
    enabled: false,
    onBeat: { triggerEffect: null, cutProbability: 0 },
  },
};
