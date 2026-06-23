import type { StyleDNA } from "../types";

export const VIBRANT_NEON: StyleDNA = {
  id: "vibrant_neon",
  name: "Vibrant Neon",
  category: "internet_aesthetic",
  tags: ["neon", "vibrant", "electric", "cyberpunk", "glow", "saturated"],
  sourceInfluences: ["cyberpunk_2077", "tron_legacy", "neon_genesis"],
  confidence: 0.88,

  grade: {
    lift: [0.0, 0.0, 0.02],
    gamma: [1.0, 1.0, 1.05],
    gain: [1.1, 1.0, 1.15],
    offset: [0, 0, 0],
    saturation: 1.5,
    vibrance: 0.3,
    contrast: 1.2,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: -12,
    tint: 0,
    exposure: 0.1,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    tealOrange: false,
    orangeTealIntensity: 0.6,
    bleachBypass: false,
    bleachBypassIntensity: 0.4,
    splitToning: null,
    filmStock: null,
    grain: { intensity: 0.0, size: 0, color: false, temporal: false },
    vignette: { amount: 0.1, midpoint: 0.5, roundness: 0.8, feather: 0.3, color: [0, 0, 0] },
    bloom: { intensity: 0.35, threshold: 0.6, radius: 0.5, softness: 0.4, color: [0.8, 0.9, 1.0] },
    chromaticAberration: { intensity: 0.06, angle: 0, radial: true, channelOffsets: null },
  },

  globalEffects: { effects: [], overallIntensity: 1.0, blendMode: "normal" },
  heroEffects: { effects: [], overallIntensity: 1.0, blendMode: "screen" },

  timing: {
    frameRateFeel: { type: "normal", fps: 30 },
    speedRampStyle: "punch",
    tempo: "brisk",
    averageShotDurationSec: 1.5,
    stutterConfig: null,
    motionBlur: { enabled: false, shutterAngle: 0, samples: 0, directional: false },
  },

  camera: {
    energy: "handheld_natural",
    movement: { baseMovement: "snap_zoom", amplitude: 0.2, frequency: 1.5, randomJitter: 0.3 },
    lensSimulation: { focalLength: 35, distortion: 0, anamorphicSqueeze: 1.0, flareType: "anamorphic_streaks", flareIntensity: 0.4 },
    dofSimulation: { enabled: false, focalDepth: 0.5, aperture: 5.6, blurQuality: "fast", edgeBoost: false },
  },

  graphics: {
    text: {
      fontFamily: "context_aware", sizeFeel: "large", weight: 700,
      animation: { entryAnimation: "scale_pop", exitAnimation: "scale_pop", idleBehavior: "pulse", perWordStagger: false, syncToAudio: false, bounceWiggle: 0, glitchFrequency: 0 },
      placement: "center_title",
      colorMode: { type: "solid", color: [0.0, 1.0, 0.8] },
      outline: { enabled: true, color: [0, 0, 0], width: 2, opacity: 1.0 }, shadow: null, glow: { enabled: true, color: [0, 0.8, 1.0], size: 12 }, backgroundPlate: null,
      captionStyle: "kinetic_typography",
    },
  },

  editorial: {
    avgShotDurationSec: 1.5, shotDurationVariance: 0.5,
    preferredDurations: [0.5, 1.0, 1.5, 2.5],
    cutStyle: "hard_cut", cutAlignment: "on_beat",
    closeupBias: 0.6, wideShotBias: 0.2,
    defaultTransition: { type: "cut", durationMs: 0, ease: "linear" },
    heroTransition: { type: "flash", durationMs: 80, ease: "linear" },
    pacingCurve: "rising",
  },

  audioReactivity: {
    enabled: true,
    onBeat: { triggerEffect: "flash_white", cutProbability: 0.7 },
  },
};
