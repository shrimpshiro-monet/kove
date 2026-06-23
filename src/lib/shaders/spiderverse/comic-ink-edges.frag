// Comic Ink Edges — Sobel + motion-modulated line weight
// FIXED: null check, luminance helper added, debug code removed

precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_prevTexture;
uniform bool      u_hasPrevTexture;     // NEW: replaces null check
uniform vec2      u_resolution;
uniform float     u_time;
uniform float     u_edgeThreshold;
uniform float     u_lineWeight;
uniform float     u_motionModulation;
uniform vec3      u_inkColor;
uniform float     u_inkOpacity;
uniform bool      u_showOriginal;
uniform float     u_edgeDarken;
uniform int       u_edgeStyle;
uniform float     u_jitterAmount;
uniform float     u_temporalSmoothing;

varying vec2 v_uv;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

float sobel(vec2 uv, float offset) {
    float sx = offset / u_resolution.x;
    float sy = offset / u_resolution.y;

    float tl = luminance(texture2D(u_texture, uv + vec2(-sx, -sy)).rgb);
    float t  = luminance(texture2D(u_texture, uv + vec2(0.0, -sy)).rgb);
    float tr = luminance(texture2D(u_texture, uv + vec2( sx, -sy)).rgb);
    float l  = luminance(texture2D(u_texture, uv + vec2(-sx, 0.0)).rgb);
    float r  = luminance(texture2D(u_texture, uv + vec2( sx, 0.0)).rgb);
    float bl = luminance(texture2D(u_texture, uv + vec2(-sx,  sy)).rgb);
    float b  = luminance(texture2D(u_texture, uv + vec2(0.0,  sy)).rgb);
    float br = luminance(texture2D(u_texture, uv + vec2( sx,  sy)).rgb);

    float gx = -tl + tr - 2.0 * l + 2.0 * r - bl + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    return sqrt(gx * gx + gy * gy);
}

float calculateMotion(vec2 uv) {
    if (!u_hasPrevTexture) return 0.0;
    vec3 current = texture2D(u_texture, uv).rgb;
    vec3 previous = texture2D(u_prevTexture, uv).rgb;
    float diff = distance(current, previous);
    return smoothstep(0.02, 0.2, diff);
}

void main() {
    vec2 uv = v_uv;
    vec4 src = texture2D(u_texture, uv);

    float edgeStrength = sobel(uv, 1.0);
    float edgeMask = smoothstep(u_edgeThreshold, u_edgeThreshold + 0.1, edgeStrength);

    float motion = calculateMotion(uv);
    float dynamicLineWeight = u_lineWeight * (1.0 + motion * u_motionModulation);

    if (u_edgeStyle == 1) {
        vec2 jitteredUV = uv + (random(uv + u_time) - 0.5) * u_jitterAmount;
        float jitteredEdge = sobel(jitteredUV, dynamicLineWeight);
        edgeMask = max(edgeMask, smoothstep(u_edgeThreshold, u_edgeThreshold + 0.15, jitteredEdge));
    } else if (u_edgeStyle == 2) {
        float brushNoise = random(uv * 10.0 + u_time * 0.1);
        dynamicLineWeight *= (0.7 + brushNoise * 0.6);
    }

    if (dynamicLineWeight > 1.5) {
        float wideEdge = sobel(uv, dynamicLineWeight);
        edgeMask = max(edgeMask, smoothstep(u_edgeThreshold * 0.8, u_edgeThreshold + 0.12, wideEdge));
    }

    if (u_temporalSmoothing > 0.0) {
        edgeMask = mix(edgeMask, edgeMask * 0.95 + 0.025, u_temporalSmoothing);
    }

    vec3 edgeColor = u_inkColor * u_inkOpacity;
    vec3 finalColor;

    if (u_showOriginal) {
        vec3 darkened = src.rgb * (1.0 - u_edgeDarken);
        finalColor = mix(darkened, edgeColor, edgeMask);
    } else {
        finalColor = mix(vec3(1.0), edgeColor, edgeMask);
    }

    gl_FragColor = vec4(finalColor, src.a);
}
