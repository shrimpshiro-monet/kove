/**
 * Pro-grade film grain shader — 3-octave noise for realistic film stock look
 * Replaces the basic single-octave noise_film with multi-scale grain
 */

export const FILM_GRAIN_PRO_FRAG = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform float u_size;
varying vec2 v_uv;

float rand(vec2 c) {
  return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = rand(i);
  float b = rand(i + vec2(1.0, 0.0));
  float c = rand(i + vec2(0.0, 1.0));
  float d = rand(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  vec2 p = v_uv * u_size + u_time * 0.001;
  // 3-octave noise — real film grain has structure at multiple scales
  float g = noise(p * 1.0) * 0.5
          + noise(p * 2.0) * 0.3
          + noise(p * 4.0) * 0.2;
  g = (g - 0.5) * u_intensity * 0.3;
  col += vec3(g);
  gl_FragColor = vec4(col, 1.0);
}`;

export const FILM_GRAIN_PRO_UNIFORMS = {
  u_intensity: 0.15,
  u_size: 200.0,
};
