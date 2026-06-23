// MonetEDL - Edit Decision List Schema
// The AI-generated edit plan that becomes a video

import { z } from "zod";

/**
 * Edit DNA - Quantified Style Signature
 */
export interface EditDNA {
  cutDensity: number; // 0-1, how frequently cuts happen
  motionAggression: number; // 0-1, camera motion intensity
  transitionRhythm: "mechanical" | "syncopated" | "organic" | "chaotic";
  emotionalCadence: "rising" | "falling" | "wave" | "plateau";
  visualChaos: number; // 0-1, compositional variety
  colorTemperature: "cool" | "warm" | "mixed";
  effectIntensity: number; // 0-1, how heavy effects are
  beatAlignmentStrictness: number; // 0-1, how tightly synced to music
}

export interface Act {
  name: string;
  startTime: number;
  duration: number;
  energy: number;
  mood: string;
}

export interface CharacterFocus {
  name: string;
  prominence: number;
  emotionalArc?: string;
}

export interface SegmentRef {
  clipId: string;
  inPoint: number;
  outPoint: number;
  reason?: string;
}

/**
 * Edit Intent Layer
 */
export interface EditIntent {
  version: string;
  goal: { primary: string; secondary?: string[] };
  targetAudience: { platform: "tiktok" | "youtube" | "instagram" | "twitter" | "general"; demographics?: string };
  style: { genre: string; pacing: "slow" | "medium" | "fast" | "aggressive" | "varied"; mood: string[]; referenceStyle?: string };
  structure: { duration: number; acts?: Act[]; energyCurve: number[]; climaxPoint?: number };
  technical: { syncToBeat: boolean; beatSyncStrength?: number; avgShotDuration?: number; transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed"; colorTreatment: "vibrant" | "cinematic" | "vintage" | "raw" | "anime" | "monochrome"; effectsIntensity: number };
  contentPreferences: { focusOn?: string[]; avoid?: string[]; characters?: CharacterFocus[] };
  constraints?: { mustInclude?: SegmentRef[]; mustAvoid?: string[]; maxComplexity?: "simple" | "medium" | "complex" };
}

/**
 * Complete edit timeline
 * This is what Gemini generates after analyzing footage + music
 */
export interface MonetEDL {
  version: string; // "1.0.0"

  metadata: {
    title: string;
    createdAt: number;
    aiModel: string; // "gemini-2.5-flash"
    prompt: string; // User's original request
    intentId: string; // Reference to EditIntent
    analysisId: string; // Reference to AnalysisResult
    projectId?: string; // The project/thread this belongs to
  };

  timeline: {
    resolution: { width: number; height: number }; // 1920x1080
    fps: number; // 30, 60
    duration: number; // Total seconds
  };

  music?: {
    id: string; // Stable ID for editing
    sourceId: string; // Media item ID
    bpm: number;
    beatGrid: number[]; // Timestamps of beats
    volume: number; // 0-1
    fadeIn?: number; // Seconds
    fadeOut?: number; // Seconds
  };

  shots: Shot[]; // Ordered list of shots

  /** Global edit intensity 0-1. Scales all effects, color, motion, transitions. */
  intensity?: number;

  globalEffects?: {
    colorGrade?: ColorGradePreset;
    vignette?: number; // 0-1
    grain?: number; // 0-1
  };
}

export interface MotionTrackKeyframe {
  time: number; // Seconds in source clip time
  x: number; // -1..1 normalized
  y: number; // -1..1 normalized
  scale?: number;
  rotation?: number;
  confidence?: number; // 0..1
}

export interface MotionTrack {
  id: string;
  clipId: string;
  method: "feature" | "face" | "object";
  keyframes: MotionTrackKeyframe[];
}

export interface PlanarCorner {
  x: number; // -1..1 normalized
  y: number; // -1..1 normalized
}

export interface PlanarTrackKeyframe {
  time: number; // Seconds in source clip time
  corners: [PlanarCorner, PlanarCorner, PlanarCorner, PlanarCorner]; // TL, TR, BR, BL
  confidence?: number;
}

export interface PlanarTrack {
  id: string;
  clipId: string;
  keyframes: PlanarTrackKeyframe[];
}

export interface MaskAsset {
  id: string;
  clipId: string;
  startTime: number; // Start in source clip
  duration: number;
  subject: string; // The thing being masked (e.g., "person", "car")
  maskUrl?: string; // URL to the generated binary mask/video
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number; // Main timeline seconds
  endTime: number; // Main timeline seconds
  offset?: { x: number; y: number }; // -1..1 normalized offset
  style?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    weight?: string;
    shadow?: boolean;
    alignment?: "left" | "center" | "right";
    letterSpacing?: number;
    lineHeight?: number;
  };
  animation?: {
    inType: "pop" | "fade" | "slide" | "glitch";
    outType: "pop" | "fade" | "slide" | "glitch";
    duration: number;
    easing: EasingType;
  };
  tracking?: {
    trackId: string;
    mode: "follow" | "behind_subject" | "planar";
  };
}

export type EasingType =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bezier"
  | "elastic"
  | "bounce";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "add"
  | "subtract";

export interface Keyframe<T> {
  time: number; // Seconds within the shot
  value: T;
  easing?: EasingType;
}

export type Keyframeable<T> = T | Keyframe<T>[];

/**
 * A single shot in the timeline
 */
export interface Shot {
  id: string;
  name?: string;
  zIndex?: number;
  meta?: Record<string, any>;

  source: {
    clipId: string; // Media item ID
    inPoint: number; // Trim start (seconds into source)
    outPoint: number; // Trim end
    rotation?: number; // Source rotation in degrees (0, 90, 180, 270)
  };

  timing: {
    startTime: number; // Position on main timeline
    duration: number; // Duration on timeline
    speed?: number; // 1.0 = normal, 0.5 = slow-mo, 2.0 = fast
    speedRamp?: {
      startSpeed: number;
      endSpeed: number;
      easing: EasingType;
    };
  };

  transform?: {
    position?: Keyframeable<{ x: number; y: number }>; // -1 to 1 (normalized)
    scale?: Keyframeable<number>; // 1.0 = 100%
    rotation?: Keyframeable<number>; // Degrees
    opacity?: Keyframeable<number>; // 0-1
    anchorPoint?: { x: number; y: number }; // 0-1
    crop?: { top: number; bottom: number; left: number; right: number }; // 0-1
  };

  compositing?: {
    blendMode?: BlendMode;
    maskId?: string;
    motionBlur?: {
      samples: number;
      shutterAngle: number;
    };
  };

  effects?: Effect[];

  transition?: {
    type: TransitionType;
    duration: number; // Seconds
    easing?: EasingType;
  };

  beatLock?: {
    beatIndex: number; // Which beat to align to
    lockMode: "start" | "end" | "center"; // Where to align
  };

  aiRationale?: string; // Why AI chose this shot (transparency)
}

/**
 * Visual effect applied to a shot
 */
export interface Effect {
  id: string; // Stable ID for interactive editing
  type: EffectType;
  intensity: number; // 0-1
  startTime?: number; // Effect start within shot (seconds)
  duration?: number; // Effect duration (if not full shot)
  params?: Record<string, number>; // Effect-specific params
}

// Effect types (MVP subset)
export type EffectType =
  | "blur"
  | "gaussianBlur"
  | "brightness"
  | "contrast"
  | "saturation"
  | "glow"
  | "shake"
  | "zoom_pulse"
  | "zoomPulse"
  | "zoom-pulse"
  | "directional_blur"
  | "directionalBlur"
  | "directional-blur"
  | "rgb_split"
  | "rgbSplit"
  | "rgb-split"
  | "radial_zoom_blur"
  | "radialZoomBlur"
  | "radial-zoom-blur"
  | "particles"
  | "chromatic_aberration"
  | "chromaticAberration"
  | "chromatic-aberration"
  | "scanlines"
  | "displacement_map"
  | "waveform"
  | "glitch"
  | "color_shift"
  | "colorShift"
  | "color-shift"
  | "facial_blur"
  | "facialBlur"
  | "facial-blur"
  | "subject_blur"
  | "subject-blur"
  | "background_blur"
  | "background-blur"
  | "depth_parallax"
  | "depthParallax"
  | "depth-parallax"
  | "motion_blur"
  | "motionBlur"
  | "motion-blur"
  | "camera-blur"
  | "camera_blur"
  | "cameraBlur"
  | "gaussian-blur"
  | "sharpen"
  | "unsharp-mask"
  | "unsharp_mask"
  | "unsharpMask"
      | "reduce-interlace-flicker"
      | "reduce_interlace_flicker"
      | "reduceInterlaceFlicker"
      | "invert"
      | "echo"
      | "posterize_time"
      | "posterize-time"
      | "posterizeTime"
      | "corner_pin"
      | "cornerPin"
      | "corner-pin"
      | "lens_distortion"
      | "lensDistortion"
      | "lens-distortion"
      | "magnify"
      | "mirror"
      | "alpha_glow"
      | "alphaGlow"
      | "alpha-glow"
      | "brush_strokes"
      | "brushStrokes"
      | "brush-strokes"
      | "color_emboss"
      | "colorEmboss"
      | "color-emboss"
      | "find_edges"
      | "findEdges"
      | "find-edges"
      | "mosaic"
      | "posterize"
      | "replicate"
      | "roughen_edges"
      | "roughenEdges"
      | "roughen-edges"
      | "strobe_light"
      | "strobeLight"
      | "strobe-light";

// Transition types (MVP subset)
export type TransitionType = "cut" | "crossfade" | "whip-pan" | "zoom-blur" | "glitch";

// Easing curves (removed duplicate)

// Color grading presets
export type ColorGradePreset =
  | "cinematic" // Teal & orange, low saturation
  | "vibrant" // High saturation, punchy
  | "vintage" // Faded, warm tones
  | "monochrome" // Black & white
  | "anime" // High contrast, saturated primaries
  | "raw"; // No grading

/**
 * Zod Schemas for MonetEDL validation
 */

export const TransitionTypeSchema = z.enum(["cut", "crossfade", "whip-pan", "zoom-blur", "glitch"]);
export const ColorGradePresetSchema = z.enum([
  "cinematic",
  "vibrant",
  "vintage",
  "monochrome",
  "anime",
  "raw",
]);

export const EasingTypeSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "bezier",
  "elastic",
  "bounce",
]);

export const BlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "add",
  "subtract",
]);

const KeyframeSchema = (valueSchema: z.ZodTypeAny) =>
  z.object({
    time: z.number(),
    value: valueSchema,
    easing: EasingTypeSchema.optional(),
  });

const KeyframeableSchema = (valueSchema: z.ZodTypeAny) =>
  z.union([valueSchema, z.array(KeyframeSchema(valueSchema))]);

export const ShotSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  zIndex: z.number().optional(),
  meta: z.record(z.string(), z.any()).optional(),
  source: z.object({
    clipId: z.string(),
    inPoint: z.number(),
    outPoint: z.number(),
  }),
  timing: z.object({
    startTime: z.number(),
    duration: z.number(),
    speed: z.number().optional(),
    speedRamp: z.object({
      startSpeed: z.number(),
      endSpeed: z.number(),
      easing: EasingTypeSchema,
    }).optional(),
  }),
  transform: z.object({
    position: KeyframeableSchema(z.object({ x: z.number(), y: z.number() })).optional(),
    scale: KeyframeableSchema(z.number()).optional(),
    rotation: KeyframeableSchema(z.number()).optional(),
    opacity: KeyframeableSchema(z.number()).optional(),
    anchorPoint: z.object({ x: z.number(), y: z.number() }).optional(),
    crop: z.object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() }).optional(),
  }).optional(),
  compositing: z.object({
    blendMode: BlendModeSchema.optional(),
    maskId: z.string().optional(),
    motionBlur: z.object({
      samples: z.number(),
      shutterAngle: z.number(),
    }).optional(),
  }).optional(),
  effects: z.array(z.object({
    id: z.string(),
    type: z.enum([
      "blur",
      "gaussianBlur",
      "brightness",
      "contrast",
      "saturation",
      "glow",
      "shake",
      "zoom_pulse",
      "zoomPulse",
      "zoom-pulse",
      "directional_blur",
      "directionalBlur",
      "directional-blur",
      "rgb_split",
      "rgbSplit",
      "rgb-split",
      "radial_zoom_blur",
      "radialZoomBlur",
      "radial-zoom-blur",
      "particles",
      "chromatic_aberration",
      "chromaticAberration",
      "chromatic-aberration",
      "scanlines",
      "displacement_map",
      "waveform",
      "glitch",
      "color_shift",
      "colorShift",
      "color-shift",
      "facial_blur",
      "facialBlur",
      "facial-blur",
      "subject_blur",
      "subject-blur",
      "background_blur",
      "background-blur",
      "depth_parallax",
      "depthParallax",
      "depth-parallax",
      "motion_blur",
      "motionBlur",
      "motion-blur",
      "camera-blur",
      "camera_blur",
      "cameraBlur",
      "gaussian-blur",
      "sharpen",
      "unsharp-mask",
      "unsharp_mask",
      "unsharpMask",
      "reduce-interlace-flicker",
      "reduce_interlace_flicker",
      "reduceInterlaceFlicker",
      "invert",
      "echo",
      "posterize_time",
      "posterize-time",
      "posterizeTime",
      "corner_pin",
      "cornerPin",
      "corner-pin",
      "lens_distortion",
      "lensDistortion",
      "lens-distortion",
      "magnify",
      "mirror",
      "alpha_glow",
      "alphaGlow",
      "alpha-glow",
      "brush_strokes",
      "brushStrokes",
      "brush-strokes",
      "color_emboss",
      "colorEmboss",
      "color-emboss",
      "find_edges",
      "findEdges",
      "find-edges",
      "mosaic",
      "posterize",
      "replicate",
      "roughen_edges",
      "roughenEdges",
      "roughen-edges",
      "strobe_light",
      "strobeLight",
      "strobe-light",
    ]),
    intensity: z.number(),
    startTime: z.number().optional(),
    duration: z.number().optional(),
    params: z.record(z.string(), z.number()).optional(),
  })).optional(),
  transition: z.object({
    type: TransitionTypeSchema,
    duration: z.number(),
    easing: EasingTypeSchema.optional(),
  }).optional(),
  beatLock: z.object({
    beatIndex: z.number(),
    lockMode: z.enum(["start", "end", "center"]),
  }).optional(),
  aiRationale: z.string().optional(),
});

export const MotionTrackSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  method: z.enum(["feature", "face", "object"]),
  keyframes: z.array(z.object({
    time: z.number(),
    x: z.number(),
    y: z.number(),
    scale: z.number().optional(),
    rotation: z.number().optional(),
    confidence: z.number().optional(),
  })),
});

export const PlanarTrackSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  keyframes: z.array(z.object({
    time: z.number(),
    corners: z.tuple([
      z.object({ x: z.number(), y: z.number() }),
      z.object({ x: z.number(), y: z.number() }),
      z.object({ x: z.number(), y: z.number() }),
      z.object({ x: z.number(), y: z.number() }),
    ]),
    confidence: z.number().optional(),
  })),
});

export const TextOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  offset: z.object({ x: z.number(), y: z.number() }).optional(),
  style: z.object({
    fontSize: z.number().optional(),
    color: z.string().optional(),
    weight: z.string().optional(),
    shadow: z.boolean().optional(),
  }).optional(),
  tracking: z.object({
    trackId: z.string(),
    mode: z.enum(["follow", "behind_subject", "planar"]),
  }).optional(),
});

export const MonetEDLSchema = z.object({
  version: z.string(),
  metadata: z.object({
    title: z.string(),
    createdAt: z.number(),
    aiModel: z.string(),
    prompt: z.string(),
    intentId: z.string(),
    analysisId: z.string(),
  }),
  timeline: z.object({
    resolution: z.object({ width: z.number(), height: z.number() }),
    fps: z.number(),
    duration: z.number(),
  }),
  music: z.object({
    id: z.string(),
    sourceId: z.string(),
    bpm: z.number(),
    beatGrid: z.array(z.number()),
    volume: z.number(),
    fadeIn: z.number().optional(),
    fadeOut: z.number().optional(),
  }).optional(),
  shots: z.array(ShotSchema),
  motionTracks: z.array(MotionTrackSchema).optional(),
  planarTracks: z.array(PlanarTrackSchema).optional(),
  textOverlays: z.array(TextOverlaySchema).optional(),
  globalEffects: z.object({
    colorGrade: ColorGradePresetSchema.optional(),
    vignette: z.number().optional(),
    grain: z.number().optional(),
  }).optional(),
});

export interface MonetEDLSchemaType extends z.infer<typeof MonetEDLSchema> {}

/**
 * Interactive Director - EDL Patching
 */

export interface EDLPatch {
  operations: EDLPatchOperation[];
}

export type EDLPatchOperation =
  | { op: "modify"; target: string; property: string; value: any }
  | { op: "add"; target: string; element: any }
  | { op: "remove"; target: string }
  | { op: "reorder"; target: string; newIndex: number };

export interface PreviewFrame {
  timestamp: number;
  imageUrl: string; // Base64 or signed URL
}

export interface EDLVersion {
  id: string;
  edl: MonetEDL;
  parentVersionId?: string;
  timestamp: number;
  label?: string; // e.g., "Initial Draft", "Shorter cuts"
}

/**
 * JSON schema for Gemini structured output (EDL generation)
 */
export const EDL_JSON_SCHEMA = {
  type: "object",
  properties: {
    timeline: {
      type: "object",
      properties: {
        duration: { type: "number" },
      },
      required: ["duration"],
    },
    music: {
      type: "object",
      properties: {
        sourceId: { type: "string" },
        volume: { type: "number" },
        fadeIn: { type: "number" },
        fadeOut: { type: "number" },
      },
    },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: {
            type: "object",
            properties: {
              clipId: { type: "string" },
              inPoint: { type: "number" },
              outPoint: { type: "number" },
            },
            required: ["clipId", "inPoint", "outPoint"],
          },
          timing: {
            type: "object",
            properties: {
              startTime: { type: "number" },
              duration: { type: "number" },
              speed: { type: "number" },
            },
            required: ["startTime", "duration"],
          },
          transform: {
            type: "object",
            properties: {
              position: {
                oneOf: [
                  {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                  },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "number" },
                        value: {
                          type: "object",
                          properties: {
                            x: { type: "number" },
                            y: { type: "number" },
                          },
                        },
                        easing: { type: "string" },
                      },
                    },
                  },
                ],
              },
              scale: {
                oneOf: [
                  { type: "number" },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "number" },
                        value: { type: "number" },
                        easing: { type: "string" },
                      },
                    },
                  },
                ],
              },
              rotation: {
                oneOf: [
                  { type: "number" },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "number" },
                        value: { type: "number" },
                        easing: { type: "string" },
                      },
                    },
                  },
                ],
              },
              opacity: {
                oneOf: [
                  { type: "number" },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "number" },
                        value: { type: "number" },
                        easing: { type: "string" },
                      },
                    },
                  },
                ],
              },
            },
          },
          compositing: {
            type: "object",
            properties: {
              blendMode: { type: "string" },
              motionBlur: {
                type: "object",
                properties: {
                  samples: { type: "number" },
                  shutterAngle: { type: "number" },
                },
              },
            },
          },
          effects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "blur",
                    "brightness",
                    "contrast",
                    "saturation",
                    "glow",
                    "shake",
                    "zoom_pulse",
                    "directional_blur",
                    "rgb_split",
                    "radial_zoom_blur",
                    "particles",
                    "chromatic_aberration",
                    "scanlines",
                    "displacement_map",
                    "waveform",
                    "glitch",
                    "color_shift",
                    "camera-blur",
                    "camera_blur",
                    "cameraBlur",
                    "directional-blur",
                    "gaussian-blur",
                    "gaussianBlur",
                    "sharpen",
                    "unsharp-mask",
                    "unsharp_mask",
                    "unsharpMask",
                    "reduce-interlace-flicker",
                    "reduce_interlace_flicker",
                    "reduceInterlaceFlicker",
                    "invert",
                    "echo",
                    "posterize_time",
                    "posterize-time",
                    "posterizeTime",
                    "corner_pin",
                    "cornerPin",
                    "corner-pin",
                    "lens_distortion",
                    "lensDistortion",
                    "lens-distortion",
                    "magnify",
                    "mirror",
                    "alpha_glow",
                    "alphaGlow",
                    "alpha-glow",
                    "brush_strokes",
                    "brushStrokes",
                    "brush-strokes",
                    "color_emboss",
                    "colorEmboss",
                    "color-emboss",
                    "find_edges",
                    "findEdges",
                    "find-edges",
                    "mosaic",
                    "posterize",
                    "replicate",
                    "roughen_edges",
                    "roughenEdges",
                    "roughen-edges",
                    "strobe_light",
                    "strobeLight",
                    "strobe-light",
                  ],
                },
                intensity: { type: "number" },
                startTime: { type: "number" },
                duration: { type: "number" },
                params: {
                  type: "object",
                  properties: {
                    blend: { type: "number", description: "Invert/Find Edges: Blend percentage (0 to 100)" },
                    channel: { type: "number", description: "Invert: 0=RGB, 1=Red, 2=Green, 3=Blue, 4=Alpha, 5=HLS, 6=Hue, 7=Lightness, 8=Saturation" },
                    alpha: { type: "number", description: "Invert: 0=no alpha invert, 1=alpha invert" },
                    topLeftX: { type: "number", description: "Corner Pin: Top-Left X coordinate (0 to 1)" },
                    topLeftY: { type: "number", description: "Corner Pin: Top-Left Y coordinate (0 to 1)" },
                    topRightX: { type: "number", description: "Corner Pin: Top-Right X coordinate (0 to 1)" },
                    topRightY: { type: "number", description: "Corner Pin: Top-Right Y coordinate (0 to 1)" },
                    bottomLeftX: { type: "number", description: "Corner Pin: Bottom-Left X coordinate (0 to 1)" },
                    bottomLeftY: { type: "number", description: "Corner Pin: Bottom-Left Y coordinate (0 to 1)" },
                    bottomRightX: { type: "number", description: "Corner Pin: Bottom-Right X coordinate (0 to 1)" },
                    bottomRightY: { type: "number", description: "Corner Pin: Bottom-Right Y coordinate (0 to 1)" },
                    curvature: { type: "number", description: "Lens Distortion: curvature amount (-1.0 to 1.0)" },
                    verticalDecenter: { type: "number", description: "Lens Distortion: vertical shift (-1.0 to 1.0)" },
                    horizontalDecenter: { type: "number", description: "Lens Distortion: horizontal shift (-1.0 to 1.0)" },
                    verticalPrism: { type: "number", description: "Lens Distortion: vertical prism (-1.0 to 1.0)" },
                    horizontalPrism: { type: "number", description: "Lens Distortion: horizontal prism (-1.0 to 1.0)" },
                    centerX: { type: "number", description: "Magnify: center X coordinate (0 to 1)" },
                    centerY: { type: "number", description: "Magnify: center Y coordinate (0 to 1)" },
                    magnification: { type: "number", description: "Magnify: zoom scale factor (1.0 to 10.0)" },
                    size: { type: "number", description: "Magnify: lens radius size (0 to 1)" },
                    feather: { type: "number", description: "Magnify: boundary edge feather (0 to 1)" },
                    reflectionAngle: { type: "number", description: "Mirror: reflection angle (0 to 360 degrees)" },
                    reflectionCenterX: { type: "number", description: "Mirror: mirror center X (0 to 1)" },
                    reflectionCenterY: { type: "number", description: "Mirror: mirror center Y (0 to 1)" },
                    glowRadius: { type: "number", description: "Alpha Glow: glow boundary radius (1 to 100)" },
                    brightness: { type: "number", description: "Alpha Glow: brightness amount (0 to 1)" },
                    colorShift: { type: "number", description: "Alpha Glow: color shift/hue index" },
                    fadeout: { type: "number", description: "Alpha Glow: 0=no fade, 1=fade" },
                    brushSize: { type: "number", description: "Brush Strokes: size of painterly brush (1 to 100)" },
                    strokeLength: { type: "number", description: "Brush Strokes: stroke length (0 to 100)" },
                    strokeDensity: { type: "number", description: "Brush Strokes: stroke density (0 to 100)" },
                    direction: { type: "number", description: "Brush Strokes/Color Emboss: direction/angle (0 to 360)" },
                    relief: { type: "number", description: "Color Emboss: relief depth (1 to 10)" },
                    contrast: { type: "number", description: "Color Emboss: emboss contrast multiplier" },
                    invert: { type: "number", description: "Find Edges: 0=black lines on white, 1=colored lines on black" },
                    horizontalBlocks: { type: "number", description: "Mosaic: pixelation columns count (2 to 100)" },
                    verticalBlocks: { type: "number", description: "Mosaic: pixelation rows count (2 to 100)" },
                    sharpColors: { type: "number", description: "Mosaic: 0=blend colors, 1=sharp boundaries" },
                    levels: { type: "number", description: "Posterize: tonal/color quantization levels (2 to 255)" },
                    count: { type: "number", description: "Replicate: count of grid cells to split into (e.g., 2, 3, 4)" },
                    border: { type: "number", description: "Roughen Edges: edge border thickness (0 to 100)" },
                    edgeSharpness: { type: "number", description: "Roughen Edges: sharpness of edge (0 to 10)" },
                    fractalInfluence: { type: "number", description: "Roughen Edges: fractal roughness amount (0 to 1)" },
                    scale: { type: "number", description: "Roughen Edges: noise scale factor (1 to 100)" },
                    period: { type: "number", description: "Strobe Light: flash interval period in seconds" },
                    strobeProbability: { type: "number", description: "Strobe Light: flash probability (0 to 1)" },
                    strobeType: { type: "number", description: "Strobe Light: 0=transparency flash, 1=color/invert flash" },
                    echoTime: { type: "number", description: "Echo: delay offset time in seconds" },
                    numberOfEchoes: { type: "number", description: "Echo: count of echo frames to blend" },
                    decay: { type: "number", description: "Echo: decay blend multiplier (0 to 1)" },
                    echoOperator: { type: "number", description: "Echo: 0=Add, 1=Max, 2=Min, 3=Screen" },
                    frameRate: { type: "number", description: "Posterize Time: locked frame rate (1 to 60)" },
                  },
                },
              },
              required: ["type", "intensity"],
            },
          },
          transition: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["cut", "crossfade", "whip-pan", "zoom-blur", "glitch"] },
              duration: { type: "number" },
              easing: { type: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] },
            },
            required: ["type", "duration"],
          },
          beatLock: {
            type: "object",
            properties: {
              beatIndex: { type: "number" },
              lockMode: { type: "string", enum: ["start", "end", "center"] },
            },
            required: ["beatIndex", "lockMode"],
          },
          aiRationale: { type: "string" },
        },
        required: ["source", "timing"],
      },
    },
    globalEffects: {
      type: "object",
      properties: {
        colorGrade: {
          type: "string",
          enum: ["cinematic", "vibrant", "vintage", "monochrome", "anime", "raw"],
        },
        vignette: { type: "number" },
        grain: { type: "number" },
      },
    },
    motionTracks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          clipId: { type: "string" },
          method: { type: "string", enum: ["feature", "face", "object"] },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "number" },
                x: { type: "number" },
                y: { type: "number" },
                scale: { type: "number" },
                rotation: { type: "number" },
                confidence: { type: "number" },
              },
              required: ["time", "x", "y"],
            },
          },
        },
        required: ["id", "clipId", "method", "keyframes"],
      },
    },
    planarTracks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          clipId: { type: "string" },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "number" },
                corners: {
                  type: "array",
                  minItems: 4,
                  maxItems: 4,
                  items: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                    required: ["x", "y"],
                  },
                },
                confidence: { type: "number" },
              },
              required: ["time", "corners"],
            },
          },
        },
        required: ["id", "clipId", "keyframes"],
      },
    },
    textOverlays: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          startTime: { type: "number" },
          endTime: { type: "number" },
          offset: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
          style: {
            type: "object",
            properties: {
              fontSize: { type: "number" },
              color: { type: "string" },
              weight: { type: "string" },
            },
          },
          tracking: {
            type: "object",
            properties: {
              trackId: { type: "string" },
              mode: { type: "string", enum: ["follow", "behind_subject", "planar"] },
            },
            required: ["trackId", "mode"],
          },
        },
        required: ["id", "text", "startTime", "endTime"],
      },
    },
  },
  required: ["timeline", "shots"],
};
