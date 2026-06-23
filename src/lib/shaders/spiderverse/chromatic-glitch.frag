// Chromatic Aberration + Digital Glitch — TikTok-grade
// NORMALIZED: intensity range now 0..1 (router-compatible)
// Internal multiplier (1.5x) bakes in the aggressive default

precision highp float;

uniform sampler2D u_texture;
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_intensity;            // 0..1, internally multiplied for punch
uniform float u_channelOffset;
uniform float u_aberrationAngle;
uniform bool  u_temporalVariance;
uniform float u_pulseSpeed;
uniform float u_edgeGlow;
uniform vec3  u_tintColor;
uniform bool  u_addGlitchArtifacts;
uniform float u_glitchProbability;
uniform float u_scanlineIntensity;
uniform bool  u_directionalAberration;

varying vec2 v_uv;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = v_uv;
    vec4 src = texture2D(u_texture, uv);

    // INTERNAL BOOST: 1.5x makes 0.7 input feel like 1.05 to the user
    float dynIntensity = u_intensity * 1.5;
    if (u_temporalVariance) {
        float pulse = sin(u_time * u_pulseSpeed * 6.28318) * 0.5 + 0.5;
        float spike = pow(random(vec2(u_time * 0.1)), 3.0);
        dynIntensity *= (0.7 + pulse * 0.3 + spike * 0.5);
    }
    dynIntensity = clamp(dynIntensity, 0.0, 2.0);

    if (dynIntensity < 0.01) {
        gl_FragColor = src;
        return;
    }

    float rad = radians(u_aberrationAngle);
    vec2 dir = vec2(cos(rad), sin(rad));
    float mag = u_channelOffset * dynIntensity * (1.0 / u_resolution.x);

    vec2 redOff = dir * mag * (u_directionalAberration ? 1.0 : 0.5);
    vec2 blueOff = dir * mag * (u_directionalAberration ? -1.0 : -0.5);

    float r = texture2D(u_texture, uv + redOff).r;
    float g = texture2D(u_texture, uv).g;
    float b = texture2D(u_texture, uv + blueOff).b;

    vec3 col = vec3(r, g, b);

    if (u_edgeGlow > 0.0) {
        vec2 texelSize = 1.0 / u_resolution;
        float h = length(col - texture2D(u_texture, uv + vec2(texelSize.x, 0.0)).rgb);
        float v = length(col - texture2D(u_texture, uv + vec2(0.0, texelSize.y)).rgb);
        float edge = clamp((h + v) * 4.0, 0.0, 1.0);
        vec3 glowColor = mix(vec3(1.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), edge);
        col += glowColor * edge * u_edgeGlow * dynIntensity;
    }

    if (u_addGlitchArtifacts && random(vec2(u_time * 0.01, 0.0)) < u_glitchProbability) {
        float sliceY = random(vec2(u_time, uv.y)) * uv.y;
        float sliceH = 0.01 + random(vec2(u_time * 2.0)) * 0.05;
        float xOff = (random(vec2(u_time * 3.0)) - 0.5) * 0.1 * dynIntensity;
        if (uv.y > sliceY && uv.y < sliceY + sliceH) {
            col = texture2D(u_texture, uv + vec2(xOff, 0.0)).rgb;
            col.r = texture2D(u_texture, uv + vec2(xOff * 2.0, 0.0)).r;
            col.b = texture2D(u_texture, uv + vec2(xOff * -1.5, 0.0)).b;
        }
    }

    if (u_scanlineIntensity > 0.0) {
        float scan = sin(uv.y * u_resolution.y * 2.0) * 0.5 + 0.5;
        col *= (1.0 - u_scanlineIntensity + scan * u_scanlineIntensity);
    }

    col *= u_tintColor;

    float mixAmount = clamp(dynIntensity, 0.0, 1.0);
    vec3 finalColor = mix(src.rgb, col, mixAmount);
    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, src.a);
}
