import type { StyleDNA } from "../types";

export const CINEMATIC_NOIR: StyleDNA = {
  id: "cinematic_noir",
  name: "Cinematic Noir",
  category: "film_reference",
  tags: ["noir", "cinematic", "dark", "moody", "contrast", "desaturated"],
  sourceInfluences: ["bladerunner_2049", "batman_2022", "dune_2021"],
  confidence: 0.88,

  grade: {
    lift: [0.01, 0.01, 0.02],
    gamma: [1.0, 1.0, 1.05],
    gain: [0.95, 0.95, 1.0],
    offset: [0, 0, 0],
    saturation: 0.6,
    vibrance: 0,
    contrast: 1.3,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: -10,
    tint: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    tealOrange: false,
    orangeTealIntensity: 0.6,
    bleachBypass: false,
    bleachBypassIntensity: 0.4,
    splitToning: null,
    filmStock: "kodak_vision3_250d",
    grain: { intensity: 0.1, size: 0.5, color: false, temporal: true },
    vignette: { amount: 0.3, midpoint: 0.5, roundness: 0.8, feather: 0.3, color: [0, 0, 0] },
    bloom: null,
    chromaticAberration: null,
  },

  globalEffects: { effects: [], overallIntensity: 0.8, blendMode: "normal" },
  heroEffects: { effects: [], overallIntensity: 1.0, blendMode: "screen" },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "slowburn",
    tempo: "leisurely",
    averageShotDurationSec: 5.0,
    stutterConfig: null,
    motionBlur: { enabled: true, shutterAngle: 180, samples: 8, directional: false },
  },

  camera: {
    energy: "steady",
    movement: { baseMovement: "subtle_drift", amplitude: 0.1, frequency: 0.15, randomJitter: 0.1 },
    lensSimulation: { focalLength: 50, distortion: 0, anamorphicSqueeze: 1.0, flareType: "none", flareIntensity: 0 },
    dofSimulation: { enabled: true, focalDepth: 0.4, aperture: 2.8, blurQuality: "fast", edgeBoost: false },
  },

  graphics: {
    text: {
      fontFamily: "context_aware", sizeFeel: "medium", weight: 400,
      animation: { entryAnimation: "fade_in", exitAnimation: "fade_out", idleBehavior: "static", perWordStagger: false, syncToAudio: false, bounceWiggle: 0, glitchFrequency: 0 },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.9, 0.9, 0.9] },
      outline: null, shadow: { enabled: true, offsetX: 2, offsetY: 2, blur: 4, color: [0, 0, 0], opacity: 1.0 }, glow: null, backgroundPlate: null,
      captionStyle: "timestamp_code",
    },
  },

  editorial: {
    avgShotDurationSec: 5.0, shotDurationVariance: 0.3,
    preferredDurations: [3, 5, 8, 12],
    cutStyle: "hard_cut", cutAlignment: "off_beat",
    closeupBias: 0.6, wideShotBias: 0.2,
    defaultTransition: { type: "cut", durationMs: 0, ease: "linear" },
    heroTransition: { type: "dissolve", durationMs: 500, ease: "linear" },
    pacingCurve: "rising",
  },

  audioReactivity: {
    enabled: false,
    onBeat: { triggerEffect: null, cutProbability: 0 },
  },
};
