import type { StyleDNA } from "../types";

export const LOFI_HIPHOP: StyleDNA = {
  id: "lofi_hiphop_chill",
  name: "Lo-Fi Hip Hop Beats",
  category: "internet_aesthetic",
  tags: ["chill", "study", "vinyl", "warm", "anime_aesthetic", "cozy"],
  sourceInfluences: ["lofi_girl_animation", "chillhop_community"],
  confidence: 0.89,

  grade: {
    lift: [0.03, 0.02, 0.0],
    gamma: [1.05, 1.0, 0.95],
    gain: [1.0, 0.98, 0.95],
    offset: [0, 0, 0],
    saturation: 0.8,
    vibrance: 0,
    contrast: 1.1,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: 20,
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
    grain: { intensity: 0.18, size: 0.5, color: true, temporal: true },
    vignette: {
      amount: 0.3,
      midpoint: 0.5,
      roundness: 0.9,
      feather: 0.7,
      color: [0.08, 0.04, 0.0],
    },
    chromaticAberration: {
      intensity: 0.015,
      angle: 0,
      radial: true,
      channelOffsets: null,
    },
    bloom: null,
  },

  globalEffects: {
    effects: [
      {
        id: "lofi_vhs_tracking",
        type: "vhs_tracking",
        enabled: true,
        params: { intensity: 0.15, noise: 0.2 },
      },
      {
        id: "lofi_particles",
        type: "particle_system",
        enabled: true,
        params: { count: 50, size: 1, speed: 0.2, opacity: 0.1 },
      },
    ],
    overallIntensity: 0.85,
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
    tempo: "leisurely",
    averageShotDurationSec: 6.0,
    stutterConfig: null,
    motionBlur: null,
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
      focalLength: 50,
      distortion: 0,
      anamorphicSqueeze: 1.0,
      flareType: "none",
      flareIntensity: 0,
    },
    dofSimulation: null,
  },

  graphics: {
    text: {
      fontFamily: "context_aware",
      sizeFeel: "small",
      weight: 400,
      animation: {
        entryAnimation: "fade_in",
        exitAnimation: "fade_out",
        idleBehavior: "gentle_float",
        perWordStagger: false,
        syncToAudio: false,
        bounceWiggle: 0,
        glitchFrequency: 0,
      },
      placement: "lower_third",
      colorMode: { type: "solid", color: [0.9, 0.85, 0.8] },
      outline: null,
      shadow: null,
      glow: null,
      backgroundPlate: null,
      captionStyle: "quote_card",
    },
    overlays: undefined,
    hudElements: undefined,
  },

  editorial: {
    avgShotDurationSec: 6.0,
    shotDurationVariance: 0.3,
    cutStyle: "dissolve",
    cutAlignment: "musical_phrase",
    closeupBias: 0.3,
    defaultTransition: { type: "dissolve", durationMs: 1500, ease: "ease_in_out" },
    heroTransition: { type: "dissolve", durationMs: 2000, ease: "ease_in_out" },
    pacingCurve: "flat",
  },

  audioReactivity: {
    enabled: true,
    sensitivity: 0.6,
    smoothing: 0.5,
    onBeat: {
      triggerEffect: null,
      cutProbability: 0.1,
      zoomPulse: 0.01,
    },
  },
};
