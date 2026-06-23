import type { StyleDNA } from "../types";

export const edgarWrightSnap = {
  id: "edgar_wright_snap_comedy",
  name: "Edgar Wright Snap Comedy",
  category: "film_reference",
  tags: ["edgar-wright", "comedy", "snap", "kinetic", "punchy", "british"],
  sourceInfluences: ["Scott Pilgrim vs. the World", "Shaun of the Dead", "Hot Fuzz", "Baby Driver"],
  confidence: 0.94,

  grade: {
    lift: [0, 0, 0],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.05, 1.0, 1.0],
    offset: [0, 0, 0],
    saturation: 1.15,
    vibrance: 0,
    contrast: 1.25,
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
    grain: {
      intensity: 0.0,
      size: 0.3,
      color: true,
      temporal: true,
    },
    vignette: {
      amount: 0.1,
      midpoint: 0.5,
      roundness: 0.8,
      feather: 0.5,
      color: null,
    },
    bloom: null,
    chromaticAberration: null,
  },

  globalEffects: {
    effects: [
      {
        id: "whip_pan_global",
        type: "whip_pan",
        enabled: true,
        params: { intensity: 0.8, blur_amount: 20 },
        applyToShots: ["all"],
      },
    ],
    overallIntensity: 0.9,
    blendMode: "normal",
  },

  heroEffects: {
    effects: [
      {
        id: "zoom_pulse_hero",
        type: "zoom_pulse",
        enabled: true,
        params: { amount: 1.15, ease: "spring" },
        applyToShots: ["hero"],
      },
      {
        id: "comic_ink_edges_hero",
        type: "comic_ink_edges",
        enabled: true,
        params: { lineWeight: 3, edgeThreshold: 0.2 },
        applyToShots: ["hero"],
      },
    ],
    overallIntensity: 1.2,
    blendMode: "normal",
  },

  timing: {
    frameRateFeel: { type: "normal", fps: 24 },
    speedRampStyle: "punch",
    tempo: "brisk",
    averageShotDurationSec: 1.5,
    stutterConfig: null,
    motionBlur: {
      enabled: true,
      shutterAngle: 180,
      samples: 16,
      directional: true,
    },
  },

  camera: {
    energy: "kinetic",
    movement: {
      baseMovement: "snap_zoom",
      amplitude: 0.8,
      frequency: 2.0,
      randomJitter: 0.1,
    },
    lensSimulation: {
      focalLength: 35,
      distortion: 0.0,
      anamorphicSqueeze: 1.0,
      flareType: "none",
      flareIntensity: 0,
    },
    dofSimulation: null,
  },

  graphics: {
    text: {
      fontFamily: "Impact",
      sizeFeel: "large",
      weight: 900,
      animation: {
        entryAnimation: "scale_pop",
        exitAnimation: "scale_pop_reverse",
        idleBehavior: "bounce",
        perWordStagger: false,
        syncToAudio: true,
        bounceWiggle: 0.3,
        glitchFrequency: 0,
      },
      placement: "dynamic",
      colorMode: { type: "solid", color: [1.0, 1.0, 0.0] },
      outline: {
        enabled: true,
        width: 3,
        color: [0.0, 0.0, 0.0],
        opacity: 1.0,
      },
      shadow: {
        enabled: true,
        offsetX: 2,
        offsetY: 2,
        blur: 0,
        color: [0.0, 0.0, 0.0],
        opacity: 1.0,
      },
      glow: null,
      backgroundPlate: null,
      captionStyle: "kinetic_typography",
    },
  },

  editorial: {
    avgShotDurationSec: 1.5,
    shotDurationVariance: 0.3,
    preferredDurations: [0.5, 0.8, 1.0, 1.5, 2.0],
    cutStyle: "jump_cut",
    cutAlignment: "on_beat",
    closeupBias: 0.6,
    defaultTransition: {
      type: "cut",
      durationMs: 100,
      ease: "linear",
    },
    heroTransition: {
      type: "zoom_blur",
      durationMs: 200,
      ease: "spring",
    },
    pacingCurve: "staccato",
    useMontage: true,
    useSplitScreen: true,
    useJumpCuts: true,
    matchActionRequired: true,
  },

  audioReactivity: {
    enabled: true,
    onBeat: {
      triggerEffect: "zoom_pulse",
      cutProbability: 0.6,
      zoomPulse: 0.05,
    },
    onDrop: {
      triggerEffect: "comic_ink_edges",
      maximumIntensity: 1.5,
    },
    sensitivity: 1.5,
    smoothing: 0,
  },
} as const satisfies StyleDNA;
