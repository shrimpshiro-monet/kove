import type { StyleDNA } from "../types";

export const a24Horror = {
  id: "a24_elevated_horror",
  name: "A24 Elevated Horror",
  category: "film_reference",
  tags: ["a24", "horror", "elevated", "atmospheric", "slow-burn", "dread"],
  sourceInfluences: ["Hereditary", "Midsommar", "The Witch", "It Comes at Night", "Talk to Me"],
  confidence: 0.91,

  grade: {
    lift: [-0.06, -0.05, -0.04],
    gamma: [1.02, 1.0, 0.98],
    gain: [0.98, 1.0, 0.96],
    offset: [0, 0, 0],
    saturation: 0.75,
    vibrance: 0,
    contrast: 1.2,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: -10,
    tint: 3,
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
    grain: {
      intensity: 0.22,
      size: 0.6,
      color: true,
      temporal: true,
    },
    vignette: {
      amount: 0.4,
      midpoint: 0.5,
      roundness: 0.8,
      feather: 0.3,
      color: [0.0, 0.0, 0.0],
    },
    bloom: null,
    chromaticAberration: null,
  },

  globalEffects: {
    effects: [
      {
        id: "noise_grain_global",
        type: "noise_grain",
        enabled: true,
        params: { intensity: 0.22 },
        applyToShots: ["all"],
      },
    ],
    overallIntensity: 0.9,
    blendMode: "normal",
  },

  heroEffects: {
    effects: [
      {
        id: "flash_white_hero",
        type: "flash_white",
        enabled: true,
        params: { intensity: 0.6, duration_frames: 3 },
        applyToShots: ["hero"],
      },
    ],
    overallIntensity: 1.0,
    blendMode: "screen",
  },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "slowburn",
    tempo: "static",
    averageShotDurationSec: 10.0,
    stutterConfig: null,
    motionBlur: {
      enabled: true,
      shutterAngle: 180,
      samples: 16,
      directional: true,
    },
  },

  camera: {
    energy: "handheld_natural",
    movement: {
      baseMovement: "subtle_drift",
      amplitude: 0.15,
      frequency: 0.2,
      randomJitter: 0.4,
    },
    lensSimulation: {
      focalLength: 50,
      distortion: 0.0,
      anamorphicSqueeze: 1.0,
      flareType: "none",
      flareIntensity: 0,
    },
    dofSimulation: {
      enabled: true,
      focalDepth: 0.4,
      aperture: 2.8,
      blurQuality: "high",
      edgeBoost: false,
    },
  },

  graphics: {
    text: {
      fontFamily: "context_aware",
      sizeFeel: "small",
      weight: 400,
      animation: {
        entryAnimation: "fade_in",
        exitAnimation: "fade_out",
        idleBehavior: "static",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0,
      },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.9, 0.9, 0.9] },
      outline: null,
      shadow: null,
      glow: null,
      backgroundPlate: null,
      captionStyle: "timestamp_code",
    },
  },

  editorial: {
    avgShotDurationSec: 10.0,
    shotDurationVariance: 0.4,
    preferredDurations: [6, 10, 15, 20],
    cutStyle: "hard_cut",
    cutAlignment: "off_beat",
    closeupBias: 0.5,
    wideShotBias: 0.3,
    defaultTransition: {
      type: "cut",
      durationMs: 300,
      ease: "linear",
    },
    heroTransition: {
      type: "flash",
      durationMs: 100,
      ease: "linear",
    },
    pacingCurve: "rising",
    useMontage: false,
    useSplitScreen: false,
    useJumpCuts: false,
    matchActionRequired: false,
  },

  audioReactivity: {
    enabled: false,
    onBeat: {
      triggerEffect: null,
      cutProbability: 0,
    },
  },
} as const satisfies StyleDNA;
