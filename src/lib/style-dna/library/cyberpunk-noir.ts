import type { StyleDNA } from "../types";

export const CYBERPUNK_NOIR: StyleDNA = {
  id: "cyberpunk_neon_noir",
  name: "Cyberpunk Neon Noir",
  category: "internet_aesthetic",
  tags: ["neon", "rain", "tech", "dystopian", "blade_runner", "high_contrast"],
  sourceInfluences: ["blade_runner_2049", "cyberpunk_2077", "ghost_in_shell"],
  confidence: 0.92,

  grade: {
    lift: [-0.08, -0.06, -0.04],
    gamma: [1.0, 1.0, 1.1],
    gain: [0.9, 0.95, 1.3],
    offset: [0, 0, 0],
    saturation: 1.2,
    vibrance: 0,
    contrast: 1.45,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: -20,
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
    grain: { intensity: 0.08, size: 0.3, color: true, temporal: true },
    vignette: {
      amount: 0.4,
      midpoint: 0.5,
      roundness: 0.8,
      feather: 0.3,
      color: [0.0, 0.0, 0.05],
    },
    chromaticAberration: {
      intensity: 0.12,
      angle: 0,
      radial: true,
      channelOffsets: null,
    },
    bloom: {
      intensity: 0.35,
      threshold: 0.65,
      radius: 10,
      softness: 0.8,
      color: [0.0, 1.0, 1.0],
    },
  },

  globalEffects: {
    effects: [
      {
        id: "cy_light_leak",
        type: "light_leak",
        enabled: true,
        params: { intensity: 0.2, color: [0.0, 0.5, 0.8] as [number, number, number], angle: 15 },
      },
      {
        id: "cy_chromatic_glitch",
        type: "chromatic_glitch",
        enabled: true,
        params: { intensity: 0.8, channelOffset: 10 },
      },
      {
        id: "cy_scanlines",
        type: "scanlines",
        enabled: true,
        params: { intensity: 0.1 },
      },
    ],
    overallIntensity: 1.0,
    blendMode: "screen",
  },

  heroEffects: {
    effects: [
      {
        id: "cy_lens_flare",
        type: "lens_flare",
        enabled: true,
        params: { intensity: 0.8, color: [1.0, 0.0, 0.8] as [number, number, number] },
      },
    ],
    overallIntensity: 1.3,
    blendMode: "screen",
  },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "punch",
    tempo: "moderate",
    averageShotDurationSec: 3.0,
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
      randomJitter: 0.2,
    },
    lensSimulation: {
      focalLength: 35,
      distortion: 0.05,
      anamorphicSqueeze: 1.0,
      flareType: "anamorphic_streaks",
      flareIntensity: 0.4,
    },
    dofSimulation: {
      enabled: true,
      focalDepth: 0.4,
      aperture: 1.8,
      blurQuality: "bokeh_shapes",
      edgeBoost: true,
    },
  },

  graphics: {
    text: {
      fontFamily: "context_aware",
      sizeFeel: "medium",
      weight: 400,
      animation: {
        entryAnimation: "glitch_in",
        exitAnimation: "glitch_in",
        idleBehavior: "glitch_flicker",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0.1,
      },
      placement: "follow_subject",
      colorMode: {
        type: "neon_glow",
        coreColor: [0.0, 1.0, 1.0],
        glowColor: [1.0, 0.0, 1.0],
        glowSize: 8,
      },
      outline: null,
      shadow: null,
      glow: null,
      backgroundPlate: null,
      captionStyle: "kinetic_typography",
    },
    overlays: undefined,
    hudElements: [
      { type: "reticle", position: "corners" },
      { type: "data_stream", position: "side" },
    ],
  },

  editorial: {
    avgShotDurationSec: 3.0,
    shotDurationVariance: 0.5,
    cutStyle: "hard_cut",
    cutAlignment: "on_beat",
    closeupBias: 0.5,
    defaultTransition: { type: "cut", durationMs: 200, ease: "linear" },
    heroTransition: { type: "glitch", durationMs: 400, ease: "linear" },
    pacingCurve: "rising",
    useSplitScreen: true,
  },

  audioReactivity: {
    enabled: true,
    sensitivity: 1.2,
    smoothing: 0.1,
    onBeat: {
      triggerEffect: "chromatic_glitch",
      cutProbability: 0.3,
      flashWhite: 0.1,
    },
    onDrop: {
      triggerEffect: "lens_flare",
      maximumIntensity: 1.8,
      chromaticSpike: 0.2,
    },
    bassMapsTo: "chromatic_aberration",
    highMapsTo: "bloom",
  },
};
