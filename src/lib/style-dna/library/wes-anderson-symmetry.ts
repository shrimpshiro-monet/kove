import type { StyleDNA } from "../types";

export const wesAndersonSymmetry = {
  id: "wes_anderson_centered",
  name: "Wes Anderson Symmetric",
  category: "film_reference",
  tags: ["wes-anderson", "symmetry", "pastel", "whimsical", "centered"],
  sourceInfluences: ["The Grand Budapest Hotel", "Moonrise Kingdom", "The Royal Tenenbaums", "The Life Aquatic"],
  confidence: 0.90,

  grade: {
    lift: [0.02, 0.01, 0.0],
    gamma: [0.98, 1.0, 1.02],
    gain: [1.0, 1.0, 0.98],
    offset: [0, 0, 0],
    saturation: 0.85,
    vibrance: -0.1,
    contrast: 1.05,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: -5,
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
    filmStock: "fuji_provia_100f",
    grain: {
      intensity: 0.06,
      size: 0.3,
      color: true,
      temporal: true,
    },
    vignette: {
      amount: 0.15,
      midpoint: 0.5,
      roundness: 1.0,
      feather: 0.8,
      color: [0.05, 0.02, 0.0],
    },
    chromaticAberration: null,
    bloom: {
      intensity: 0.08,
      threshold: 0.85,
      radius: 10,
      softness: 0.8,
      color: [1.0, 0.95, 0.9],
    },
  },

  globalEffects: {
    effects: [
      {
        id: "bloom_global",
        type: "bloom",
        enabled: true,
        params: { intensity: 0.08, softness: 0.9 },
        applyToShots: ["all"],
      },
    ],
    overallIntensity: 0.8,
    blendMode: "soft_light",
  },

  heroEffects: {
    effects: [],
    overallIntensity: 1.0,
    blendMode: "normal",
  },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "none",
    tempo: "moderate",
    averageShotDurationSec: 5.0,
    stutterConfig: null,
    motionBlur: {
      enabled: true,
      shutterAngle: 172.8,
      samples: 16,
      directional: true,
    },
  },

  camera: {
    energy: "locked_off",
    movement: {
      baseMovement: "none",
      amplitude: 0,
      frequency: 0,
      randomJitter: 0,
    },
    lensSimulation: {
      focalLength: 35,
      distortion: 0.0,
      anamorphicSqueeze: 1.0,
      flareType: "subtle",
      flareIntensity: 0.05,
    },
    dofSimulation: {
      enabled: true,
      focalDepth: 0.5,
      aperture: 5.6,
      blurQuality: "high",
      edgeBoost: true,
    },
  },

  graphics: {
    text: {
      fontFamily: "Futura",
      fallbackFonts: ["Helvetica Neue", "Arial"],
      sizeFeel: "medium",
      weight: 500,
      animation: {
        entryAnimation: "fade_in",
        exitAnimation: "fade_out",
        idleBehavior: "static",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0,
      },
      placement: "center_title",
      colorMode: { type: "solid", color: [0.2, 0.15, 0.1] },
      outline: null,
      shadow: null,
      glow: null,
      backgroundPlate: null,
      captionStyle: "interstitial_title",
    },
  },

  editorial: {
    avgShotDurationSec: 5.0,
    shotDurationVariance: 0.2,
    preferredDurations: [4, 5, 6, 8],
    cutStyle: "hard_cut",
    cutAlignment: "musical_phrase",
    closeupBias: 0.4,
    wideShotBias: 0.4,
    defaultTransition: {
      type: "dissolve",
      durationMs: 800,
      ease: "linear",
    },
    heroTransition: {
      type: "iris_in",
      durationMs: 1200,
      ease: "ease_in_out",
    },
    pacingCurve: "flat",
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
