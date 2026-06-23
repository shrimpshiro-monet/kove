import type { StyleDNA } from "../types";

export const NINETIES_GRUNGE: StyleDNA = {
  id: "90s_grunge_raw",
  name: "1990s Grunge Raw",
  category: "era_based",
  tags: ["90s", "grunge", "raw", "underground", "music_video", "handheld"],
  sourceInfluences: ["nirvana_smells_like_teen_spirit", "pearl_jam_jeremy"],
  confidence: 0.88,

  grade: {
    lift: [-0.02, -0.02, -0.02],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.0, 1.0, 1.0],
    offset: [0, 0, 0],
    saturation: 0.75,
    vibrance: 0,
    contrast: 1.3,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: 0,
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
    filmStock: null,
    grain: { intensity: 0.3, size: 0.8, color: true, temporal: true },
    vignette: {
      amount: 0.2,
      midpoint: 0.5,
      roundness: 0.8,
      feather: 0.5,
      color: null,
    },
    chromaticAberration: null,
    bloom: null,
  },

  globalEffects: {
    effects: [
      {
        id: "90s_noise_grain",
        type: "noise_grain",
        enabled: true,
        params: { intensity: 0.3 },
      },
      {
        id: "90s_posterize",
        type: "posterize",
        enabled: true,
        params: { levels: 32 },
      },
    ],
    overallIntensity: 0.95,
    blendMode: "normal",
  },

  heroEffects: {
    effects: [],
    overallIntensity: 1.0,
    blendMode: "normal",
  },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "none",
    tempo: "frantic",
    averageShotDurationSec: 2.0,
    stutterConfig: null,
    motionBlur: null,
  },

  camera: {
    energy: "handheld_aggressive",
    movement: {
      baseMovement: "shake_aggressive",
      amplitude: 0.5,
      frequency: 2.0,
      randomJitter: 0.6,
    },
    lensSimulation: {
      focalLength: 28,
      distortion: 0.1,
      anamorphicSqueeze: 1.0,
      flareType: "none",
      flareIntensity: 0,
    },
    dofSimulation: null,
  },

  graphics: {
    text: {
      fontFamily: "context_aware",
      sizeFeel: "medium",
      weight: 700,
      animation: {
        entryAnimation: "cut",
        exitAnimation: "fade_in",
        idleBehavior: "static",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0,
      },
      placement: "lower_third",
      colorMode: { type: "solid", color: [1.0, 1.0, 1.0] },
      outline: { enabled: true, width: 2, color: [0, 0, 0], opacity: 1 },
      shadow: null,
      glow: null,
      backgroundPlate: null,
      captionStyle: "lower_third_name",
    },
    overlays: undefined,
    hudElements: undefined,
  },

  editorial: {
    avgShotDurationSec: 2.0,
    shotDurationVariance: 0.6,
    cutStyle: "jump_cut",
    cutAlignment: "on_beat",
    closeupBias: 0.5,
    defaultTransition: { type: "cut", durationMs: 100, ease: "linear" },
    heroTransition: { type: "cut", durationMs: 100, ease: "linear" },
    pacingCurve: "staccato",
    useJumpCuts: true,
  },

  audioReactivity: {
    enabled: true,
    sensitivity: 1.3,
    smoothing: 0.1,
    onBeat: {
      triggerEffect: "context_shake",
      cutProbability: 0.5,
    },
  },
};
