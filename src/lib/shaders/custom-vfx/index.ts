/**
 * Custom VFX shaders matched to reference edit videos.
 * Each shader captures the visual DNA of a specific reference style.
 *
 * Reference sources:
 * - SPIDERMAN (IMPORTANT).MP4 — comic halftone + ink edges
 * - steph curry.MP4 — sports speed trails + impact
 * - tyler_the_creator.MP4 — vibrant color pop + warm glow
 * - lewis hamilton.MP4 — F1 racing motion streaks
 * - harvey.MP4 — cool cinematic basketball
 * - new york living the moment.MP4 — lifestyle fast cuts
 * - valentino rossi.MP4 — extreme fast racing energy
 */

export interface CustomVFXSpec {
  id: string;
  displayName: string;
  category: "comic" | "sports" | "music" | "racing" | "cinematic" | "lifestyle";
  fragmentShader: string;
  defaultUniforms: Record<string, number>;
  monetAliases: string[];
  referenceVideo: string;
}

// ─── SPIDER-VERSE HALFTONE + INK ──────────────────────────────
// Based on: SPIDERMAN (IMPORTANT).MP4 — 47s, 34 cuts, dark blue 23% bright, 49% sat
const SPIDERVERSE_HALFTONE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_uv;

float halftone(vec2 uv, float angle, float size) {
  float s = sin(angle), c = cos(angle);
  vec2 tex = uv * u_resolution * 0.5;
  vec2 point = vec2(c * tex.x - s * tex.y, s * tex.x + c * tex.y) * size;
  return (sin(point.x) * sin(point.y)) * 0.5 + 0.5;
}

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  
  // Convert to CMYK-like decomposition
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  
  // Halftone dot pattern (Ben-Day dots)
  float ht = halftone(v_uv, 0.785, 6.0 + u_intensity * 4.0);
  
  // Ink edge detection
  vec2 px = 1.0 / u_resolution;
  float edge = length(texture2D(u_texture, v_uv + vec2(px.x, 0.0)).rgb -
                       texture2D(u_texture, v_uv - vec2(px.x, 0.0)).rgb);
  edge += length(texture2D(u_texture, v_uv + vec2(0.0, px.y)).rgb -
                  texture2D(u_texture, v_uv - vec2(0.0, px.y)).rgb);
  edge = smoothstep(0.1, 0.4, edge);
  
  // Desaturate slightly for comic look
  col = mix(col, vec3(gray), 0.3 * u_intensity);
  
  // Apply halftone dots
  col *= mix(1.0, ht, 0.6 * u_intensity);
  
  // Darken edges for ink effect
  col *= mix(1.0, 1.0 - edge * 0.8, u_intensity);
  
  // Push toward dark blue for Spider-Verse look
  col.b += 0.05 * u_intensity;
  col.r -= 0.02 * u_intensity;
  
  gl_FragColor = vec4(col, 1.0);
}`;

// ─── SPORTS SPEED TRAIL ───────────────────────────────────────
// Based on: steph curry.MP4 — 19s, 27 cuts, dark cool 21% bright
const SPORTS_SPEED_TRAIL = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  
  // Motion blur trail in dominant motion direction
  vec2 center = vec2(0.5, 0.5);
  vec2 dir = normalize(v_uv - center);
  
  vec4 trail = vec4(0.0);
  float total = 0.0;
  
  for (float i = 0.0; i < 8.0; i++) {
    float offset = i * 0.003 * u_intensity;
    vec2 sampleUV = v_uv + dir * offset;
    float weight = 1.0 - i / 8.0;
    trail += texture2D(u_texture, sampleUV) * weight;
    total += weight;
  }
  trail /= total;
  
  // Mix original with trail
  col = mix(col, trail.rgb, 0.4 * u_intensity);
  
  // Boost contrast for sports energy
  col = (col - 0.5) * (1.0 + 0.2 * u_intensity) + 0.5;
  
  // Slight vignette for arena feel
  float vig = smoothstep(0.8, 0.3, length(v_uv - 0.5));
  col *= mix(1.0, vig, 0.3 * u_intensity);
  
  gl_FragColor = vec4(col, 1.0);
}`;

// ─── TYLER THE CREATOR VIBRANT POP ───────────────────────────
// Based on: tyler_the_creator.MP4 — 56s, 32 cuts, vibrant warm 62% sat
const TYLER_VIBRANT_POP = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  
  // Boost saturation heavily (Tyler's signature)
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  float satBoost = 1.0 + 0.8 * u_intensity;
  col = mix(vec3(gray), col, satBoost);
  
  // Warm shift — push toward orange/gold
  col.r += 0.08 * u_intensity;
  col.g += 0.03 * u_intensity;
  col.b -= 0.05 * u_intensity;
  
  // Punch contrast
  col = (col - 0.5) * (1.0 + 0.25 * u_intensity) + 0.5;
  
  // Bloom/glow on highlights
  float brightness = max(col.r, max(col.g, col.b));
  if (brightness > 0.7) {
    col += (col - 0.7) * 0.3 * u_intensity;
  }
  
  // Soft vignette
  float vig = smoothstep(0.7, 0.3, length(v_uv - 0.5));
  col *= mix(1.0, vig, 0.2 * u_intensity);
  
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ─── F1 RACING MOTION STREAK ──────────────────────────────────
// Based on: lewis hamilton.MP4 — 21s, 68 cuts, neutral 42% bright
//           valentino rossi.MP4 — 28s, 102 cuts, bright warm 55% bright
const RACING_MOTION_STREAK = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  
  // Horizontal motion streak (racing direction)
  vec4 streak = vec4(0.0);
  float total = 0.0;
  
  for (float i = -6.0; i <= 6.0; i += 1.0) {
    float offset = i * 0.004 * u_intensity;
    vec2 sampleUV = v_uv + vec2(offset, 0.0);
    float weight = 1.0 - abs(i) / 6.0;
    streak += texture2D(u_texture, sampleUV) * weight;
    total += weight;
  }
  streak /= total;
  
  // Blend with original
  col = mix(col, streak.rgb, 0.5 * u_intensity);
  
  // Speed lines — thin horizontal streaks
  float speedLine = sin(v_uv.y * u_resolution.y * 0.5 + u_time * 10.0) * 0.5 + 0.5;
  speedLine = smoothstep(0.4, 0.6, speedLine) * 0.15 * u_intensity;
  col += vec3(speedLine);
  
  // Warm tint for racing energy
  col.r += 0.03 * u_intensity;
  col.g += 0.01 * u_intensity;
  
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ─── DARK MOODY CINEMATIC ────────────────────────────────────
// Based on: harvey.MP4 — 74s, 66 cuts, cool blue 36% bright, 13% sat
const DARK_MOODY_CINEMATIC = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  
  // Desaturate for moody look
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(gray), 0.4 * u_intensity);
  
  // Cool blue shift
  col.b += 0.06 * u_intensity;
  col.r -= 0.03 * u_intensity;
  col.g -= 0.01 * u_intensity;
  
  // Crush blacks slightly
  col = pow(col, vec3(1.0 + 0.15 * u_intensity));
  
  // Deep vignette
  float vig = smoothstep(0.6, 0.2, length(v_uv - 0.5));
  col *= mix(1.0, vig, 0.5 * u_intensity);
  
  // Subtle film grain
  float grain = fract(sin(dot(v_uv * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.04 * u_intensity;
  
  gl_FragColor = vec4(col, 1.0);
}`;

// ─── LIFESTYLE FAST CUTS GLITCH ───────────────────────────────
// Based on: new york living the moment.MP4 — 19s, 67 cuts, warm 41% bright
const LIFESTYLE_GLITCH = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform vec2 u_resolution;
varying vec2 v_uv;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  
  // RGB split (chromatic aberration)
  float splitAmt = 0.003 * u_intensity;
  float r = texture2D(u_texture, uv + vec2(splitAmt, 0.0)).r;
  float g = texture2D(u_texture, uv).g;
  float b = texture2D(u_texture, uv - vec2(splitAmt, 0.0)).b;
  vec3 col = vec3(r, g, b);
  
  // Random glitch blocks
  float blockY = floor(uv.y * 20.0);
  float glitchRand = rand(vec2(blockY, floor(u_time * 8.0)));
  if (glitchRand > 0.92) {
    uv.x += (rand(vec2(blockY, u_time)) - 0.5) * 0.05 * u_intensity;
    col = texture2D(u_texture, uv).rgb;
  }
  
  // Warm tint for NYC lifestyle feel
  col.r += 0.04 * u_intensity;
  col.g += 0.02 * u_intensity;
  
  // Boost contrast
  col = (col - 0.5) * (1.0 + 0.15 * u_intensity) + 0.5;
  
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ─── TIKTOK ENERGY PULSE ──────────────────────────────────────
// Based on: various TikTok edits — fast cuts, high energy, vibrant
const TIKTOK_ENERGY_PULSE = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
varying vec2 v_uv;

void main() {
  vec3 col = texture2D(u_texture, v_uv).rgb;
  
  // Energy pulse — radial brightness wave
  float dist = length(v_uv - 0.5);
  float pulse = sin(dist * 20.0 - u_time * 8.0) * 0.5 + 0.5;
  pulse = pow(pulse, 3.0) * u_intensity;
  
  col += vec3(pulse * 0.15);
  
  // Boost saturation
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(gray), col, 1.0 + 0.4 * u_intensity);
  
  // Punch contrast
  col = (col - 0.5) * (1.0 + 0.3 * u_intensity) + 0.5;
  
  // Tight vignette
  float vig = smoothstep(0.5, 0.2, dist);
  col *= mix(1.0, vig, 0.25 * u_intensity);
  
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const CUSTOM_VFX_SHADERS: CustomVFXSpec[] = [
  {
    id: "spiderverse_halftone",
    displayName: "Spider-Verse Halftone",
    category: "comic",
    fragmentShader: SPIDERVERSE_HALFTONE,
    defaultUniforms: { u_intensity: 0.6, u_time: 0.0 },
    monetAliases: ["spiderverse", "comic_dots", "ben_day", "halftone_pro"],
    referenceVideo: "monet-reference-edits/SPIDERMAN (IMPORTANT).MP4",
  },
  {
    id: "sports_speed_trail",
    displayName: "Sports Speed Trail",
    category: "sports",
    fragmentShader: SPORTS_SPEED_TRAIL,
    defaultUniforms: { u_intensity: 0.5, u_time: 0.0 },
    monetAliases: ["speed_trail", "motion_blur_pro", "sports_energy"],
    referenceVideo: "reference-edits-2/steph curry.MP4",
  },
  {
    id: "tyler_vibrant_pop",
    displayName: "Tyler Vibrant Pop",
    category: "music",
    fragmentShader: TYLER_VIBRANT_POP,
    defaultUniforms: { u_intensity: 0.6, u_time: 0.0 },
    monetAliases: ["vibrant_pop", "color_pop", "warm_vibrant"],
    referenceVideo: "reference-edits-2/tyler_the_creator.MP4",
  },
  {
    id: "racing_motion_streak",
    displayName: "Racing Motion Streak",
    category: "racing",
    fragmentShader: RACING_MOTION_STREAK,
    defaultUniforms: { u_intensity: 0.6, u_time: 0.0 },
    monetAliases: ["racing_streak", "speed_lines", "f1_energy"],
    referenceVideo: "reference-edits-2/lewis hamilton.MP4",
  },
  {
    id: "dark_moody_cinematic",
    displayName: "Dark Moody Cinematic",
    category: "cinematic",
    fragmentShader: DARK_MOODY_CINEMATIC,
    defaultUniforms: { u_intensity: 0.5, u_time: 0.0 },
    monetAliases: ["dark_moody", "moody_basketball", "cool_cinematic"],
    referenceVideo: "reference-edits-2/harvey.MP4",
  },
  {
    id: "lifestyle_glitch",
    displayName: "Lifestyle Glitch",
    category: "lifestyle",
    fragmentShader: LIFESTYLE_GLITCH,
    defaultUniforms: { u_intensity: 0.5, u_time: 0.0 },
    monetAliases: ["nyc_glitch", "city_energy", "lifestyle_fast"],
    referenceVideo: "reference-edits-2/new york living the moment.MP4",
  },
  {
    id: "tiktok_energy_pulse",
    displayName: "TikTok Energy Pulse",
    category: "sports",
    fragmentShader: TIKTOK_ENERGY_PULSE,
    defaultUniforms: { u_intensity: 0.5, u_time: 0.0 },
    monetAliases: ["tiktok_energy", "pulse", "viral_energy"],
    referenceVideo: "reference-edits-2/v26044gc0000d7s94ivog65r9lu88r30.MP4",
  },
];
