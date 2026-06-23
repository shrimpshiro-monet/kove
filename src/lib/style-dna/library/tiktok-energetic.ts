import type { StyleDNA } from "../types";

export const TIKTOK_ENERGETIC: StyleDNA = {
  id: "tiktok_energetic",
  name: "TikTok Energetic",
  category: "social_media_format",
  tags: ["tiktok", "energetic", "fast", "punchy", "viral", "hooks"],
  sourceInfluences: ["tiktok_trending", "douyin_edits", "instagram_reels"],
  confidence: 0.92,

  grade: {
    lift: [0.0, 0.0, 0.0],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.05, 1.05, 1.05],
    offset: [0, 0, 0],
    saturation: 0.9,
    vibrance: 0.2,
    contrast: 1.4,
    pivot: 0.45,
    hueShift: 0,
    mix: 1.0,
    temperature: 8,
    tint: 0,
    exposure: 0.05,
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
    vignette: { amount: 0.15, midpoint: 0.5, roundness: 0.8, feather: 0.3, color: [0, 0, 0] },
    bloom: null,
    chromaticAberration: null,
  },

  globalEffects: { effects: [], overallIntensity: 1.0, blendMode: "normal" },
  heroEffects: { effects: [], overallIntensity: 1.0, blendMode: "screen" },

  timing: {
    frameRateFeel: { type: "normal", fps: 30 },
    speedRampStyle: "punch",
    tempo: "frantic",
    averageShotDurationSec: 0.8,
    stutterConfig: null,
    motionBlur: { enabled: false, shutterAngle: 0, samples: 0, directional: false },
  },

  camera: {
    energy: "handheld_natural",
    movement: { baseMovement: "snap_zoom", amplitude: 0.3, frequency: 2.0, randomJitter: 0.5 },
    lensSimulation: { focalLength: 35, distortion: 0, anamorphicSqueeze: 1.0, flareType: "none", flareIntensity: 0 },
    dofSimulation: { enabled: false, focalDepth: 0.5, aperture: 5.6, blurQuality: "fast", edgeBoost: false },
  },

  graphics: {
    text: {
      fontFamily: "context_aware", sizeFeel: "large", weight: 700,
      animation: { entryAnimation: "scale_pop", exitAnimation: "scale_pop", idleBehavior: "static", perWordStagger: false, syncToAudio: false, bounceWiggle: 0, glitchFrequency: 0 },
      placement: "center_title",
      colorMode: { type: "solid", color: [1.0, 1.0, 1.0] },
      outline: { enabled: true, color: [0, 0, 0], width: 3, opacity: 1.0 }, shadow: null, glow: null, backgroundPlate: null,
      captionStyle: "kinetic_typography",
    },
  },

  editorial: {
    avgShotDurationSec: 0.8, shotDurationVariance: 0.5,
    preferredDurations: [0.3, 0.5, 0.8, 1.2],
    cutStyle: "hard_cut", cutAlignment: "on_beat",
    closeupBias: 0.7, wideShotBias: 0.1,
    defaultTransition: { type: "cut", durationMs: 0, ease: "linear" },
    heroTransition: { type: "flash", durationMs: 50, ease: "linear" },
    pacingCurve: "rising",
  },

  audioReactivity: {
    enabled: true,
    onBeat: { triggerEffect: "flash_white", cutProbability: 0.8 },
  },
};
