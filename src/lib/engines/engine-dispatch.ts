// src/lib/engines/engine-dispatch.ts
// Bridges the router's per-shot engine assignments to actual renderer calls.

import { ShaderFXRenderer, type ShaderEffectKind } from "../renderer/shader-fx";
import { ParticleFXRenderer, type ParticleKind } from "../renderer/particle-fx";
import { KineticTextEngine, type KineticTextSpec } from "../renderer/text-engine";
import type { EngineId } from "./types";
import { getShaderSpec } from "../shaders/spiderverse";
import { getSAMMaskRenderer } from "../renderer/sam-mask-renderer";

// Singleton instances (heavy to construct — reuse across renders)
let _shaderFX: ShaderFXRenderer | null = null;
let _particleFX: ParticleFXRenderer | null = null;
let _textEngine: KineticTextEngine | null = null;

export function getShaderFX(width: number, height: number): ShaderFXRenderer {
  if (!_shaderFX) {
    try {
      _shaderFX = new ShaderFXRenderer(width, height);
    } catch (e) {
      console.warn("[engine-dispatch] ShaderFX init failed:", e);
      throw e;
    }
  }
  _shaderFX.resize(width, height);
  return _shaderFX;
}

export function getParticleFX(): ParticleFXRenderer {
  if (!_particleFX) _particleFX = new ParticleFXRenderer();
  return _particleFX;
}

export function getTextEngine(): KineticTextEngine {
  if (!_textEngine) _textEngine = new KineticTextEngine();
  return _textEngine;
}

const SHADER_EFFECT_MAP: Record<string, ShaderEffectKind> = {
  glitch: "glitch",
  vhs: "vhs",
  rgb_shift: "rgb_shift",
  rgb_split: "rgb_shift",
  scanlines: "scanlines",
  pixelate: "pixelate",
  // Spider-Verse bundle:
  halftone: "halftone",
  benday: "halftone",
  comic_edges: "comic_edges",
  ink: "comic_edges",
  outline: "comic_edges",
  frame_stutter: "frame_stutter",
  anime_timing: "frame_stutter",
  on_2s: "frame_stutter",
  chromatic_glitch: "chromatic_glitch",
  chromatic_burst: "chromatic_glitch",
  // glfx effects
  brightness_contrast: "brightness_contrast",
  brightness: "brightness_contrast",
  contrast: "brightness_contrast",
  exposure: "brightness_contrast",
  hue_saturation: "hue_saturation",
  hue_shift: "hue_saturation",
  vibrance: "vibrance",
  sepia: "sepia",
  vintage_tone: "sepia",
  vignette_pro: "vignette_pro",
  triangle_blur: "triangle_blur",
  soft_blur: "triangle_blur",
  gaussian_blur: "triangle_blur",
  lens_blur: "lens_blur",
  bokeh_blur: "lens_blur",
  depth_blur: "lens_blur",
  tilt_shift: "tilt_shift",
  miniature: "tilt_shift",
  edges_gfx: "edges_gfx",
  edge_detect: "edges_gfx",
  sobel: "edges_gfx",
  ink_gfx: "ink_gfx",
  pen_sketch: "ink_gfx",
  emboss_gfx: "emboss_gfx",
  relief: "emboss_gfx",
  swirl_gfx: "swirl_gfx",
  twist: "swirl_gfx",
  bulge_pinch: "bulge_pinch",
  bulge: "bulge_pinch",
  pinch: "bulge_pinch",
  fish_eye: "bulge_pinch",
  noise_film: "noise_film",
  film_grain: "noise_film",
  grain: "noise_film",
  posterize_gfx: "posterize_gfx",
  posterize: "posterize_gfx",
  zoom_blur: "zoom_blur",
  radial_blur: "zoom_blur",
  denoise_gfx: "denoise_gfx",
  denoise: "denoise_gfx",
  color_halftone: "color_halftone",
  newspaper: "color_halftone",
  dot_screen: "dot_screen",
  halftone_mono: "dot_screen",
  shift_towards: "shift_towards",
  warm_shift: "shift_towards",
  cool_shift: "shift_towards",
  color_cast: "shift_towards",
  // shadertoy effects
  plasma: "plasma",
  psychedelic: "plasma",
  heat_wave: "heat_wave",
  mirage: "heat_wave",
  crt_monitor: "crt_monitor",
  crt: "crt_monitor",
  retro_tv: "crt_monitor",
  dream_blur: "dream_blur",
  dream: "dream_blur",
  soft_focus: "dream_blur",
  kaleidoscope: "kaleidoscope",
  pulse_wave: "pulse_wave",
  shock_wave: "pulse_wave",
  ascii_matrix: "ascii_matrix",
  matrix: "ascii_matrix",
  ascii: "ascii_matrix",
  hologram: "hologram",
  sci_fi: "hologram",
  thermal: "thermal",
  predator_vision: "thermal",
  duotone: "duotone",
  floating_dust: "floating_dust",
  particles_dust: "floating_dust",
  infrared: "infrared",
  edge_glow: "infrared",
  film_scratches: "film_scratches",
  old_film: "film_scratches",
  liquid: "liquid",
  underwater: "liquid",
  bloom_highlights: "bloom_highlights",
  bloom: "bloom_highlights",
  glow_pro: "bloom_highlights",
  // pro-grade effects
  film_grain_pro: "film_grain_pro",
  grain_pro: "film_grain_pro",
  vignette_pro_v2: "vignette_pro_v2",
  color_temperature: "color_temperature",
  warm_temp: "color_temperature",
  cool_temp: "color_temperature",
  kelvin_shift: "color_temperature",
  // custom VFX (reference-matched)
  spiderverse_halftone: "spiderverse_halftone",
  comic_dots: "spiderverse_halftone",
  ben_day: "spiderverse_halftone",
  halftone_pro: "spiderverse_halftone",
  sports_speed_trail: "sports_speed_trail",
  speed_trail: "sports_speed_trail",
  motion_blur_pro: "sports_speed_trail",
  sports_energy: "sports_speed_trail",
  tyler_vibrant_pop: "tyler_vibrant_pop",
  vibrant_pop: "tyler_vibrant_pop",
  color_pop: "tyler_vibrant_pop",
  warm_vibrant: "tyler_vibrant_pop",
  racing_motion_streak: "racing_motion_streak",
  racing_streak: "racing_motion_streak",
  speed_lines: "racing_motion_streak",
  f1_energy: "racing_motion_streak",
  dark_moody_cinematic: "dark_moody_cinematic",
  dark_moody: "dark_moody_cinematic",
  moody_basketball: "dark_moody_cinematic",
  cool_cinematic: "dark_moody_cinematic",
  lifestyle_glitch: "lifestyle_glitch",
  nyc_glitch: "lifestyle_glitch",
  city_energy: "lifestyle_glitch",
  lifestyle_fast: "lifestyle_glitch",
  tiktok_energy_pulse: "tiktok_energy_pulse",
  tiktok_energy: "tiktok_energy_pulse",
  pulse: "tiktok_energy_pulse",
  viral_energy: "tiktok_energy_pulse",
};

const PARTICLE_EFFECT_MAP: Record<string, ParticleKind> = {
  light_leak: "light_leak",
  sparks: "sparks",
  lens_flare: "lens_flare",
  dust: "dust",
  smoke: "smoke",
  confetti: "confetti",
  rain: "rain",
};

const TEXT_EFFECT_KINDS = new Set([
  "kinetic_caption", "subtitle", "title_card",
  "lower_third", "lyric_text", "word_pop",
]);

export interface DispatchContext {
  ctx: CanvasRenderingContext2D;
  baseCanvas: HTMLCanvasElement;
  prevFrameCanvas?: HTMLCanvasElement;
  heldFrameCanvas?: HTMLCanvasElement;
  width: number;
  height: number;
  timelineTime: number;
  shotLocalTime: number;
  video?: HTMLVideoElement;
}

/**
 * Apply effects assigned to a specific engine for one shot's effect bundle.
 * Returns true if anything was rendered.
 */
export async function dispatchToEngine(
  engineId: EngineId,
  effectKinds: string[],
  effectsByKind: Map<string, any>,
  context: DispatchContext,
): Promise<boolean> {
  let rendered = false;

  for (const kind of effectKinds) {
    const effect = context.shotLocalTime >= 0 ? effectsByKind.get(kind) : null;
    if (!effect) continue;
    const intensity = effect.intensity ?? 0.7;
    const localStart = effect.startTime ?? 0;
    const localDur = effect.duration ?? 1.0;
    const localT = (context.shotLocalTime - localStart) / localDur;

    if (localT < 0 || localT > 1) continue;

    try {
      if (engineId === "shader-fx" && SHADER_EFFECT_MAP[kind]) {
        const shader = getShaderFX(context.width, context.height);
        const spec = getShaderSpec(SHADER_EFFECT_MAP[kind]);
        if (spec) {
          // Merge defaults with shot-level intensity override
          const params = effect.params ?? {};
          const uniforms = {
            ...spec.defaultUniforms,
            ...params,
            u_intensity: intensity,
          };
          shader.applyAdvanced(
            context.baseCanvas,
            SHADER_EFFECT_MAP[kind],
            uniforms,
            spec.requiresPrevFrame ? context.prevFrameCanvas : undefined,
            spec.requiresHeldFrame ? context.heldFrameCanvas : undefined,
          );
        } else {
          shader.apply(context.baseCanvas, SHADER_EFFECT_MAP[kind], intensity);
        }
        context.ctx.drawImage(shader.getCanvas(), 0, 0, context.width, context.height);
        rendered = true;
      }
      else if (engineId === "particle-fx" && PARTICLE_EFFECT_MAP[kind]) {
        const particles = getParticleFX();
        particles.apply(
          context.ctx,
          {
            kind: PARTICLE_EFFECT_MAP[kind],
            intensity,
            progress: localT,
            centerX: effect.params?.centerX ?? 0.5,
            centerY: effect.params?.centerY ?? 0.5,
          },
          context.width,
          context.height,
        );
        rendered = true;
      }
      else if (engineId === "text-engine" && TEXT_EFFECT_KINDS.has(kind)) {
        const textEngine = getTextEngine();
        const spec: KineticTextSpec = {
          text: effect.params?.text ?? effect.text ?? "",
          startTime: localStart,
          duration: localDur,
          animation: effect.params?.animation ?? "pop",
          style: {
            fontSize: effect.params?.fontSize ?? 120,
            fontFamily: effect.params?.fontFamily ?? "Impact",
            color: effect.params?.color ?? "#ffffff",
            strokeColor: effect.params?.strokeColor ?? "#000000",
            strokeWidth: effect.params?.strokeWidth ?? 6,
            backgroundColor: effect.params?.backgroundColor,
            position: effect.params?.position ?? { x: 50, y: 50 },
            align: effect.params?.align ?? "center",
            fontWeight: effect.params?.fontWeight ?? "900",
          },
        };
        if (spec.text) {
          textEngine.draw(context.ctx, spec, context.shotLocalTime, context.width, context.height);
          rendered = true;
        }
      }
      else if (engineId === "ai-specialist" && (kind === "subject_isolation" || kind === "isolate_subject" || kind === "bg_blur" || kind === "bg_dim")) {
        const sam = getSAMMaskRenderer();
        if (effect.params?.maskUrl && context.video) {
          const mask = await sam.loadMask(effect.params.maskUrl);
          sam.composite(
            context.ctx,
            context.video,
            mask,
            context.shotLocalTime,
            {
              intensity,
              backgroundMode: effect.params?.backgroundMode ?? (kind === "bg_blur" ? "blur" : kind === "bg_dim" ? "dim" : "blur"),
              subjectHighlight: true,
            },
            context.width,
            context.height
          );
          rendered = true;
        }
      }
      // Specialist AI engines — SAM2, Depth, RIFE
      else if (engineId === "specialist-ai") {
        const { compositeSAMMask, compositeDepthFocus, compositeSubjectFallback } = await import("./specialist-compositor");
        const sourceVideo = context.video;

        if ((kind === "subject_isolation" || kind === "subject_pop" ||
             kind === "bg_blur_subject" || kind === "bg_dim_subject") && sourceVideo) {
          if (effect.params?.maskUrl) {
            // Server provided a mask — use it
            await compositeSAMMask(
              context.ctx,
              sourceVideo,
              effect.params.maskUrl,
              context.shotLocalTime ?? 0,
              {
                intensity,
                backgroundMode: kind === "bg_blur_subject" ? "blur"
                  : kind === "bg_dim_subject" ? "dim" : "blur",
                backgroundColor: effect.params.backgroundColor,
              },
              context.width,
              context.height,
            );
            rendered = true;
          } else {
            // No mask (HF rate-limited or skipped) — use MediaPipe browser fallback
            await compositeSubjectFallback(
              context.ctx,
              sourceVideo,
              context.shotLocalTime ?? 0,
              {
                intensity,
                backgroundMode: kind === "bg_blur_subject" ? "blur"
                  : kind === "bg_dim_subject" ? "dim" : "blur",
                backgroundColor: effect.params?.backgroundColor,
              },
              context.width,
              context.height,
            );
            rendered = true;
          }
        } else if ((kind === "depth_focus" || kind === "depth_parallax") &&
                   effect.params?.depthUrl && sourceVideo) {
          await compositeDepthFocus(
            context.ctx,
            sourceVideo,
            effect.params.depthUrl,
            context.shotLocalTime ?? 0,
            {
              focalDepth: effect.params.focalDepth ?? 0.3,
              blurStrength: intensity,
            },
            context.width,
            context.height,
          );
          rendered = true;
        }
      }
      // OpenCV browser effects
      else if (engineId === "opencv-browser") {
        const { detectFaces, detectEdges } = await import("../integrations/opencv-wrapper");

        if (kind === "edge_outline" && context.baseCanvas) {
          const edges = await detectEdges(context.baseCanvas, 50, 150);
          const edgeCanvas = document.createElement("canvas");
          edgeCanvas.width = context.width;
          edgeCanvas.height = context.height;
          edgeCanvas.getContext("2d")!.putImageData(edges, 0, 0);

          context.ctx.save();
          context.ctx.globalAlpha = intensity * 0.6;
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.drawImage(edgeCanvas, 0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        } else if (kind === "face_detect_overlay" && context.baseCanvas) {
          const faces = await detectFaces(context.baseCanvas);
          context.ctx.save();
          context.ctx.strokeStyle = "rgba(0,255,128,0.7)";
          context.ctx.lineWidth = 2;
          for (const f of faces) {
            context.ctx.strokeRect(f.x, f.y, f.width, f.height);
          }
          context.ctx.restore();
          rendered = true;
        }
      }
      else if (engineId === "webgl-grade") {
        if (kind === "push_in" || kind === "speed_ramp") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.3, intensity * 0.4);
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.fillStyle = "rgba(255,255,255,0.1)";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        } else if (kind === "impact_flash") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.25, intensity * 0.3);
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.fillStyle = "rgba(255,220,180,0.15)";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        } else if (kind === "color_pulse") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.2, intensity * 0.25);
          context.ctx.globalCompositeOperation = "overlay";
          context.ctx.fillStyle = effect.params?.color ?? "rgba(255,100,50,0.1)";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        }
      }
      else if (engineId === "canvas2d") {
        if (kind === "impact_flash") {
          context.ctx.save();
          context.ctx.globalAlpha = Math.min(0.35, intensity * 0.4);
          context.ctx.globalCompositeOperation = "screen";
          context.ctx.fillStyle = "#ffffff";
          context.ctx.fillRect(0, 0, context.width, context.height);
          context.ctx.restore();
          rendered = true;
        }
      }
    } catch (e: any) {
      console.warn(`[engine-dispatch] ${engineId}:${kind} failed:`, e.message);
    }
  }

  return rendered;
}

export function disposeDispatcher() {
  if (_shaderFX) {
    _shaderFX.dispose();
    _shaderFX = null;
  }
  _particleFX = null;
  _textEngine = null;
}
