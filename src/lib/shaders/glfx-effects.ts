/**
 * GPU image effects ported from glfx.js patterns
 * All shaders are GLSL ES 1.0 compatible (WebGL 1.0)
 * License: MIT-compatible — based on public glfx.js patterns
 */

export interface GLFXShaderSpec {
  id: string;
  displayName: string;
  category: "color" | "blur" | "distort" | "stylize" | "fun";
  fragmentShader: string;
  defaultUniforms: Record<string, number | number[] | boolean>;
  monetAliases: string[];
}

export const GLFX_VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const BRIGHTNESS_CONTRAST = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_brightness;
uniform float u_contrast;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  col += u_brightness;
  if (u_contrast > 0.0) {
    col = (col - 0.5) / (1.0 - u_contrast) + 0.5;
  } else {
    col = (col - 0.5) * (1.0 + u_contrast) + 0.5;
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const HUE_SATURATION = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_hue;
uniform float u_saturation;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float angle = u_hue * 3.14159265;
  float s = sin(angle), c = cos(angle);
  vec3 weights = vec3(2.0*c, -sqrt(3.0)*s-c, sqrt(3.0)*s-c) / 3.0;
  col = vec3(
    dot(col, weights.xyz),
    dot(col, weights.zxy),
    dot(col, weights.yzx)
  );
  float gray = dot(col, vec3(0.3, 0.59, 0.11));
  if (u_saturation > 0.0) {
    col += (col - vec3(gray)) * (1.0 / (1.0 - u_saturation) - 1.0);
  } else {
    col += (col - vec3(gray)) * (-u_saturation);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const VIBRANCE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_amount;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float average = (col.r + col.g + col.b) / 3.0;
  float mx = max(col.r, max(col.g, col.b));
  float amt = (mx - average) * (-3.0 * u_amount);
  col = mix(col, vec3(mx), amt);
  gl_FragColor = vec4(col, 1.0);
}`;

const SEPIA = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_amount;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float r = col.r, g = col.g, b = col.b;
  col.r = min(1.0, (r*(1.0-(0.607*u_amount))) + (g*(0.769*u_amount)) + (b*(0.189*u_amount)));
  col.g = min(1.0, (r*0.349*u_amount) + (g*(1.0-(0.314*u_amount))) + (b*0.168*u_amount));
  col.b = min(1.0, (r*0.272*u_amount) + (g*0.534*u_amount) + (b*(1.0-(0.869*u_amount))));
  gl_FragColor = vec4(col, 1.0);
}`;

const VIGNETTE_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_size;
uniform float u_amount;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float dist = distance(v_uv, vec2(0.5, 0.5));
  col *= smoothstep(0.8, u_size * 0.799, dist * (u_amount + u_size));
  gl_FragColor = vec4(col, 1.0);
}`;

const TRIANGLE_BLUR = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
varying vec2 v_uv;
void main() {
  vec4 col = vec4(0.0);
  float total = 0.0;
  vec2 delta = vec2(u_radius / u_resolution.x, 0.0);
  for (float t = -10.0; t <= 10.0; t++) {
    float pct = t / 10.0;
    float weight = 1.0 - abs(pct);
    col += texture2D(u_texture, v_uv + delta * pct) * weight;
    total += weight;
  }
  gl_FragColor = col / total;
}`;

const LENS_BLUR = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_brightness;
varying vec2 v_uv;
void main() {
  vec4 col = vec4(0.0);
  float total = 0.0;
  for (float a = -3.14; a <= 3.14; a += 1.047) {
    for (float r = 1.0; r <= 8.0; r += 1.0) {
      vec2 delta = vec2(cos(a), sin(a)) * r * u_radius / u_resolution;
      col += texture2D(u_texture, v_uv + delta);
      total += 1.0;
    }
  }
  col /= total;
  col.rgb *= (1.0 + u_brightness);
  gl_FragColor = col;
}`;

const TILT_SHIFT = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_blur_radius;
uniform float u_gradient_radius;
varying vec2 v_uv;
void main() {
  vec4 col = vec4(0.0);
  float total = 0.0;
  float center = 0.5;
  float dist = abs(v_uv.y - center);
  float blur = smoothstep(0.0, u_gradient_radius, dist) * u_blur_radius;
  for (float t = -10.0; t <= 10.0; t++) {
    float pct = t / 10.0;
    float weight = 1.0 - abs(pct);
    vec2 delta = vec2(blur / u_resolution.x * pct, 0.0);
    col += texture2D(u_texture, v_uv + delta) * weight;
    total += weight;
  }
  gl_FragColor = col / total;
}`;

const EDGES_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec2 px = 1.0 / u_resolution;
  vec3 c00 = texture2D(u_texture, v_uv + vec2(-px.x, -px.y)).rgb;
  vec3 c10 = texture2D(u_texture, v_uv + vec2( 0.0, -px.y)).rgb;
  vec3 c20 = texture2D(u_texture, v_uv + vec2( px.x, -px.y)).rgb;
  vec3 c01 = texture2D(u_texture, v_uv + vec2(-px.x,  0.0)).rgb;
  vec3 c21 = texture2D(u_texture, v_uv + vec2( px.x,  0.0)).rgb;
  vec3 c02 = texture2D(u_texture, v_uv + vec2(-px.x,  px.y)).rgb;
  vec3 c12 = texture2D(u_texture, v_uv + vec2( 0.0,  px.y)).rgb;
  vec3 c22 = texture2D(u_texture, v_uv + vec2( px.x,  px.y)).rgb;
  vec3 sobX = -c00 + c20 - 2.0*c01 + 2.0*c21 - c02 + c22;
  vec3 sobY = -c00 - 2.0*c10 - c20 + c02 + 2.0*c12 + c22;
  vec3 edge = sqrt(sobX * sobX + sobY * sobY) * u_strength;
  gl_FragColor = vec4(edge, 1.0);
}`;

const INK_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec2 px = 1.0 / u_resolution;
  vec3 c00 = texture2D(u_texture, v_uv + vec2(-px.x, -px.y)).rgb;
  vec3 c22 = texture2D(u_texture, v_uv + vec2( px.x,  px.y)).rgb;
  float edge = length(c22 - c00);
  vec3 src = texture2D(u_texture, v_uv).rgb;
  float ink = 1.0 - smoothstep(0.0, u_strength, edge);
  gl_FragColor = vec4(src * ink, 1.0);
}`;

const EMBOSS_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec2 px = 1.0 / u_resolution;
  vec3 a = texture2D(u_texture, v_uv + vec2(-px.x, -px.y)).rgb;
  vec3 b = texture2D(u_texture, v_uv + vec2( px.x,  px.y)).rgb;
  vec3 e = (b - a) * u_strength + 0.5;
  gl_FragColor = vec4(e, 1.0);
}`;

const SWIRL_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_radius;
uniform float u_angle;
varying vec2 v_uv;
void main() {
  vec2 center = vec2(0.5);
  vec2 d = v_uv - center;
  float r = length(d);
  if (r < u_radius) {
    float pct = (u_radius - r) / u_radius;
    float theta = pct * pct * u_angle;
    float s = sin(theta), c = cos(theta);
    d = vec2(d.x*c - d.y*s, d.x*s + d.y*c);
  }
  gl_FragColor = texture2D(u_texture, center + d);
}`;

const BULGE_PINCH = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_radius;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec2 center = vec2(0.5);
  vec2 d = v_uv - center;
  float dist = length(d);
  if (dist < u_radius) {
    float pct = dist / u_radius;
    if (u_strength < 0.0) pct = mix(pct, pow(pct, 1.0 - u_strength * 0.75), pct);
    else pct = mix(pct, pow(pct, 1.0 + u_strength * 0.75), 1.0 - pct);
    d = d * (pct / (dist / u_radius));
  }
  gl_FragColor = texture2D(u_texture, center + d);
}`;

const NOISE_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_time;
varying vec2 v_uv;
float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  float r = rand(v_uv * (u_time + 1.0));
  col += (r - 0.5) * u_amount;
  gl_FragColor = vec4(col, 1.0);
}`;

const POSTERIZE_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_levels;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  col = floor(col * u_levels) / u_levels;
  gl_FragColor = vec4(col, 1.0);
}`;

const ZOOM_BLUR_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec2 center = vec2(0.5);
  vec4 col = vec4(0.0);
  float total = 0.0;
  for (float t = 0.0; t <= 30.0; t++) {
    float pct = (t + mod(v_uv.x * 13.0, 1.0)) / 30.0;
    float weight = 1.0 - pct;
    vec2 sample_pos = v_uv + (center - v_uv) * pct * u_strength;
    col += texture2D(u_texture, sample_pos) * weight;
    total += weight;
  }
  gl_FragColor = col / total;
}`;

const DENOISE_GFX = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec4 center = texture2D(u_texture, v_uv);
  vec4 col = center;
  float total = 1.0;
  for (float dx = -2.0; dx <= 2.0; dx += 1.0) {
    for (float dy = -2.0; dy <= 2.0; dy += 1.0) {
      vec2 delta = vec2(dx, dy) / u_resolution;
      vec4 sampled = texture2D(u_texture, v_uv + delta);
      float weight = 1.0 - length(sampled.rgb - center.rgb) * u_strength;
      weight = max(0.0, weight);
      col += sampled * weight;
      total += weight;
    }
  }
  gl_FragColor = col / total;
}`;

const COLOR_HALFTONE = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_angle;
uniform float u_size;
varying vec2 v_uv;
float pattern(vec2 uv, float angle) {
  float s = sin(angle), c = cos(angle);
  vec2 tex = uv * u_resolution - vec2(0.5);
  vec2 point = vec2(c * tex.x - s * tex.y, s * tex.x + c * tex.y) * u_size;
  return (sin(point.x) * sin(point.y)) * 4.0;
}
void main() {
  vec4 col = texture2D(u_texture, v_uv);
  vec3 cmy = 1.0 - col.rgb;
  float k = min(cmy.x, min(cmy.y, cmy.z));
  cmy = (cmy - vec3(k)) / (1.0 - k);
  cmy = clamp(cmy * 10.0 - 3.0 + vec3(
    pattern(v_uv, u_angle + 0.26179),
    pattern(v_uv, u_angle + 1.30899),
    pattern(v_uv, u_angle)
  ), 0.0, 1.0);
  k = clamp(k * 10.0 - 5.0 + pattern(v_uv, u_angle + 0.78539), 0.0, 1.0);
  gl_FragColor = vec4(1.0 - cmy - k, col.a);
}`;

const DOT_SCREEN = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_angle;
uniform float u_size;
varying vec2 v_uv;
float dotPattern(vec2 uv) {
  float s = sin(u_angle), c = cos(u_angle);
  vec2 tex = uv * u_resolution - vec2(0.5);
  vec2 point = vec2(c * tex.x - s * tex.y, s * tex.x + c * tex.y) * u_size;
  return (sin(point.x) * sin(point.y)) * 4.0;
}
void main() {
  vec4 col = texture2D(u_texture, v_uv);
  float avg = (col.r + col.g + col.b) / 3.0;
  gl_FragColor = vec4(vec3(avg * 10.0 - 5.0 + dotPattern(v_uv)), col.a);
}`;

const SHIFT_TOWARDS = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec3 u_target;
uniform float u_amount;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  col = mix(col, u_target, u_amount);
  gl_FragColor = vec4(col, 1.0);
}`;

export const GLFX_SHADERS: GLFXShaderSpec[] = [
  {
    id: "brightness_contrast",
    displayName: "Brightness/Contrast",
    category: "color",
    fragmentShader: BRIGHTNESS_CONTRAST,
    defaultUniforms: { u_brightness: 0.0, u_contrast: 0.0 },
    monetAliases: ["brightness", "contrast", "exposure"],
  },
  {
    id: "hue_saturation",
    displayName: "Hue & Saturation",
    category: "color",
    fragmentShader: HUE_SATURATION,
    defaultUniforms: { u_hue: 0.0, u_saturation: 0.0 },
    monetAliases: ["hue_shift", "saturation_shift"],
  },
  {
    id: "vibrance",
    displayName: "Vibrance",
    category: "color",
    fragmentShader: VIBRANCE,
    defaultUniforms: { u_amount: 0.5 },
    monetAliases: ["vibrance"],
  },
  {
    id: "sepia",
    displayName: "Sepia",
    category: "color",
    fragmentShader: SEPIA,
    defaultUniforms: { u_amount: 0.8 },
    monetAliases: ["sepia", "vintage_tone"],
  },
  {
    id: "vignette_pro",
    displayName: "Vignette Pro",
    category: "color",
    fragmentShader: VIGNETTE_GFX,
    defaultUniforms: { u_size: 0.5, u_amount: 0.5 },
    monetAliases: ["vignette_pro"],
  },
  {
    id: "triangle_blur",
    displayName: "Triangle Blur",
    category: "blur",
    fragmentShader: TRIANGLE_BLUR,
    defaultUniforms: { u_radius: 20.0 },
    monetAliases: ["soft_blur", "gaussian_blur"],
  },
  {
    id: "lens_blur",
    displayName: "Lens Blur (Bokeh)",
    category: "blur",
    fragmentShader: LENS_BLUR,
    defaultUniforms: { u_radius: 10.0, u_brightness: 0.2 },
    monetAliases: ["bokeh_blur", "depth_blur"],
  },
  {
    id: "tilt_shift",
    displayName: "Tilt-Shift",
    category: "blur",
    fragmentShader: TILT_SHIFT,
    defaultUniforms: { u_blur_radius: 15.0, u_gradient_radius: 0.4 },
    monetAliases: ["tilt_shift", "miniature"],
  },
  {
    id: "edges_gfx",
    displayName: "Edge Detection",
    category: "stylize",
    fragmentShader: EDGES_GFX,
    defaultUniforms: { u_strength: 1.0 },
    monetAliases: ["edge_detect", "sobel"],
  },
  {
    id: "ink_gfx",
    displayName: "Ink",
    category: "stylize",
    fragmentShader: INK_GFX,
    defaultUniforms: { u_strength: 0.25 },
    monetAliases: ["pen_sketch"],
  },
  {
    id: "emboss_gfx",
    displayName: "Emboss",
    category: "stylize",
    fragmentShader: EMBOSS_GFX,
    defaultUniforms: { u_strength: 1.0 },
    monetAliases: ["emboss", "relief"],
  },
  {
    id: "swirl_gfx",
    displayName: "Swirl",
    category: "distort",
    fragmentShader: SWIRL_GFX,
    defaultUniforms: { u_radius: 0.5, u_angle: 3.14 },
    monetAliases: ["swirl", "twist"],
  },
  {
    id: "bulge_pinch",
    displayName: "Bulge/Pinch",
    category: "distort",
    fragmentShader: BULGE_PINCH,
    defaultUniforms: { u_radius: 0.5, u_strength: 0.5 },
    monetAliases: ["bulge", "pinch", "fish_eye"],
  },
  {
    id: "noise_film",
    displayName: "Film Grain",
    category: "stylize",
    fragmentShader: NOISE_GFX,
    defaultUniforms: { u_amount: 0.15, u_time: 0.0 },
    monetAliases: ["film_grain", "grain"],
  },
  {
    id: "posterize_gfx",
    displayName: "Posterize",
    category: "stylize",
    fragmentShader: POSTERIZE_GFX,
    defaultUniforms: { u_levels: 4.0 },
    monetAliases: ["posterize"],
  },
  {
    id: "zoom_blur",
    displayName: "Zoom Blur",
    category: "blur",
    fragmentShader: ZOOM_BLUR_GFX,
    defaultUniforms: { u_strength: 0.5 },
    monetAliases: ["radial_blur"],
  },
  {
    id: "denoise_gfx",
    displayName: "Denoise",
    category: "blur",
    fragmentShader: DENOISE_GFX,
    defaultUniforms: { u_strength: 0.5 },
    monetAliases: ["denoise"],
  },
  {
    id: "color_halftone",
    displayName: "Color Halftone",
    category: "stylize",
    fragmentShader: COLOR_HALFTONE,
    defaultUniforms: { u_angle: 0.39, u_size: 4.0 },
    monetAliases: ["newspaper"],
  },
  {
    id: "dot_screen",
    displayName: "Dot Screen",
    category: "stylize",
    fragmentShader: DOT_SCREEN,
    defaultUniforms: { u_angle: 0.39, u_size: 4.0 },
    monetAliases: ["halftone_mono"],
  },
  {
    id: "shift_towards",
    displayName: "Color Shift",
    category: "color",
    fragmentShader: SHIFT_TOWARDS,
    defaultUniforms: { u_target: [1.0, 0.85, 0.7], u_amount: 0.3 },
    monetAliases: ["warm_shift", "cool_shift", "color_cast"],
  },
];
