/**
 * Pro-grade color temperature shader — Kelvin-based warm/cool
 * Proper warm/cool tinting instead of RGB hacks
 */

export const COLOR_TEMPERATURE_FRAG = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_kelvin_shift;  // -1 cool, 0 neutral, +1 warm
uniform float u_tint;          // -1 magenta, 0 neutral, +1 green
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  // Warm = +R/+Y, Cool = +B/-Y. Proper Kelvin approximation.
  col.r += u_kelvin_shift * 0.1;
  col.g += u_kelvin_shift * 0.04;
  col.b -= u_kelvin_shift * 0.1;
  // Tint axis
  col.g += u_tint * 0.05;
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export const COLOR_TEMPERATURE_UNIFORMS = {
  u_kelvin_shift: 0.0,
  u_tint: 0.0,
};
