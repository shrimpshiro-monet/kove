/**
 * Pro-grade vignette shader — smooth falloff with color tint option
 * Smoother gradient than the basic vignette_pro with adjustable softness
 */

export const VIGNETTE_PRO_FRAG = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_size;
uniform float u_softness;
uniform vec3 u_color;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  vec2 d = v_uv - 0.5;
  float dist = length(d) * (1.0 + u_size);
  float v = smoothstep(0.5, 0.5 - u_softness, dist);
  col = mix(col * u_color, col, v);
  gl_FragColor = vec4(col, 1.0);
}`;

export const VIGNETTE_PRO_UNIFORMS = {
  u_amount: 0.4,
  u_size: 0.5,
  u_softness: 0.3,
  u_color: [1.0, 0.95, 0.9],
};
