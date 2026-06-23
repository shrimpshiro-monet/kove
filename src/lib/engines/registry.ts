// src/lib/engines/registry.ts
import type { EngineCapability, EngineId } from "./types";

export const ENGINE_REGISTRY: EngineCapability[] = [
  {
    id: "openreel",
    displayName: "OpenReel Canvas2D",
    description: "Baseline renderer — cuts, transforms, simple effects",
    supports: new Set([
      "beat_cut", "push_in", "pull_out", "impact_flash",
      "context_shake", "speed_ramp", "freeze_frame", "whip_pan",
    ]),
    preferredFor: new Set(["beat_cut", "push_in", "freeze_frame"]),
    cost: 1,
    qualityBonus: 1,
    tier: "free",
  },

  {
    id: "webgl-grade",
    displayName: "WebGL Grade",
    description: "GPU color grading, vignette, chromatic aberration",
    supports: new Set([
      "color_pulse", "vignette_punch", "chromatic_burst",
      "color_grade", "warm_tone", "cool_tone", "desaturate",
    ]),
    preferredFor: new Set(["color_grade", "vignette_punch", "chromatic_burst"]),
    cost: 1.2,
    qualityBonus: 2.5,
    tier: "free",
  },

  {
    id: "webgl-blur",
    displayName: "WebGL Blur",
    description: "Gaussian, motion, and radial blur on GPU",
    supports: new Set([
      "motion_blur", "radial_blur", "tilt_shift", "depth_blur",
    ]),
    preferredFor: new Set(["motion_blur", "radial_blur"]),
    cost: 1.3,
    qualityBonus: 2.2,
    tier: "free",
  },

  {
    id: "shader-fx",
    displayName: "Shader FX",
    description: "50+ GPU effects: glitch, blur, color grade, distort, stylize, bloom",
    supports: new Set([
      "glitch", "vhs", "scanlines", "rgb_shift", "displacement",
      "pixelate", "kaleidoscope",
      "halftone", "comic_edges", "frame_stutter", "chromatic_glitch",
      // glfx effects
      "brightness_contrast", "hue_saturation", "vibrance", "sepia", "vignette_pro",
      "triangle_blur", "lens_blur", "tilt_shift", "edges_gfx", "ink_gfx", "emboss_gfx",
      "swirl_gfx", "bulge_pinch", "noise_film", "posterize_gfx", "zoom_blur", "denoise_gfx",
      "color_halftone", "dot_screen", "shift_towards",
      // shadertoy effects
      "plasma", "heat_wave", "crt_monitor", "dream_blur", "kaleidoscope",
      "pulse_wave", "ascii_matrix", "hologram", "thermal", "duotone",
      "floating_dust", "infrared", "film_scratches", "liquid", "bloom_highlights",
      // pro-grade effects
      "film_grain_pro", "vignette_pro_v2", "color_temperature",
      // custom VFX (reference-matched)
      "spiderverse_halftone", "sports_speed_trail", "tyler_vibrant_pop",
      "racing_motion_streak", "dark_moody_cinematic", "lifestyle_glitch",
      "tiktok_energy_pulse",
    ]),
    preferredFor: new Set([
      "glitch", "vhs", "rgb_shift",
      "halftone", "comic_edges", "chromatic_glitch",
      "crt_monitor", "hologram", "thermal", "plasma", "bloom_highlights",
    ]),
    cost: 1.5,
    qualityBonus: 3.0,
    tier: "free",
  },

  {
    id: "particle-fx",
    displayName: "Particle FX",
    description: "Sparks, light leaks, dust, lens flares, confetti",
    supports: new Set([
      "sparks", "light_leak", "dust", "lens_flare",
      "confetti", "smoke", "rain",
    ]),
    preferredFor: new Set(["light_leak", "sparks", "lens_flare"]),
    cost: 2,
    qualityBonus: 2,
    tier: "creator",
  },

  {
    id: "text-engine",
    displayName: "Kinetic Text",
    description: "Animated captions, kinetic typography, lower thirds",
    supports: new Set([
      "kinetic_caption", "subtitle", "title_card",
      "lower_third", "lyric_text", "word_pop",
    ]),
    preferredFor: new Set(["kinetic_caption", "lyric_text"]),
    cost: 1.5,
    qualityBonus: 2.5,
    tier: "free",
  },

  {
    id: "audio-engine",
    displayName: "Audio Engine",
    description: "BGM mixing, VO ducking, beat-locked fades, sidechain",
    supports: new Set([
      "bgm_mix", "vo_duck", "beat_fade",
      "sidechain", "audio_pulse",
    ]),
    preferredFor: new Set(["bgm_mix", "vo_duck", "sidechain"]),
    cost: 1.2,
    qualityBonus: 2,
    tier: "free",
  },

  {
    id: "rife-interp",
    displayName: "RIFE Optical Flow",
    description: "AI frame interpolation for buttery slow-mo and speed ramps",
    supports: new Set([
      "smooth_slowmo", "frame_interp", "speed_ramp_hq",
    ]),
    preferredFor: new Set(["smooth_slowmo", "speed_ramp_hq"]),
    cost: 6,
    qualityBonus: 3.5,
    tier: "pro",
    serverSideOnly: true,
  },

  {
    id: "sam-vfx",
    displayName: "SAM 2 Subject Isolation",
    description: "AI mask the subject, dim/blur background — hero shots",
    supports: new Set([
      "subject_isolation", "bg_dim", "bg_blur", "bg_replace",
    ]),
    preferredFor: new Set(["subject_isolation", "bg_replace"]),
    cost: 8,
    qualityBonus: 4,
    tier: "pro",
    serverSideOnly: true,
    maxShotsPerEdit: 6,
  },

  {
    id: "ai-specialist",
    displayName: "AI Specialist (SAM 2 + Depth + Face)",
    description: "Subject isolation, depth-aware compositing, face tracking",
    supports: new Set([
      "subject_isolation", "depth_parallax", "tracked_caption",
      "bg_blur", "bg_dim",
    ]),
    preferredFor: new Set([
      "subject_isolation", "depth_parallax", "tracked_caption",
    ]),
    cost: 7,
    qualityBonus: 4,
    tier: "pro",
  },

  {
    id: "depth-vfx",
    displayName: "Depth VFX",
    description: "3D parallax, atmospheric fog, defocus by distance",
    supports: new Set([
      "depth_parallax", "atmospheric_fog", "depth_defocus",
    ]),
    preferredFor: new Set(["depth_parallax"]),
    cost: 9,
    qualityBonus: 4,
    tier: "pro",
    serverSideOnly: true,
    maxShotsPerEdit: 3,
  },

  {
    id: "ffmpeg-server",
    displayName: "Server FFmpeg",
    description: "Final HD export, AV1, broadcast-quality encoding",
    supports: new Set(["final_render", "hd_export", "av1_encode"]),
    preferredFor: new Set(["final_render"]),
    cost: 4,
    qualityBonus: 5,
    tier: "creator",
    serverSideOnly: true,
  },

  {
    id: "specialist-ai",
    displayName: "AI Specialist Engines",
    description: "SAM 2 subject isolation, Depth Anything, RIFE smooth slow-mo. Pro-tier wow features.",
    supports: new Set([
      "subject_isolation",
      "subject_pop",
      "bg_blur_subject",
      "bg_dim_subject",
      "depth_focus",
      "depth_parallax",
      "text_behind_subject",
      "smooth_slowmo",
      "rife_slowmo",
    ]),
    preferredFor: new Set([
      "subject_isolation",
      "subject_pop",
      "depth_focus",
      "text_behind_subject",
      "smooth_slowmo",
    ]),
    cost: 8,
    qualityBonus: 5,
    tier: "pro",
    serverSideOnly: false,
    maxShotsPerEdit: 6,
  },

  {
    id: "opencv-browser",
    displayName: "OpenCV Browser",
    description: "In-browser computer vision: face detection, edge detection, optical flow",
    supports: new Set([
      "face_detect_overlay",
      "edge_outline",
      "optical_flow_vis",
    ]),
    preferredFor: new Set(["face_detect_overlay", "edge_outline"]),
    cost: 2,
    qualityBonus: 2.5,
    tier: "free",
    serverSideOnly: false,
  },
];

export function getEnginesForTier(tier: "free" | "creator" | "pro"): EngineCapability[] {
  const order = ["free", "creator", "pro"];
  const tierIdx = order.indexOf(tier);
  return ENGINE_REGISTRY.filter(e => order.indexOf(e.tier) <= tierIdx);
}
