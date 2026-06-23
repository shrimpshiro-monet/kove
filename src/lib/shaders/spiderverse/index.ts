// Spider-Verse shader bundle — loader + spec registry
// Drop these next to the .frag files

import halftoneFrag from "./halftone-benday.frag?raw";
import comicEdgesFrag from "./comic-ink-edges.frag?raw";
import frameStutterFrag from "./frame-stutter.frag?raw";
import chromaticGlitchFrag from "./chromatic-glitch.frag?raw";

export interface ShaderSpec {
  id: string;
  displayName: string;
  category: "stylize" | "distort" | "temporal";
  tier: "free" | "creator" | "pro";
  fragmentShader: string;
  requiresPrevFrame: boolean;
  requiresHeldFrame: boolean;
  defaultUniforms: Record<string, number | number[] | boolean | string>;
  monetDirectorAlias: string[];
}

export const SPIDERVERSE_SHADERS: ShaderSpec[] = [
  {
    id: "halftone",
    displayName: "Halftone Ben-Day",
    category: "stylize",
    tier: "free",
    fragmentShader: halftoneFrag,
    requiresPrevFrame: false,
    requiresHeldFrame: false,
    defaultUniforms: {
      u_dotSize: 6.0,
      u_angle: 22.5,
      u_intensity: 0.85,
      u_dotColor: [0.0, 0.0, 0.0],
      u_paperColor: [1.0, 1.0, 1.0],
      u_contrast: 1.4,
      u_animateDots: false,
      u_animationSpeed: 2.0,
      u_colorMode: 1,
    },
    monetDirectorAlias: ["comic", "dots", "print", "newspaper", "benday", "halftone"],
  },
  {
    id: "comic_edges",
    displayName: "Comic Ink Lines",
    category: "stylize",
    tier: "free",
    fragmentShader: comicEdgesFrag,
    requiresPrevFrame: true,
    requiresHeldFrame: false,
    defaultUniforms: {
      u_edgeThreshold: 0.15,
      u_lineWeight: 2.5,
      u_motionModulation: 1.8,
      u_inkColor: [0.05, 0.05, 0.08],
      u_inkOpacity: 0.9,
      u_showOriginal: true,
      u_edgeDarken: 0.2,
      u_edgeStyle: 0,
      u_jitterAmount: 0.002,
      u_temporalSmoothing: 0.3,
    },
    monetDirectorAlias: ["ink", "edges", "outline", "drawn", "sketch", "cartoon_outline"],
  },
  {
    id: "frame_stutter",
    displayName: "Anime Timing",
    category: "temporal",
    tier: "free",
    fragmentShader: frameStutterFrag,
    requiresPrevFrame: false,
    requiresHeldFrame: true,
    defaultUniforms: {
      u_fps: 30.0,
      u_animTiming: 2,
      u_customInterval: 4.0,
      u_blendFrames: 0.0,
      u_jitterChance: 0.05,
      u_phaseOffset: 0,
    },
    monetDirectorAlias: ["stutter", "anime_timing", "on_2s", "stop_motion", "limited"],
  },
  {
    id: "chromatic_glitch",
    displayName: "Chromatic Glitch v2",
    category: "distort",
    tier: "free",
    fragmentShader: chromaticGlitchFrag,
    requiresPrevFrame: false,
    requiresHeldFrame: false,
    defaultUniforms: {
      u_intensity: 0.7,
      u_channelOffset: 12.0,
      u_aberrationAngle: 0.0,
      u_temporalVariance: true,
      u_pulseSpeed: 4.0,
      u_edgeGlow: 0.6,
      u_tintColor: [1.0, 1.0, 1.0],
      u_addGlitchArtifacts: true,
      u_glitchProbability: 0.15,
      u_scanlineIntensity: 0.08,
      u_directionalAberration: true,
    },
    monetDirectorAlias: ["glitch", "rgb_split", "chromatic_aberration", "digital_corruption", "cyberpunk"],
  },
];

export const getShaderSpec = (id: string): ShaderSpec | null =>
  SPIDERVERSE_SHADERS.find((s) => s.id === id) ?? null;
