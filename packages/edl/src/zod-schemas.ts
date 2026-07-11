import { z } from "zod";

export const TransitionTypeSchema = z.enum([
  "cut", "crossfade", "dissolve", "whip-pan", "whip_pan",
  "zoom-blur", "glitch", "flash", "dip_black", "slide",
  "radial_wipe", "clock_wipe", "linear_wipe", "gradient_wipe",
  "barn_doors", "morph", "iris", "pinwheel", "film_burn",
  "spin", "blur", "pixelate", "flash_frame", "flash_white",
  "morph_cut", "push", "cube", "ripple", "swirl", "dreamy",
  "wind", "mosaic", "radial", "doorway", "heart", "kaleidoscope",
]);

export const ColorGradePresetSchema = z.enum([
  "cinematic", "vibrant", "vintage", "monochrome", "anime", "raw",
  "cool_desaturated", "warm_dark", "vivid_red", "neutral_desaturated",
  "bright_warm", "vibrant_warm", "hyper_neon", "cool_dark",
  "warm_cinematic", "desaturated_natural",
]);

export const EasingTypeSchema = z.enum([
  "linear", "ease-in", "ease-out", "ease-in-out",
  "bezier", "elastic", "bounce",
]);

export const BlendModeSchema = z.enum([
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "add", "subtract",
]);
