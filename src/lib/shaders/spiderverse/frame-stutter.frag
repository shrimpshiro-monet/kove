// Frame Rate Quantization — animate on 2s/3s
// FIXED: removed the broken double-buffer simulation; renderer manages buffer swap

precision highp float;

uniform sampler2D u_texture;        // live frame
uniform sampler2D u_heldTexture;    // last "held" frame, swapped by renderer
uniform bool      u_hasHeldTexture; // false on first frame
uniform vec2      u_resolution;
uniform float     u_time;
uniform float     u_fps;
uniform int       u_animTiming;
uniform float     u_customInterval;
uniform float     u_blendFrames;
uniform float     u_jitterChance;
uniform int       u_phaseOffset;

varying vec2 v_uv;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_uv;
    vec4 live = texture2D(u_texture, uv);

    if (!u_hasHeldTexture) {
        gl_FragColor = live;
        return;
    }

    float projectFrame = u_time * u_fps;
    float holdMult = (u_animTiming == 4) ? u_customInterval : float(u_animTiming);

    float adjusted = projectFrame - float(u_phaseOffset);
    float cyclePos = fract(adjusted / holdMult);

    // jitter — occasional irregular hold
    if (u_jitterChance > 0.0) {
        float seed = floor(u_time * 10.0);
        float r = fract(sin(seed) * 43758.5453);
        if (r < u_jitterChance) {
            cyclePos = min(0.99, cyclePos + (1.0 / holdMult));
        }
    }

    vec4 held = texture2D(u_heldTexture, uv);

    if (u_blendFrames > 0.0) {
        float blend = smoothstep(0.95 - u_blendFrames, 0.95, cyclePos);
        gl_FragColor = mix(held, live, blend);
    } else {
        gl_FragColor = (cyclePos < 0.95) ? held : live;
    }
}
