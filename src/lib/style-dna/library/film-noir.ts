import type { StyleDNA } from "../types";

export const FILM_NOIR_CLASSIC: StyleDNA = {
  id: "film_noir_classic",
  name: "Film Noir Classic",
  category: "film_reference",
  tags: ["film_noir", "black_and_white", "detective", "shadows", "high_contrast"],
  sourceInfluences: ["the_third_man", "double_indemnity", "sin_city"],
  confidence: 0.90,

  grade: {
    lift: [0.0, 0.0, 0.0],
    gamma: [1.0, 1.0, 1.0],
    gain: [0.95, 0.95, 0.95],
    offset: [0, 0, 0],
    saturation: 0.2,
    vibrance: 0,
    contrast: 1.5,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: -8,
    tint: 0,
    exposure: -0.05,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    tealOrange: false,
    orangeTealIntensity: 0.6,
    bleachBypass: false,
    bleachBypassIntensity: 0.4,
    splitToning: null,
    filmStock: "kodak_trix_400",
    grain: { intensity: 0.3, size: 0.7, color: false, temporal: true },
    vignette: { amount: 0.4, midpoint: 0.5, roundness: 0.8, feather: 0.3, color: [0, 0, 0] },
    bloom: null,
    chromaticAberration: null,
  },

  globalEffects: { effects: [], overallIntensity: 0.9, blendMode: "normal" },
  heroEffects: { effects: [], overallIntensity: 1.0, blendMode: "screen" },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "none",
    tempo: "leisurely",
    averageShotDurationSec: 6.0,
    stutterConfig: null,
    motionBlur: { enabled: true, shutterAngle: 180, samples: 8, directional: false },
  },

  camera: {
    energy: "steady",
    movement: { baseMovement: "subtle_drift", amplitude: 0.12, frequency: 0.12, randomJitter: 0.15 },
    lensSimulation: { focalLength: 50, distortion: 0, anamorphicSqueeze: 1.0, flareType: "none", flareIntensity: 0 },
    dofSimulation: { enabled: true, focalDepth: 0.4, aperture: 2.0, blurQuality: "fast", edgeBoost: false },
  },

  graphics: {
    text: {
      fontFamily: "context_aware", sizeFeel: "medium", weight: 400,
      animation: { entryAnimation: "fade_in", exitAnimation: "fade_out", idleBehavior: "static", perWordStagger: false, syncToAudio: false, bounceWiggle: 0, glitchFrequency: 0 },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.85, 0.85, 0.85] },
      outline: null, shadow: { enabled: true, offsetX: 2, offsetY: 2, blur: 6, color: [0, 0, 0], opacity: 1.0 }, glow: null, backgroundPlate: null,
      captionStyle: "timestamp_code",
    },
  },

  editorial: {
    avgShotDurationSec: 6.0, shotDurationVariance: 0.3,
    preferredDurations: [3, 6, 10, 15],
    cutStyle: "hard_cut", cutAlignment: "off_beat",
    closeupBias: 0.5, wideShotBias: 0.3,
    defaultTransition: { type: "cut", durationMs: 0, ease: "linear" },
    heroTransition: { type: "dissolve", durationMs: 600, ease: "linear" },
    pacingCurve: "flat",
  },

  audioReactivity: {
    enabled: false,
    onBeat: { triggerEffect: null, cutProbability: 0 },
  },
};
