import type { StyleDNA } from "../types";

export const EIGHTIES_VHS_SYNTH: StyleDNA = {
  id: "80s_vhs_synthwave",
  name: "1980s VHS Synthwave",
  category: "era_based",
  tags: ["retro", "80s", "vhs", "synth", "neon", "grid_lines"],
  sourceInfluences: ["miami_vice", "tron_1982", "kavinsky_nightcall"],
  confidence: 0.90,

  grade: {
    lift: [0.02, 0.0, 0.03],
    gamma: [1.0, 1.0, 1.1],
    gain: [1.0, 0.85, 1.2],
    offset: [0, 0, 0],
    saturation: 1.3,
    vibrance: 0,
    contrast: 1.2,
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
    filmStock: null,
    grain: { intensity: 0.25, size: 0.7, color: true, temporal: true },
    vignette: {
      amount: 0.25,
      midpoint: 0.5,
      roundness: 0.8,
      feather: 0.5,
      color: [0.1, 0.0, 0.15],
    },
    chromaticAberration: {
      intensity: 0.08,
      angle: 0,
      radial: true,
      channelOffsets: null,
    },
    bloom: {
      intensity: 0.2,
      threshold: 0.8,
      radius: 10,
      softness: 0.8,
      color: [1.0, 0.5, 0.8],
    },
  },

  globalEffects: {
    effects: [
      {
        id: "80s_scanlines",
        type: "scanlines",
        enabled: true,
        params: { intensity: 0.25, curved: true },
      },
      {
        id: "80s_vhs_tracking",
        type: "vhs_tracking",
        enabled: true,
        params: { intensity: 0.3, tracking_error: 0.3 },
      },
      {
        id: "80s_perspective_grid",
        type: "overlay",
        enabled: true,
        params: { type: "perspective_grid", color: [1.0, 0.0, 1.0] as [number, number, number], opacity: 0.1 },
      },
    ],
    overallIntensity: 0.9,
    blendMode: "screen",
  },

  heroEffects: {
    effects: [],
    overallIntensity: 1.0,
    blendMode: "normal",
  },

  timing: {
    frameRateFeel: { type: "normal", fps: 29.97 },
    speedRampStyle: "none",
    tempo: "moderate",
    averageShotDurationSec: 4.0,
    stutterConfig: null,
    motionBlur: null,
  },

  camera: {
    energy: "handheld_natural",
    movement: {
      baseMovement: "drift",
      amplitude: 0.2,
      frequency: 0.1,
      randomJitter: 0.2,
    },
    lensSimulation: {
      focalLength: 35,
      distortion: 0.1,
      anamorphicSqueeze: 1.0,
      flareType: "anamorphic_streaks",
      flareIntensity: 0.3,
    },
    dofSimulation: null,
  },

  graphics: {
    text: {
      fontFamily: "context_aware",
      sizeFeel: "large",
      weight: 700,
      animation: {
        entryAnimation: "glitch_in",
        exitAnimation: "glitch_in",
        idleBehavior: "glitch_flicker",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0.15,
      },
      placement: "center_title",
      colorMode: {
        type: "gradient",
        colors: [[1.0, 0.0, 1.0], [0.0, 1.0, 1.0]],
        angle: 45,
      },
      outline: { enabled: true, width: 2, color: [0, 0, 0], opacity: 1 },
      shadow: null,
      glow: { enabled: true, color: [1.0, 0.0, 1.0], size: 8 },
      backgroundPlate: null,
      captionStyle: "watermark",
    },
    overlays: undefined,
    hudElements: undefined,
  },

  editorial: {
    avgShotDurationSec: 4.0,
    shotDurationVariance: 0.3,
    cutStyle: "hard_cut",
    cutAlignment: "musical_phrase",
    closeupBias: 0.3,
    defaultTransition: {
      type: "dip_to_color",
      durationMs: 500,
      ease: "linear",
      params: { color: [0.0, 0.0, 0.2] as [number, number, number] },
    },
    heroTransition: { type: "cut", durationMs: 200, ease: "linear" },
    pacingCurve: "flat",
  },

  audioReactivity: {
    enabled: true,
    sensitivity: 1.0,
    smoothing: 0.3,
    onBeat: {
      triggerEffect: "scanlines",
      cutProbability: 0.2,
    },
  },
};
