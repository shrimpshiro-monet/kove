// Re-export all EDL types and Zod schemas from the shared package
export * from "@monet/edl";
export type { MonetEDL } from "@monet/edl";

// Server-specific Zod schemas not in the package
import { z } from "zod";
import { TransitionTypeSchema, ColorGradePresetSchema, EasingTypeSchema, BlendModeSchema, type MonetEDL } from "@monet/edl";

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
    motionDir: z.string().optional(),
    hasVelocityRamp: z.boolean().optional(),
    semantic: z.array(z.string()).optional(),
    faceCentered: z.boolean().optional(),
    motion: z.number().optional(),
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
    beatLocked: z.boolean().optional(),
  }),
  sectionRole: z.string().optional(),
  isHero: z.boolean().optional(),
  holdForImpact: z.boolean().optional(),
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
    type: z.string(),
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
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    weight: z.string().optional(),
    shadow: z.boolean().optional(),
    alignment: z.enum(["left", "center", "right"]).optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
  }).optional(),
  animation: z.object({
    inType: z.enum(["pop", "fade", "slide", "glitch"]),
    outType: z.enum(["pop", "fade", "slide", "glitch"]),
    duration: z.number(),
    easing: EasingTypeSchema,
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
    projectId: z.string().optional(),
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
                    "halftone",
                    "ink_edges",
                    "inkEdges",
                    "ink-edges",
                    "frame_stutter",
                    "frameStutter",
                    "frame-stutter",
                    "vignette_pro",
                    "vignettePro",
                    "vignette-pro",
                    "bw_toggle",
                    "bwToggle",
                    "bw-toggle",
                    "flash_white",
                    "flashWhite",
                    "flash-white",
                    "multi_exposure",
                    "multiExposure",
                    "multi-exposure",
                    "desaturate",
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
              type: { type: "string", enum: ["cut", "crossfade", "whip-pan", "zoom-blur", "glitch", "flash", "dissolve"] },
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
          enum: [
            "cinematic", "vibrant", "vintage", "monochrome", "anime", "raw",
            "cool_desaturated", "warm_dark", "vivid_red", "neutral_desaturated",
            "bright_warm", "vibrant_warm", "hyper_neon", "cool_dark",
            "warm_cinematic", "desaturated_natural",
          ],
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
