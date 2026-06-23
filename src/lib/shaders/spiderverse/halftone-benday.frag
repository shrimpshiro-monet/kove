// Halftone Ben-Day Dots — Spider-Verse signature
// Production-ready. WebGL 1.0 compatible (no GLSL ES 3.0 features used).

precision highp float;

uniform sampler2D u_texture;
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_dotSize;
uniform float u_angle;
uniform float u_intensity;
uniform vec3  u_dotColor;
uniform vec3  u_paperColor;
uniform float u_contrast;
uniform bool  u_animateDots;
uniform float u_animationSpeed;
uniform int   u_colorMode;

varying vec2 v_uv;

mat2 rotate2d(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 uv = v_uv;
    vec4 src = texture2D(u_texture, uv);

    if (u_intensity < 0.01) {
        gl_FragColor = src;
        return;
    }

    vec2 pixelCoords = uv * u_resolution;
    vec2 rotated = rotate2d(radians(u_angle)) * pixelCoords;

    float gridSize = u_dotSize * 2.0;
    vec2 gridPos = mod(rotated, gridSize);
    vec2 gridCenter = vec2(gridSize * 0.5);
    float dist = length(gridPos - gridCenter);

    float dotSize = u_dotSize;
    if (u_animateDots) {
        float pulse = sin(u_time * u_animationSpeed * 6.28318) * 0.5 + 0.5;
        dotSize = mix(u_dotSize * 0.7, u_dotSize * 1.3, pulse);
    }

    float brightness = pow(luminance(src.rgb), 1.0 / u_contrast);
    float maxRadius = dotSize * 0.5;
    float dotRadius = maxRadius * (1.0 - brightness);

    float alpha = smoothstep(dotRadius, dotRadius + 1.0, dist);

    vec3 finalColor;
    if (u_colorMode == 0) {
        finalColor = mix(u_dotColor, u_paperColor, alpha);
    } else if (u_colorMode == 1) {
        vec3 tintedInk = mix(u_dotColor, src.rgb, 0.3);
        finalColor = mix(tintedInk, u_paperColor, alpha);
    } else {
        vec3 coloredInk = src.rgb * u_dotColor;
        finalColor = mix(coloredInk, u_paperColor, alpha);
    }

    gl_FragColor = vec4(mix(src.rgb, finalColor, u_intensity), src.a);
}
