// src/lib/renderer/webgl-grade-renderer.ts
// Compiled-once WebGL pipeline for color grading + vignette + chromatic.
// Used as a final filter pass over the Canvas2D output.

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_temperature;
uniform float u_vignette;
uniform float u_chromatic;
uniform vec2 u_resolution;
varying vec2 v_uv;

vec3 saturate(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

vec3 contrast(vec3 c, float k) {
  return (c - 0.5) * k + 0.5;
}

vec3 temperature(vec3 c, float t) {
  c.r += t * 0.10;
  c.b -= t * 0.10;
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec3 col;

  if (u_chromatic > 0.001) {
    float ca = u_chromatic * 0.008;
    col.r = texture2D(u_tex, uv + vec2(ca, 0.0)).r;
    col.g = texture2D(u_tex, uv).g;
    col.b = texture2D(u_tex, uv - vec2(ca, 0.0)).b;
  } else {
    col = texture2D(u_tex, uv).rgb;
  }

  col = saturate(col, u_saturation);
  col = contrast(col, u_contrast);
  col += vec3(u_brightness);
  col = temperature(col, u_temperature);

  if (u_vignette > 0.001) {
    float d = distance(uv, vec2(0.5));
    col *= 1.0 - smoothstep(0.35, 0.85, d) * u_vignette;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface GradeParams {
  saturation: number;
  contrast: number;
  brightness: number;
  temperature: number;
  vignette: number;
  chromatic: number;
}

export const GRADE_PRESETS: Record<string, GradeParams> = {
  raw:        { saturation: 1, contrast: 1, brightness: 0, temperature: 0, vignette: 0, chromatic: 0 },
  cinematic:  { saturation: 0.85, contrast: 1.18, brightness: -0.02, temperature: 0.05, vignette: 0.3, chromatic: 0 },
  vibrant:    { saturation: 1.45, contrast: 1.1, brightness: 0.03, temperature: 0.08, vignette: 0, chromatic: 0 },
  vintage:    { saturation: 0.78, contrast: 0.92, brightness: 0.05, temperature: 0.18, vignette: 0.4, chromatic: 0.2 },
  monochrome: { saturation: 0, contrast: 1.2, brightness: 0, temperature: 0, vignette: 0.25, chromatic: 0 },
  anime:      { saturation: 1.55, contrast: 1.3, brightness: 0.04, temperature: 0.03, vignette: 0, chromatic: 0 },
};

export class WebGLGradeRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("webgl", { premultipliedAlpha: false });
    if (!ctx) throw new Error("WebGL not supported");
    this.gl = ctx;
    this.init();
  }

  private init() {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERT);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Shader link failed: " + gl.getProgramInfoLog(prog));
    }
    this.program = prog;
    gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const uNames = [
      "u_tex",
      "u_saturation",
      "u_contrast",
      "u_brightness",
      "u_temperature",
      "u_vignette",
      "u_chromatic",
      "u_resolution",
    ];
    for (const n of uNames) {
      this.uniforms[n] = gl.getUniformLocation(prog, n);
    }
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

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /** Apply grade to a source canvas/video, output goes to this.canvas */
  apply(source: HTMLCanvasElement | HTMLVideoElement, params: GradeParams) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );

    gl.uniform1i(this.uniforms.u_tex, 0);
    gl.uniform1f(this.uniforms.u_saturation, params.saturation);
    gl.uniform1f(this.uniforms.u_contrast, params.contrast);
    gl.uniform1f(this.uniforms.u_brightness, params.brightness);
    gl.uniform1f(this.uniforms.u_temperature, params.temperature);
    gl.uniform1f(this.uniforms.u_vignette, params.vignette);
    gl.uniform1f(this.uniforms.u_chromatic, params.chromatic);
    gl.uniform2f(this.uniforms.u_resolution, this.canvas.width, this.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
  }
}
