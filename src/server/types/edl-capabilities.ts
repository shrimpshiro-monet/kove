import { z } from "zod";

export const CapabilityNameSchema = z.string().min(1);

export const RendererFeatureSupportSchema = z.object({
  motionBlur: z.boolean(),
  facialTracking: z.boolean(),
  subjectMasks: z.boolean(),
  depthParallax: z.boolean(),
  customShaders: z.boolean(),
  rifeInterpolation: z.boolean(),
  customFonts: z.boolean(),
});

export const RendererCapabilitiesSchema = z.object({
  transitions: z.set(CapabilityNameSchema),
  effects: z.set(CapabilityNameSchema),
  supports: RendererFeatureSupportSchema,
});

export type RendererCapabilities = z.infer<typeof RendererCapabilitiesSchema>;

export function hasTransitionCapability(
  capabilities: RendererCapabilities,
  transitionType: string
): boolean {
  return capabilities.transitions.has(normalizeTransitionType(transitionType));
}

export function hasEffectCapability(
  capabilities: RendererCapabilities,
  effectType: string
): boolean {
  const normalized = normalizeEffectType(effectType);
  return capabilities.effects.has(normalized);
}

export function normalizeTransitionType(type: string): string {
  switch (type) {
    case "whip":
    case "whip_pan":
    case "whip-pan":
      return "whip-pan";
    case "zoom":
    case "zoom_blur":
    case "zoom-blur":
      return "zoom-blur";
    case "dip_to_black":
    case "dipToBlack":
      return "dipToBlack";
    case "dip_to_white":
    case "dipToWhite":
      return "dipToWhite";
    default:
      return type;
  }
}

export function normalizeEffectType(type: string): string {
  switch (type) {
    case "zoomPulse":
    case "zoom-pulse":
    case "zoom_pulse":
      return "zoom_pulse";
    case "rgbSplit":
    case "rgb-split":
    case "rgb_split":
      return "rgb_split";
    case "directionalBlur":
    case "directional-blur":
    case "directional_blur":
      return "directional_blur";
    case "radialZoomBlur":
    case "radial-zoom-blur":
    case "radial_zoom_blur":
      return "radial_zoom_blur";
    case "motionBlur":
    case "motion-blur":
    case "motion_blur":
      return "motion_blur";
    case "facialBlur":
    case "facial-blur":
    case "facial_blur":
      return "facial_blur";
    case "colorShift":
    case "color-shift":
    case "color_shift":
      return "color_shift";
    case "chromaticAberration":
    case "chromatic-aberration":
    case "chromatic_aberration":
      return "rgb_split";
    case "cameraBlur":
    case "camera-blur":
    case "camera_blur":
      return "camera_blur";
    case "gaussianBlur":
    case "gaussian-blur":
    case "gaussian_blur":
      return "gaussian_blur";
    case "unsharpMask":
    case "unsharp-mask":
    case "unsharp_mask":
      return "unsharp_mask";
    case "reduceInterlaceFlicker":
    case "reduce-interlace-flicker":
    case "reduce_interlace_flicker":
      return "reduce_interlace_flicker";
    case "posterizeTime":
    case "posterize-time":
    case "posterize_time":
      return "posterize_time";
    case "cornerPin":
    case "corner-pin":
    case "corner_pin":
      return "corner_pin";
    case "lensDistortion":
    case "lens-distortion":
    case "lens_distortion":
      return "lens_distortion";
    case "magnify":
      return "magnify";
    case "mirror":
      return "mirror";
    case "alphaGlow":
    case "alpha-glow":
    case "alpha_glow":
      return "alpha_glow";
    case "brushStrokes":
    case "brush-strokes":
    case "brush_strokes":
      return "brush_strokes";
    case "colorEmboss":
    case "color-emboss":
    case "color_emboss":
      return "color_emboss";
    case "findEdges":
    case "find-edges":
    case "find_edges":
      return "find_edges";
    case "mosaic":
      return "mosaic";
    case "posterize":
      return "posterize";
    case "replicate":
      return "replicate";
    case "roughenEdges":
    case "roughen-edges":
    case "roughen_edges":
      return "roughen_edges";
    case "strobeLight":
    case "strobe-light":
    case "strobe_light":
      return "strobe_light";
    default:
      return type;
  }
}

export const CANVAS_PREVIEW_CAPABILITIES: RendererCapabilities = {
  transitions: new Set(["cut", "crossfade"]),
  effects: new Set([
    "blur",
    "brightness",
    "contrast",
    "saturation",
    "glow",
    "shake",
    "zoom_pulse",
    "rgb_split",
    "directional_blur",
    "radial_zoom_blur",
    "camera_blur",
    "gaussian_blur",
    "sharpen",
    "unsharp_mask",
    "reduce_interlace_flicker",
    "invert",
    "echo",
    "posterize_time",
    "corner_pin",
    "lens_distortion",
    "magnify",
    "mirror",
    "alpha_glow",
    "brush_strokes",
    "color_emboss",
    "find_edges",
    "mosaic",
    "posterize",
    "replicate",
    "roughen_edges",
    "strobe_light",
  ]),
  supports: {
    motionBlur: false,
    facialTracking: false,
    subjectMasks: false,
    depthParallax: false,
    customShaders: false,
    rifeInterpolation: false,
    customFonts: false,
  },
};

export const REMOTION_PREVIEW_CAPABILITIES: RendererCapabilities = {
  transitions: new Set(["cut", "crossfade", "whip-pan", "zoom-blur"]),
  effects: new Set([
    "blur",
    "brightness",
    "contrast",
    "saturation",
    "glow",
    "shake",
    "zoom_pulse",
    "rgb_split",
    "directional_blur",
    "radial_zoom_blur",
    "glitch",
    "color_shift",
    "motion_blur",
    "camera_blur",
    "gaussian_blur",
    "sharpen",
    "unsharp_mask",
    "reduce_interlace_flicker",
    "invert",
    "echo",
    "posterize_time",
    "corner_pin",
    "lens_distortion",
    "magnify",
    "mirror",
    "alpha_glow",
    "brush_strokes",
    "color_emboss",
    "find_edges",
    "mosaic",
    "posterize",
    "replicate",
    "roughen_edges",
    "strobe_light",
  ]),
  supports: {
    motionBlur: true,
    facialTracking: false,
    subjectMasks: false,
    depthParallax: true,
    customShaders: true,
    rifeInterpolation: false,
    customFonts: true,
  },
};

export const FFMPEG_EXPORT_CAPABILITIES: RendererCapabilities = {
  transitions: new Set([
    "cut",
    "crossfade",
    "whip-pan",
    "zoom-blur",
    "glitch",
    "dipToBlack",
    "dipToWhite",
    "wipe",
    "slide",
    "push",
  ]),
  effects: new Set([
    "blur",
    "brightness",
    "contrast",
    "saturation",
    "glow",
    "shake",
    "zoom_pulse",
    "rgb_split",
    "directional_blur",
    "radial_zoom_blur",
    "glitch",
    "color_shift",
    "scanlines",
    "particles",
    "motion_blur",
    "facial_blur",
    "background_blur",
    "depth_parallax",
    "camera_blur",
    "gaussian_blur",
    "sharpen",
    "unsharp_mask",
    "reduce_interlace_flicker",
    "invert",
    "echo",
    "posterize_time",
    "corner_pin",
    "lens_distortion",
    "magnify",
    "mirror",
    "alpha_glow",
    "brush_strokes",
    "color_emboss",
    "find_edges",
    "mosaic",
    "posterize",
    "replicate",
    "roughen_edges",
    "strobe_light",
  ]),
  supports: {
    motionBlur: true,
    facialTracking: true,
    subjectMasks: true,
    depthParallax: true,
    customShaders: true,
    rifeInterpolation: true,
    customFonts: true,
  },
};
