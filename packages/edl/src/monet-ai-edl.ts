export interface EditDNA {
  cutDensity: number; // 0-1, how frequently cuts happen
  motionAggression: number; // 0-1, camera motion intensity
  transitionRhythm: "mechanical" | "syncopated" | "organic" | "chaotic";
  emotionalCadence: "rising" | "falling" | "wave" | "plateau";
  visualChaos: number; // 0-1, compositional variety
  colorTemperature: "cool" | "warm" | "mixed";
  effectIntensity: number; // 0-1, how heavy effects are
  beatAlignmentStrictness: number; // 0-1, how tightly synced to music
}

export interface Act {
  name: string;
  startTime: number;
  duration: number;
  energy: number;
  mood: string;
}

export interface CharacterFocus {
  name: string;
  prominence: number;
  emotionalArc?: string;
}

export interface SegmentRef {
  clipId: string;
  inPoint: number;
  outPoint: number;
  reason?: string;
}

export interface EditIntent {
  version: string;
  goal: { primary: string; secondary?: string[] };
  targetAudience: { platform: "tiktok" | "youtube" | "instagram" | "twitter" | "general"; demographics?: string };
  style: { genre: string; pacing: "slow" | "medium" | "fast" | "aggressive" | "varied"; mood: string[]; referenceStyle?: string };
  structure: { duration: number; acts?: Act[]; energyCurve: number[]; climaxPoint?: number };
  technical: { syncToBeat: boolean; beatSyncStrength?: number; avgShotDuration?: number; transitionStyle: "cut" | "smooth" | "dynamic" | "aggressive" | "mixed"; colorTreatment: "vibrant" | "cinematic" | "vintage" | "raw" | "anime" | "monochrome"; effectsIntensity: number };
  contentPreferences: { focusOn?: string[]; avoid?: string[]; characters?: CharacterFocus[] };
  constraints?: { mustInclude?: SegmentRef[]; mustAvoid?: string[]; maxComplexity?: "simple" | "medium" | "complex" };
  tempoMode?: "beat_locked" | "beat_anticipated" | "narrative" | "cinematic" | "chill_vlog" | "reference_mirror";
  forbidBeatSync?: boolean;
}

export interface MotionTrackKeyframe {
  time: number; // Seconds in source clip time
  x: number; // -1..1 normalized
  y: number; // -1..1 normalized
  scale?: number;
  rotation?: number;
  confidence?: number; // 0..1
}

export interface MotionTrack {
  id: string;
  clipId: string;
  method: "feature" | "face" | "object";
  keyframes: MotionTrackKeyframe[];
}

export interface PlanarCorner {
  x: number; // -1..1 normalized
  y: number; // -1..1 normalized
}

export interface PlanarTrackKeyframe {
  time: number; // Seconds in source clip time
  corners: [PlanarCorner, PlanarCorner, PlanarCorner, PlanarCorner]; // TL, TR, BR, BL
  confidence?: number;
}

export interface PlanarTrack {
  id: string;
  clipId: string;
  keyframes: PlanarTrackKeyframe[];
}

export interface MaskAsset {
  id: string;
  clipId: string;
  startTime: number; // Start in source clip
  duration: number;
  subject: string; // The thing being masked (e.g., "person", "car")
  maskUrl?: string; // URL to the generated binary mask/video
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number; // Main timeline seconds
  endTime: number; // Main timeline seconds
  offset?: { x: number; y: number }; // -1..1 normalized offset
  style?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    weight?: string;
    shadow?: boolean;
    alignment?: "left" | "center" | "right";
    letterSpacing?: number;
    lineHeight?: number;
  };
  animation?: {
    inType: "pop" | "fade" | "slide" | "glitch";
    outType: "pop" | "fade" | "slide" | "glitch";
    duration: number;
    easing: EasingType;
  };
  tracking?: {
    trackId: string;
    mode: "follow" | "behind_subject" | "planar";
  };
}

export type EasingType =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bezier"
  | "elastic"
  | "bounce";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "add"
  | "subtract";

export interface Keyframe<T> {
  time: number; // Seconds within the shot
  value: T;
  easing?: EasingType;
}

export type Keyframeable<T> = T | Keyframe<T>[];

/**
 * A single shot in the timeline
 */
export interface Shot {
  id: string;
  name?: string;
  zIndex?: number;
  meta?: Record<string, unknown>;

  source: {
    clipId: string; // Media item ID
    inPoint: number; // Trim start (seconds into source)
    outPoint: number; // Trim end
    motionDir?: string; // "left"|"right"|"up"|"down"|"none"
    hasVelocityRamp?: boolean; // Perception-detected velocity U-curve
    semantic?: string[]; // Semantic tags from perception
    faceCentered?: boolean; // Face detection flag
    motion?: number; // Motion energy 0-1
  };

  timing: {
    startTime: number; // Position on main timeline
    duration: number; // Duration on timeline
    speed?: number; // 1.0 = normal, 0.5 = slow-mo, 2.0 = fast
    speedRamp?: {
      startSpeed: number;
      endSpeed: number;
      easing: EasingType;
    };
    beatLocked?: boolean; // Set by onset-aware beat snapping
  };

  sectionRole?: string; // e.g. "setup_start", "montage_peak"
  isHero?: boolean; // True for hero/section-start shots
  holdForImpact?: boolean; // Preserve intentional duration outlier

  transform?: {
    position?: Keyframeable<{ x: number; y: number }>; // -1 to 1 (normalized)
    scale?: Keyframeable<number>; // 1.0 = 100%
    rotation?: Keyframeable<number>; // Degrees
    opacity?: Keyframeable<number>; // 0-1
    anchorPoint?: { x: number; y: number }; // 0-1
    crop?: { top: number; bottom: number; left: number; right: number }; // 0-1
  };

  compositing?: {
    blendMode?: BlendMode;
    maskId?: string;
    motionBlur?: {
      samples: number;
      shutterAngle: number;
    };
  };

  effects?: Effect[];

  transition?: {
    type: TransitionType;
    duration: number; // Seconds
    easing?: EasingType;
  };

  beatLock?: {
    beatIndex: number; // Which beat to align to
    lockMode: "start" | "end" | "center"; // Where to align
  };

  aiRationale?: string; // Why AI chose this shot (transparency)
}

/**
 * Visual effect applied to a shot
 */
export interface Effect {
  id: string; // Stable ID for interactive editing
  type: EffectType;
  intensity: number; // 0-1
  startTime?: number; // Effect start within shot (seconds)
  duration?: number; // Effect duration (if not full shot)
  params?: Record<string, number>; // Effect-specific params
}

// Effect types (MVP subset)
export type EffectType =
  | "blur"
  | "gaussianBlur"
  | "brightness"
  | "contrast"
  | "saturation"
  | "glow"
  | "shake"
  | "impact_flash"
  | "speed_ramp"
  | "context_shake"
  | "push_in"
  | "color_pulse"
  | "zoom_pulse"
  | "zoomPulse"
  | "zoom-pulse"
  | "directional_blur"
  | "directionalBlur"
  | "directional-blur"
  | "rgb_split"
  | "rgbSplit"
  | "rgb-split"
  | "radial_zoom_blur"
  | "radialZoomBlur"
  | "radial-zoom-blur"
  | "particles"
  | "chromatic_aberration"
  | "chromaticAberration"
  | "chromatic-aberration"
  | "scanlines"
  | "displacement_map"
  | "waveform"
  | "glitch"
  | "color_shift"
  | "colorShift"
  | "color-shift"
  | "facial_blur"
  | "facialBlur"
  | "facial-blur"
  | "subject_blur"
  | "subject-blur"
  | "background_blur"
  | "background-blur"
  | "depth_parallax"
  | "depthParallax"
  | "depth-parallax"
  | "motion_blur"
  | "motionBlur"
  | "motion-blur"
  | "camera-blur"
  | "camera_blur"
  | "cameraBlur"
  | "gaussian-blur"
  | "sharpen"
  | "unsharp-mask"
  | "unsharp_mask"
  | "unsharpMask"
  | "reduce-interlace-flicker"
  | "reduce_interlace_flicker"
  | "reduceInterlaceFlicker"
  | "invert"
  | "echo"
  | "posterize_time"
  | "posterize-time"
  | "posterizeTime"
  | "corner_pin"
  | "cornerPin"
  | "corner-pin"
  | "lens_distortion"
  | "lensDistortion"
  | "lens-distortion"
  | "magnify"
  | "mirror"
  | "alpha_glow"
  | "alphaGlow"
  | "alpha-glow"
  | "brush_strokes"
  | "brushStrokes"
  | "brush-strokes"
  | "color_emboss"
  | "colorEmboss"
  | "color-emboss"
  | "find_edges"
  | "findEdges"
  | "find-edges"
  | "mosaic"
  | "posterize"
  | "replicate"
  | "roughen_edges"
  | "roughenEdges"
  | "roughen-edges"
  | "strobe_light"
  | "strobeLight"
  | "strobe-light"
  | "color_grade";

export type TransitionType =
  | "cut"
  | "crossfade"
  | "dissolve"
  | "whip-pan"
  | "whip_pan"
  | "zoom-blur"
  | "glitch"
  | "flash"
  | "dip_black"
  | "slide"
  | "radial_wipe"
  | "clock_wipe"
  | "linear_wipe"
  | "gradient_wipe"
  | "barn_doors"
  | "morph"
  | "iris"
  | "pinwheel"
  | "film_burn"
  | "spin"
  | "blur"
  | "pixelate"
  | "flash_frame"
  | "flash_white"
  | "morph_cut"
  | "push"
  | "cube"
  | "ripple"
  | "swirl"
  | "dreamy"
  | "wind"
  | "mosaic"
  | "radial"
  | "doorway"
  | "heart"
  | "kaleidoscope";

export type ColorGradePreset =
  | "cinematic"
  | "vibrant"
  | "vintage"
  | "monochrome"
  | "anime"
  | "raw"
  | "cool_desaturated"
  | "warm_dark"
  | "vivid_red"
  | "neutral_desaturated"
  | "bright_warm"
  | "vibrant_warm"
  | "hyper_neon"
  | "cool_dark"
  | "warm_cinematic"
  | "desaturated_natural";

/**
 * Complete edit timeline
 * This is what Gemini generates after analyzing footage + music
 */
export interface MonetEDL {
  version: string; // "1.0.0"

  metadata: {
    title: string;
    createdAt: number;
    aiModel: string; // "gemini-2.5-flash"
    prompt: string; // User's original request
    intentId: string; // Reference to EditIntent
    analysisId: string; // Reference to AnalysisResult
    projectId?: string; // The project/thread this belongs to
  };

  timeline: {
    resolution: { width: number; height: number }; // 1920x1080
    fps: number; // 30, 60
    duration: number; // Total seconds
  };

  music?: {
    id: string; // Stable ID for editing
    sourceId: string; // Media item ID
    bpm: number;
    beatGrid: number[]; // Timestamps of beats
    volume: number; // 0-1
    fadeIn?: number; // Seconds
    fadeOut?: number; // Seconds
  };

  shots: Shot[]; // Ordered list of shots

  masks?: MaskAsset[];
  motionTracks?: MotionTrack[];
  planarTracks?: PlanarTrack[];
  textOverlays?: TextOverlay[];

  /** Global edit intensity 0-1. Scales all effects, color, motion, transitions. */
  intensity?: number;

  globalEffects?: {
    colorGrade?: ColorGradePreset;
    vignette?: number; // 0-1
    grain?: number; // 0-1
  };
}
