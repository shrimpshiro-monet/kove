/**
 * Curated Shadertoy-inspired fragment shaders
 * All implementations are MIT-original interpretations of public-domain patterns.
 */

export interface ShadertoyShaderSpec {
  id: string;
  displayName: string;
  category: string;
  fragmentShader: string;
  defaultUniforms: Record<string, number>;
  monetAliases: string[];
}

const PLASMA = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float p = sin(v_uv.x * 10.0 + u_time) + sin(v_uv.y * 10.0 + u_time * 1.3) +
            sin((v_uv.x + v_uv.y) * 8.0 + u_time * 0.7);
  p = p / 3.0;
  vec3 tint = vec3(0.5 + 0.5*sin(p), 0.5 + 0.5*sin(p + 2.094), 0.5 + 0.5*sin(p + 4.188));
  gl_FragColor = vec4(mix(col, col * tint * 1.5, u_intensity), 1.0);
}`;

const HEAT_WAVE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv;
  uv.x += sin(uv.y * 30.0 + u_time * 4.0) * 0.005 * u_intensity;
  gl_FragColor = texture2D(u_texture, uv);
}`;

const CRT_MONITOR = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv - 0.5;
  uv *= 1.0 + dot(uv, uv) * 0.15 * u_intensity;
  uv += 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 col = texture2D(u_texture, uv).rgb;
  col *= 1.0 - smoothstep(0.4, 0.8, length(uv - 0.5)) * 0.3 * u_intensity;
  col *= 0.9 + 0.1 * sin(uv.y * 800.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const DREAM_BLUR = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec4 col = vec4(0.0);
  float total = 0.0;
  for (float a = 0.0; a < 6.28; a += 0.785) {
    for (float r = 1.0; r < 4.0; r += 1.0) {
      vec2 d = vec2(cos(a), sin(a)) * r * 3.0 * u_intensity / u_resolution;
      col += texture2D(u_texture, v_uv + d);
      total += 1.0;
    }
  }
  col /= total;
  col.r *= 1.05;
  col.b *= 1.08;
  gl_FragColor = col;
}`;

const KALEIDOSCOPE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_segments;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv - 0.5;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float seg = 6.28318 / u_segments;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  uv = vec2(cos(a), sin(a)) * r;
  gl_FragColor = texture2D(u_texture, uv + 0.5);
}`;

const PULSE_WAVE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec2 d = v_uv - 0.5;
  float dist = length(d);
  float wave = sin(dist * 40.0 - u_time * 8.0) * 0.5 + 0.5;
  wave = pow(wave, 4.0);
  vec3 col = texture2D(u_texture, v_uv + d * wave * 0.02 * u_intensity).rgb;
  gl_FragColor = vec4(col, 1.0);
}`;

const ASCII_MATRIX = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec2 grid = floor(v_uv * u_resolution / 8.0) * 8.0 / u_resolution;
  float patternVal = step(0.5, fract(grid.x * 100.0 + grid.y * 73.0)) *
                     step(0.3, lum);
  col = mix(col, vec3(0.0, 1.0, 0.3) * patternVal, u_intensity);
  gl_FragColor = vec4(col, 1.0);
}`;

const HOLOGRAM = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float scan = sin(v_uv.y * 800.0 + u_time * 4.0) * 0.5 + 0.5;
  col *= 0.85 + 0.15 * scan;
  col.b = mix(col.b, 1.0, u_intensity * 0.2);
  col.r = mix(col.r, 0.0, u_intensity * 0.1);
  gl_FragColor = vec4(col, 1.0);
}`;

const THERMAL = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_intensity;
varying vec2 v_uv;
vec3 thermalRamp(float t) {
  vec3 c1 = vec3(0.0, 0.0, 0.5);
  vec3 c2 = vec3(0.0, 0.5, 1.0);
  vec3 c3 = vec3(0.0, 1.0, 0.0);
  vec3 c4 = vec3(1.0, 1.0, 0.0);
  vec3 c5 = vec3(1.0, 0.3, 0.0);
  vec3 c6 = vec3(1.0, 0.0, 0.5);
  if (t < 0.2) return mix(c1, c2, t / 0.2);
  if (t < 0.4) return mix(c2, c3, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c3, c4, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c4, c5, (t - 0.6) / 0.2);
  return mix(c5, c6, (t - 0.8) / 0.2);
}
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 thermal = thermalRamp(lum);
  gl_FragColor = vec4(mix(col, thermal, u_intensity), 1.0);
}`;

const DUOTONE = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 dark = vec3(0.05, 0.05, 0.15);
  vec3 light = vec3(1.0, 0.85, 0.6);
  gl_FragColor = vec4(mix(dark, light, lum), 1.0);
}`;

const FLOATING_DUST = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  for (float i = 0.0; i < 5.0; i++) {
    vec2 p = vec2(h(vec2(i)) + sin(u_time * 0.3 + i) * 0.1,
                  fract(h(vec2(i + 7.0)) - u_time * 0.02));
    float d = distance(v_uv, p);
    float dot_val = smoothstep(0.005, 0.0, d);
    col += vec3(1.0) * dot_val * u_intensity * 0.5;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const INFRARED = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec2 px = 1.0 / u_resolution;
  vec3 c1 = texture2D(u_texture, v_uv + vec2(-px.x, 0.0)).rgb;
  vec3 c2 = texture2D(u_texture, v_uv + vec2( px.x, 0.0)).rgb;
  vec3 c3 = texture2D(u_texture, v_uv + vec2(0.0, -px.y)).rgb;
  vec3 c4 = texture2D(u_texture, v_uv + vec2(0.0,  px.y)).rgb;
  vec3 edge = abs(c2 - c1) + abs(c4 - c3);
  float e = max(edge.r, max(edge.g, edge.b));
  vec3 col = vec3(0.0, 0.8 + 0.2 * sin(v_uv.x * 50.0), 0.6) * smoothstep(0.0, 0.3, e * u_intensity);
  gl_FragColor = vec4(col, 1.0);
}`;

const FILM_SCRATCHES = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float scratchY = floor(u_time * 12.0);
  float scratchX = rand(vec2(scratchY, 1.0));
  if (abs(v_uv.x - scratchX) < 0.001 && rand(vec2(scratchY, 2.0)) < 0.5) {
    col = vec3(0.9) * u_intensity + col * (1.0 - u_intensity);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const LIQUID = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv;
  uv.x += sin(uv.y * 8.0 + u_time) * 0.01 * u_intensity;
  uv.y += cos(uv.x * 8.0 + u_time * 0.7) * 0.01 * u_intensity;
  gl_FragColor = texture2D(u_texture, uv);
}`;

const BLOOM = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  vec3 bloom = vec3(0.0);
  for (float r = 1.0; r <= 5.0; r += 1.0) {
    for (float a = 0.0; a < 6.28; a += 1.047) {
      vec2 d = vec2(cos(a), sin(a)) * r * 2.0 / u_resolution;
      vec3 c = texture2D(u_texture, v_uv + d).rgb;
      float brightness = max(c.r, max(c.g, c.b));
      if (brightness > 0.7) bloom += c * (brightness - 0.7);
    }
  }
  bloom /= 30.0;
  gl_FragColor = vec4(col + bloom * u_intensity, 1.0);
}`;

export const SHADERTOY_SHADERS: ShadertoyShaderSpec[] = [
  { id: "plasma", displayName: "Plasma Wave", category: "stylize",
    fragmentShader: PLASMA, defaultUniforms: { u_time: 0.0, u_intensity: 0.5 },
    monetAliases: ["psychedelic"] },
  { id: "heat_wave", displayName: "Heat Wave", category: "distort",
    fragmentShader: HEAT_WAVE, defaultUniforms: { u_time: 0.0, u_intensity: 0.5 },
    monetAliases: ["mirage"] },
  { id: "crt_monitor", displayName: "CRT Monitor", category: "stylize",
    fragmentShader: CRT_MONITOR, defaultUniforms: { u_intensity: 0.7 },
    monetAliases: ["crt", "retro_tv"] },
  { id: "dream_blur", displayName: "Dream Blur", category: "blur",
    fragmentShader: DREAM_BLUR, defaultUniforms: { u_intensity: 0.7 },
    monetAliases: ["dream", "soft_focus"] },
  { id: "kaleidoscope", displayName: "Kaleidoscope", category: "distort",
    fragmentShader: KALEIDOSCOPE, defaultUniforms: { u_segments: 6.0 },
    monetAliases: [] },
  { id: "pulse_wave", displayName: "Pulse Wave", category: "distort",
    fragmentShader: PULSE_WAVE, defaultUniforms: { u_time: 0.0, u_intensity: 0.7 },
    monetAliases: ["shock_wave"] },
  { id: "ascii_matrix", displayName: "ASCII Matrix", category: "stylize",
    fragmentShader: ASCII_MATRIX, defaultUniforms: { u_intensity: 0.6 },
    monetAliases: ["matrix", "ascii"] },
  { id: "hologram", displayName: "Hologram", category: "stylize",
    fragmentShader: HOLOGRAM, defaultUniforms: { u_time: 0.0, u_intensity: 0.7 },
    monetAliases: ["sci_fi"] },
  { id: "thermal", displayName: "Thermal Vision", category: "color",
    fragmentShader: THERMAL, defaultUniforms: { u_intensity: 0.8 },
    monetAliases: ["predator_vision"] },
  { id: "duotone", displayName: "Duotone", category: "color",
    fragmentShader: DUOTONE, defaultUniforms: {},
    monetAliases: [] },
  { id: "floating_dust", displayName: "Floating Dust", category: "stylize",
    fragmentShader: FLOATING_DUST, defaultUniforms: { u_time: 0.0, u_intensity: 0.7 },
    monetAliases: ["particles_dust"] },
  { id: "infrared", displayName: "Infrared Edge", category: "stylize",
    fragmentShader: INFRARED, defaultUniforms: { u_intensity: 0.8 },
    monetAliases: ["edge_glow"] },
  { id: "film_scratches", displayName: "Film Scratches", category: "stylize",
    fragmentShader: FILM_SCRATCHES, defaultUniforms: { u_time: 0.0, u_intensity: 0.5 },
    monetAliases: ["old_film"] },
  { id: "liquid", displayName: "Liquid Distort", category: "distort",
    fragmentShader: LIQUID, defaultUniforms: { u_time: 0.0, u_intensity: 0.6 },
    monetAliases: ["underwater"] },
  { id: "bloom_highlights", displayName: "Bloom", category: "color",
    fragmentShader: BLOOM, defaultUniforms: { u_intensity: 0.7 },
    monetAliases: ["glow_pro"] },
];
