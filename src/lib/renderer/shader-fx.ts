// src/lib/renderer/shader-fx.ts
// WebGL shader FX: glitch, VHS, RGB shift, scanlines, pixelate

import { SPIDERVERSE_SHADERS } from "../shaders/spiderverse";
import { GLFX_SHADERS } from "../shaders/glfx-effects";
import { SHADERTOY_SHADERS } from "../shaders/shadertoy-collection";
import { CUSTOM_VFX_SHADERS } from "../shaders/custom-vfx";
import { FILM_GRAIN_PRO_FRAG, FILM_GRAIN_PRO_UNIFORMS } from "../shaders/pro-effects/film-grain-pro";
import { VIGNETTE_PRO_FRAG, VIGNETTE_PRO_UNIFORMS } from "../shaders/pro-effects/vignette-pro";
import { COLOR_TEMPERATURE_FRAG, COLOR_TEMPERATURE_UNIFORMS } from "../shaders/pro-effects/color-temperature";
// Compiled once. One canvas per effect type. Stateless apply().

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// ─── GLITCH: slice displacement + RGB shift + scanlines ─────────────
const GLITCH_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

float rand(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  // Horizontal slice glitches — random per row
  float slice = floor(uv.y * 30.0);
  float seed = rand(vec2(slice, floor(u_time * 8.0)));
  float shift = (seed - 0.5) * 0.18 * u_intensity * step(0.7, seed);
  uv.x += shift;

  // RGB split
  float ca = 0.012 * u_intensity;
  float r = texture2D(u_tex, uv + vec2(ca, 0.0)).r;
  float g = texture2D(u_tex, uv).g;
  float b = texture2D(u_tex, uv - vec2(ca, 0.0)).b;

  // Scanlines
  float scan = sin(v_uv.y * 1200.0) * 0.06 * u_intensity;

  gl_FragColor = vec4(r - scan, g - scan, b - scan, 1.0);
}
`;

// ─── VHS: chroma bleed, tape noise, color shift ──────────────────────
const VHS_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

float rand(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  // Tape wobble — slow horizontal sine
  uv.x += sin(uv.y * 24.0 + u_time * 2.5) * 0.005 * u_intensity;

  // Chroma bleed — heavy on R/B
  float bleed = 0.015 * u_intensity;
  float r = texture2D(u_tex, uv + vec2(bleed, 0.0)).r;
  float g = texture2D(u_tex, uv).g;
  float b = texture2D(u_tex, uv + vec2(bleed * 1.6, 0.0)).b;
  vec3 col = vec3(r, g, b);

  // Noise
  float n = rand(uv + u_time) * 0.18 * u_intensity;
  col += n - 0.09 * u_intensity;

  // Slight desaturation + warm tint
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.82);
  col.r *= 1.0 + 0.06 * u_intensity;
  col.b *= 1.0 - 0.04 * u_intensity;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── RGB SHIFT (pure chromatic): no scanlines, no noise ─────────────
const RGB_SHIFT_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  float ca = 0.022 * u_intensity;
  float r = texture2D(u_tex, v_uv + vec2(ca, 0.0)).r;
  float g = texture2D(u_tex, v_uv).g;
  float b = texture2D(u_tex, v_uv - vec2(ca, 0.0)).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

// ─── SCANLINES alone ────────────────────────────────────────────────
const SCANLINES_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_tex, v_uv).rgb;
  float scan = sin(v_uv.y * 800.0);
  col *= 1.0 - max(0.0, scan) * 0.18 * u_intensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─── PIXELATE ────────────────────────────────────────────────────────
const PIXELATE_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  float blocks = mix(800.0, 60.0, u_intensity);
  vec2 size = vec2(blocks / u_resolution.x, blocks / u_resolution.y);
  vec2 uv = floor(v_uv / size) * size + size * 0.5;
  gl_FragColor = texture2D(u_tex, uv);
}
`;

export type ShaderEffectKind =
  | "glitch"
  | "vhs"
  | "rgb_shift"
  | "scanlines"
  | "pixelate"
  | "halftone"
  | "comic_edges"
  | "frame_stutter"
  | "chromatic_glitch"
  // glfx effects
  | "brightness_contrast"
  | "hue_saturation"
  | "vibrance"
  | "sepia"
  | "vignette_pro"
  | "triangle_blur"
  | "lens_blur"
  | "tilt_shift"
  | "edges_gfx"
  | "ink_gfx"
  | "emboss_gfx"
  | "swirl_gfx"
  | "bulge_pinch"
  | "noise_film"
  | "posterize_gfx"
  | "zoom_blur"
  | "denoise_gfx"
  | "color_halftone"
  | "dot_screen"
  | "shift_towards"
  // shadertoy effects
  | "plasma"
  | "heat_wave"
  | "crt_monitor"
  | "dream_blur"
  | "kaleidoscope"
  | "pulse_wave"
  | "ascii_matrix"
  | "hologram"
  | "thermal"
  | "duotone"
  | "floating_dust"
  | "infrared"
  | "film_scratches"
  | "liquid"
  | "bloom_highlights"
  // pro-grade effects
  | "film_grain_pro"
  | "vignette_pro_v2"
  | "color_temperature"
  // custom VFX (matched to reference videos)
  | "spiderverse_halftone"
  | "sports_speed_trail"
  | "tyler_vibrant_pop"
  | "racing_motion_streak"
  | "dark_moody_cinematic"
  | "lifestyle_glitch"
  | "tiktok_energy_pulse";

interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class ShaderFXRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs: Map<ShaderEffectKind, ShaderProgram> = new Map();
  private startTime = performance.now();

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("webgl", { premultipliedAlpha: false });
    if (!ctx) throw new Error("WebGL not supported for ShaderFX");
    this.gl = ctx;
    this.initSharedResources();
    this.compileAllShaders();
  }

  private initSharedResources() {
    const gl = this.gl;
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile failed: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  private buildProgram(
    kind: ShaderEffectKind,
    fragSrc: string,
    uniformNames: string[],
  ): ShaderProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERT);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`${kind} link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniformNames) {
      uniforms[n] = gl.getUniformLocation(prog, n);
    }
    return { program: prog, uniforms };
  }

  private compileAllShaders() {
    this.programs.set("glitch", this.buildProgram("glitch", GLITCH_FRAG,
      ["u_tex", "u_time", "u_intensity"]));
    this.programs.set("vhs", this.buildProgram("vhs", VHS_FRAG,
      ["u_tex", "u_time", "u_intensity"]));
    this.programs.set("rgb_shift", this.buildProgram("rgb_shift", RGB_SHIFT_FRAG,
      ["u_tex", "u_intensity"]));
    this.programs.set("scanlines", this.buildProgram("scanlines", SCANLINES_FRAG,
      ["u_tex", "u_intensity"]));
    this.programs.set("pixelate", this.buildProgram("pixelate", PIXELATE_FRAG,
      ["u_tex", "u_intensity", "u_resolution"]));

    // NEW: Spider-Verse bundle
    for (const spec of SPIDERVERSE_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      if (spec.requiresPrevFrame) uniformNames.push("u_prevTexture", "u_hasPrevTexture");
      if (spec.requiresHeldFrame) uniformNames.push("u_heldTexture", "u_hasHeldTexture");
      this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
    }

    // Register all glfx shaders
    for (const spec of GLFX_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      try {
        this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
      } catch (e) {
        console.warn(`[shader-fx] failed to compile glfx shader ${spec.id}:`, e);
      }
    }

    // Register all shadertoy shaders
    for (const spec of SHADERTOY_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      try {
        this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
      } catch (e) {
        console.warn(`[shader-fx] failed to compile shadertoy shader ${spec.id}:`, e);
      }
    }

    // Register pro-grade shaders
    try {
      this.programs.set("film_grain_pro" as ShaderEffectKind, this.buildProgram(
        "film_grain_pro", FILM_GRAIN_PRO_FRAG,
        ["u_texture", "u_resolution", "u_time", ...Object.keys(FILM_GRAIN_PRO_UNIFORMS)]
      ));
      this.programs.set("vignette_pro_v2" as ShaderEffectKind, this.buildProgram(
        "vignette_pro_v2", VIGNETTE_PRO_FRAG,
        ["u_texture", "u_resolution", "u_time", ...Object.keys(VIGNETTE_PRO_UNIFORMS)]
      ));
      this.programs.set("color_temperature" as ShaderEffectKind, this.buildProgram(
        "color_temperature", COLOR_TEMPERATURE_FRAG,
        ["u_texture", "u_resolution", "u_time", ...Object.keys(COLOR_TEMPERATURE_UNIFORMS)]
      ));
    } catch (e) {
      console.warn("[shader-fx] failed to register pro effects:", e);
    }

    // Register custom VFX shaders (matched to reference videos)
    for (const spec of CUSTOM_VFX_SHADERS) {
      const uniformNames = ["u_texture", "u_resolution", "u_time", ...Object.keys(spec.defaultUniforms)];
      try {
        this.programs.set(spec.id as ShaderEffectKind, this.buildProgram(spec.id as ShaderEffectKind, spec.fragmentShader, uniformNames));
      } catch (e) {
        console.warn(`[shader-fx] failed to compile custom VFX ${spec.id}:`, e);
      }
    }

    console.log(`[shader-fx] registered ${this.programs.size} total shader programs`);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Apply effect → outputs to internal canvas.
   * Call getCanvas() to composite back onto main canvas.
   */
  apply(
    source: HTMLCanvasElement | HTMLVideoElement,
    kind: ShaderEffectKind,
    intensity: number,
  ) {
    const prog = this.programs.get(kind);
    if (!prog) {
      console.warn(`[shader-fx] unknown kind: ${kind}`);
      return;
    }

    const gl = this.gl;
    gl.useProgram(prog.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const aPos = gl.getAttribLocation(prog.program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.uniform1i(prog.uniforms.u_tex, 0);
    gl.uniform1f(prog.uniforms.u_intensity, intensity);
    if (prog.uniforms.u_time) {
      gl.uniform1f(prog.uniforms.u_time, (performance.now() - this.startTime) / 1000);
    }
    if (prog.uniforms.u_resolution) {
      gl.uniform2f(prog.uniforms.u_resolution, this.canvas.width, this.canvas.height);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  applyAdvanced(
    source: HTMLCanvasElement | HTMLVideoElement,
    shaderId: ShaderEffectKind,
    uniforms: Record<string, any>,
    prevFrame?: HTMLCanvasElement,
    heldFrame?: HTMLCanvasElement,
  ) {
    const prog = this.programs.get(shaderId);
    if (!prog) return;

    const gl = this.gl;
    gl.useProgram(prog.program);

    // Quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const aPos = gl.getAttribLocation(prog.program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Main texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(prog.uniforms.u_texture, 0);

    // Optional prev/held textures
    if (prevFrame) {
      const prevTex = this.ensureAuxTexture("prev");
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prevTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prevFrame);
      gl.uniform1i(prog.uniforms.u_prevTexture, 1);
      gl.uniform1i(prog.uniforms.u_hasPrevTexture, 1);
    } else if (prog.uniforms.u_hasPrevTexture) {
      gl.uniform1i(prog.uniforms.u_hasPrevTexture, 0);
    }

    if (heldFrame) {
      const heldTex = this.ensureAuxTexture("held");
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, heldTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, heldFrame);
      gl.uniform1i(prog.uniforms.u_heldTexture, 2);
      gl.uniform1i(prog.uniforms.u_hasHeldTexture, 1);
    } else if (prog.uniforms.u_hasHeldTexture) {
      gl.uniform1i(prog.uniforms.u_hasHeldTexture, 0);
    }

    // Standard uniforms
    if (prog.uniforms.u_time) {
      gl.uniform1f(prog.uniforms.u_time, (performance.now() - this.startTime) / 1000);
    }
    if (prog.uniforms.u_resolution) {
      gl.uniform2f(prog.uniforms.u_resolution, this.canvas.width, this.canvas.height);
    }

    // Custom uniforms from the call
    for (const [name, value] of Object.entries(uniforms)) {
      const loc = prog.uniforms[name];
      if (!loc) continue;
      if (typeof value === "number") gl.uniform1f(loc, value);
      else if (typeof value === "boolean") gl.uniform1i(loc, value ? 1 : 0);
      else if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
        else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
      }
    }

    // Special handling for u_animTiming (int) and similar
    if (uniforms.u_animTiming !== undefined && prog.uniforms.u_animTiming) {
      gl.uniform1i(prog.uniforms.u_animTiming, uniforms.u_animTiming);
    }
    if (uniforms.u_colorMode !== undefined && prog.uniforms.u_colorMode) {
      gl.uniform1i(prog.uniforms.u_colorMode, uniforms.u_colorMode);
    }
    if (uniforms.u_edgeStyle !== undefined && prog.uniforms.u_edgeStyle) {
      gl.uniform1i(prog.uniforms.u_edgeStyle, uniforms.u_edgeStyle);
    }
    if (uniforms.u_phaseOffset !== undefined && prog.uniforms.u_phaseOffset) {
      gl.uniform1i(prog.uniforms.u_phaseOffset, uniforms.u_phaseOffset);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private auxTextures = new Map<string, WebGLTexture>();
  private ensureAuxTexture(name: string): WebGLTexture {
    if (this.auxTextures.has(name)) return this.auxTextures.get(name)!;
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.auxTextures.set(name, tex);
    return tex;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    for (const { program } of this.programs.values()) gl.deleteProgram(program);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    for (const tex of this.auxTextures.values()) gl.deleteTexture(tex);
    this.auxTextures.clear();
    this.programs.clear();
  }
}
