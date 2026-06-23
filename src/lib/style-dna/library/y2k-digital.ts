import type { StyleDNA } from "../types";

export const Y2K_DIGITAL: StyleDNA = {
  id: "y2k_early_digital_cam",
  name: "Y2K Early Digital Camera",
  category: "era_based",
  tags: ["2000s", "flip_phone", "low_res", "pixelated", "ms_paint", "early_internet"],
  sourceInfluences: ["early_digital_cameras", "ms_paint_aesthetic", "flip_phone_videos"],
  confidence: 0.86,

  grade: {
    lift: [0, 0, 0],
    gamma: [1.1, 1.0, 0.9],
    gain: [1.0, 1.05, 1.0],
    offset: [0, 0, 0],
    saturation: 0.9,
    vibrance: 0,
    contrast: 1.15,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: 5,
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
    grain: { intensity: 0.0, size: 0.3, color: true, temporal: true },
    vignette: null,
    chromaticAberration: null,
    bloom: null,
  },

  globalEffects: {
    effects: [
      {
        id: "y2k_posterize",
        type: "posterize",
        enabled: true,
        params: { levels: 16 },
      },
      {
        id: "y2k_artifact_block",
        type: "artifact_block",
        enabled: true,
        params: { block_size: 8, intensity: 0.3 },
      },
      {
        id: "y2k_date_stamp",
        type: "overlay",
        enabled: true,
        params: { type: "date_stamp", format: "2003/10/26" },
      },
    ],
    overallIntensity: 0.9,
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
    tempo: "moderate",
    averageShotDurationSec: 5.0,
    stutterConfig: null,
    motionBlur: null,
  },

  camera: {
    energy: "handheld_natural",
    movement: {
      baseMovement: "drift",
      amplitude: 0.1,
      frequency: 0.1,
      randomJitter: 0,
    },
    lensSimulation: {
      focalLength: 35,
      distortion: 0,
      anamorphicSqueeze: 1.0,
      flareType: "none",
      flareIntensity: 0,
    },
    dofSimulation: null,
  },

  graphics: {
    text: {
      fontFamily: "Comic Sans MS",
      sizeFeel: "medium",
      weight: 400,
      animation: {
        entryAnimation: "typewriter",
        exitAnimation: "fade_in",
        idleBehavior: "static",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0,
      },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.0, 0.0, 1.0] },
      outline: null,
      shadow: null,
      glow: null,
      backgroundPlate: null,
      captionStyle: "timestamp_code",
    },
    overlays: undefined,
    hudElements: undefined,
  },

  editorial: {
    avgShotDurationSec: 5.0,
    shotDurationVariance: 0.3,
    cutStyle: "hard_cut",
    cutAlignment: "dialogue_rhythm",
    closeupBias: 0.3,
    defaultTransition: { type: "cut", durationMs: 500, ease: "linear" },
    heroTransition: { type: "cut", durationMs: 500, ease: "linear" },
    pacingCurve: "flat",
  },

  audioReactivity: {
    enabled: false,
    onBeat: {
      triggerEffect: null,
      cutProbability: 0,
    },
  },
};
