// StyleDNA — Monet's complete aesthetic vocabulary

export type RGBVector = [number, number, number];

export type StyleCategory =
  | "film_reference" | "music_video" | "animation_style"
  | "internet_aesthetic" | "photographic" | "era_based"
  | "experimental" | "commercial" | "documentary"
  | "gaming" | "social_media_format";

// Photoshop-style pixel blend modes (used by effects)
export type LayerBlendMode =
  | "normal" | "multiply" | "screen" | "overlay"
  | "soft_light" | "hard_light" | "color_dodge" | "color_burn"
  | "darken" | "lighten" | "difference" | "exclusion"
  | "hue" | "saturation" | "color" | "luminosity";

// Compositional blend modes (used by the StyleBlender)
export type StyleBlendMode =
  | "crossfade" | "layered" | "structural_mix"
  | "collision" | "masked";

// ──────────────────────────────────────────────────────────────
// COLOR GRADE
// ──────────────────────────────────────────────────────────────

export type FilmStockPreset =
  | "kodak_portra_400" | "fuji_provia_100f" | "kodak_vision3_250d"
  | "fuji_c200" | "kodak_trix_400" | "ilford_delta_3200"
  | "cinestill_800t" | "custom";

export interface GrainSpec {
  intensity: number;
  size: number;
  color: boolean;
  temporal: boolean;
}

export interface VignetteSpec {
  amount: number;
  midpoint: number;
  roundness: number;
  feather: number;
  color: RGBVector | null;
}

export interface ChromaticAberrationSpec {
  intensity: number;
  angle: number;
  radial: boolean;
  channelOffsets: { r: number; g: number; b: number } | null;
}

export interface BloomSpec {
  intensity: number;
  threshold: number;
  radius: number;
  softness: number;
  color: RGBVector | null;
}

export interface ColorGradeSpec {
  lift: RGBVector;
  gamma: RGBVector;
  gain: RGBVector;
  offset: RGBVector;
  saturation: number;
  vibrance: number;
  contrast: number;
  pivot: number;
  hueShift: number;
  mix: number;
  temperature: number;
  tint: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  tealOrange: boolean;
  orangeTealIntensity: number;
  bleachBypass: boolean;
  bleachBypassIntensity: number;
  splitToning: {
    highlightHue: number;
    highlightSat: number;
    shadowHue: number;
    shadowSat: number;
    balance: number;
  } | null;
  filmStock: FilmStockPreset | null;
  grain: GrainSpec | null;
  vignette: VignetteSpec | null;
  chromaticAberration: ChromaticAberrationSpec | null;
  bloom: BloomSpec | null;
}

// ──────────────────────────────────────────────────────────────
// EFFECTS
// ──────────────────────────────────────────────────────────────

export type EffectType =
  | "halftone_benday" | "comic_ink_edges" | "chromatic_glitch"
  | "frame_stutter_anime" | "light_leak" | "film_burn"
  | "lens_flare" | "motion_blur" | "speed_ramp"
  | "zoom_pulse" | "context_shake" | "whip_pan"
  | "rgb_split" | "pixel_sort" | "datamosh"
  | "scanlines" | "vhs_tracking" | "crt_curve"
  | "noise_grain" | "posterize" | "cross_process"
  | "duotone" | "gradient_map" | "displacement_map"
  | "turbulence" | "mirror" | "kaleidoscope"
  | "outline_glow" | "shadow_boost" | "highlight_crush"
  | "flash_white" | "particle_system" | "artifact_block"
  | "bloom" | "overlay" | "vignette";

export type ShotType =
  | "wide" | "medium" | "closeup" | "extreme_closeup"
  | "hero" | "transition" | "all";

export interface KeyframeTrack {
  property: string;
  keyframes: Array<{ time: number; value: number; easing?: string }>;
}

export interface AudioTrigger {
  on: "beat" | "drop" | "silence" | "dialogue";
  threshold?: number;
}

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean | RGBVector | (string | number)[]>;
  blendMode?: LayerBlendMode;
  keyframes?: KeyframeTrack[];
  applyToShots?: ShotType[];
  triggerOnAudio?: AudioTrigger;
}

export interface EffectStackSpec {
  effects: EffectInstance[];
  overallIntensity: number;
  blendMode: LayerBlendMode;
}

// ──────────────────────────────────────────────────────────────
// TIMING
// ──────────────────────────────────────────────────────────────

export type FrameRateFeel =
  | { type: "normal"; fps: 24 | 30 | 60 | 29.97 }
  | { type: "limited"; holdFrames: 2 | 3 | 4 };

export type SpeedRampStyle =
  | "none" | "slowburn" | "punch" | "rhythmic" | "whip" | "variable";

export type TempoDescription =
  | "static" | "leisurely" | "moderate" | "brisk"
  | "frantic" | "musical" | "staccato" | "breathing"
  | "climax_heavy" | "rollercoaster" | "leisurely_to_brisk";

export interface StutterConfig {
  enabled: boolean;
  holdInterval: number;
  jitterChance: number;
  phaseOffset: number;
}

export interface MotionBlurSpec {
  enabled: boolean;
  shutterAngle: number;
  samples: number;
  directional: boolean;
}

export interface TimingSpec {
  frameRateFeel: FrameRateFeel;
  speedRampStyle: SpeedRampStyle;
  defaultSpeedMultiplier?: number;
  tempo: TempoDescription;
  averageShotDurationSec: number;
  stutterConfig: StutterConfig | null;
  motionBlur: MotionBlurSpec | null;
}

// ──────────────────────────────────────────────────────────────
// CAMERA
// ──────────────────────────────────────────────────────────────

export type CameraEnergy =
  | "locked_off" | "static" | "steady"
  | "handheld_natural" | "handheld_aggressive"
  | "kinetic" | "floaty" | "chaotic";

export type MovementPattern =
  | "none" | "subtle_drift" | "drift" | "breathe"
  | "push_pull" | "pan_horizontal" | "pan_vertical"
  | "orbit_slow" | "shake_subtle" | "shake_aggressive"
  | "snap_zoom";

export interface CameraMovementSpec {
  baseMovement: MovementPattern;
  heroMomentMovement?: MovementPattern;
  amplitude: number;
  frequency: number;
  randomJitter: number;
}

export interface LensSpec {
  focalLength: number;
  distortion: number;
  anamorphicSqueeze: number;
  flareType: "none" | "subtle" | "anamorphic_streaks" | "star_filter";
  flareIntensity: number;
}

export interface DOFSpec {
  enabled: boolean;
  focalDepth: number;
  aperture: number;
  blurQuality: "fast" | "high" | "bokeh_shapes";
  edgeBoost: boolean;
}

export interface CameraSpec {
  energy: CameraEnergy;
  movement: CameraMovementSpec;
  lensSimulation: LensSpec | null;
  dofSimulation: DOFSpec | null;
}

// ──────────────────────────────────────────────────────────────
// GRAPHICS (Text & Overlays)
// ──────────────────────────────────────────────────────────────

export type SizeFeel = "tiny" | "small" | "medium" | "large" | "hero" | "billboard";

export type TextAnimType =
  | "none" | "cut" | "fade_in" | "fade_out" | "fade_in_up"
  | "typewriter" | "slide_from_left" | "slide_from_right"
  | "slide_from_bottom" | "scale_pop" | "scale_pop_reverse"
  | "glitch_in" | "spin_in" | "bounce_in" | "brush_stroke";

export type IdleBehavior =
  | "static" | "gentle_float" | "pulse"
  | "glitch_flicker" | "scan" | "kinetic_bounce" | "bounce";

export interface TextAnimationSpec {
  entryAnimation: TextAnimType;
  exitAnimation: TextAnimType;
  idleBehavior: IdleBehavior;
  perWordStagger: boolean;
  syncToAudio: boolean;
  bounceWiggle: number;
  glitchFrequency: number;
}

export type PlacementStrategy =
  | "lower_third" | "center_title" | "upper_third"
  | "random_dynamic" | "dynamic" | "follow_subject"
  | "rule_of_thirds" | "edge_hug" | "cinematic_safe_zone";

export type TextColorMode =
  | { type: "solid"; color: RGBVector }
  | { type: "gradient"; colors: RGBVector[]; angle: number }
  | { type: "neon_glow"; coreColor: RGBVector; glowColor: RGBVector; glowSize: number }
  | { type: "comic_fill"; inkColor: RGBVector }
  | { type: "context_aware"; darkBgColor: RGBVector; lightBgColor: RGBVector };

export interface OutlineSpec {
  enabled: boolean;
  width: number;
  color: RGBVector;
  opacity: number;
}

export interface TextShadowSpec {
  enabled: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  color: RGBVector;
  opacity: number;
}

export interface GlowSpec {
  enabled: boolean;
  color: RGBVector;
  size: number;
}

export interface BackgroundPlateSpec {
  enabled: boolean;
  opacity: number;
  color: RGBVector;
  padding: number;
  cornerRadius: number;
  blur: number;
}

export type CaptionStyle =
  | "lyric_highlight" | "quote_card" | "lower_third_name"
  | "graffiti_tag" | "interstitial_title" | "countdown"
  | "timestamp_code" | "watermark" | "kinetic_typography";

export interface TextSpec {
  fontFamily: string;
  fallbackFonts?: string[];
  sizeFeel: SizeFeel;
  sizeRange?: [number, number];
  weight: number;
  animation: TextAnimationSpec;
  placement: PlacementStrategy;
  colorMode: TextColorMode;
  outline: OutlineSpec | null;
  shadow: TextShadowSpec | null;
  glow?: GlowSpec | null;
  backgroundPlate: BackgroundPlateSpec | null;
  captionStyle: CaptionStyle;
}

export interface OverlaySpec {
  id: string;
  type: string;
  params: Record<string, any>;
}

export interface HUDElementSpec {
  type: string;
  position: string;
  params?: Record<string, any>;
}

export interface GraphicsSpec {
  text: TextSpec;
  overlays?: OverlaySpec[];
  hudElements?: HUDElementSpec[] | null;
}

// ──────────────────────────────────────────────────────────────
// EDITORIAL
// ──────────────────────────────────────────────────────────────

export type CutStyle =
  | "hard_cut" | "soft_cut" | "dissolve" | "smash_cut"
  | "match_cut" | "jump_cut" | "l_cut" | "j_cut"
  | "invisible_cut" | "crash_zoom";

export type CutAlignment =
  | "on_beat" | "pre_beat" | "post_beat" | "off_beat"
  | "musical_phrase" | "dialogue_rhythm";

export type TransitionType =
  | "cut" | "dissolve" | "wipe_left" | "wipe_right"
  | "wipe_up" | "wipe_down" | "radial_wipe" | "clock_wipe"
  | "iris_in" | "iris_out" | "glitch" | "digital_noise"
  | "zoom_blur" | "motion_blur" | "spin" | "cube_rotate"
  | "morph" | "dip_to_black" | "dip_to_white" | "dip_to_color"
  | "flash" | "film_burn" | "light_leak";

export type EasingType =
  | "linear" | "ease_in" | "ease_out" | "ease_in_out"
  | "spring" | "bounce" | "elastic"
  | "exponential_in" | "exponential_out" | "exponential";

export interface TransitionSpec {
  type: TransitionType;
  durationMs: number;
  ease: EasingType;
  params?: Record<string, any>;
}

export type PacingCurveType =
  | "flat" | "rising" | "falling" | "arc"
  | "rollercoaster" | "staccato" | "breathing" | "climax_heavy";

export interface EditorialSpec {
  avgShotDurationSec: number;
  shotDurationVariance: number;
  preferredDurations?: number[];
  cutStyle: CutStyle;
  cutAlignment: CutAlignment;
  closeupBias: number;
  extremeCloseupBias?: number;
  wideShotBias?: number;
  defaultTransition: TransitionSpec;
  heroTransition: TransitionSpec;
  pacingCurve: PacingCurveType;
  useMontage?: boolean;
  useSplitScreen?: boolean;
  usePictureInPicture?: boolean;
  useJumpCuts?: boolean;
  matchActionRequired?: boolean;
}

// ──────────────────────────────────────────────────────────────
// AUDIO REACTIVITY
// ──────────────────────────────────────────────────────────────

export type VisualParameter =
  | "zoom" | "rotation" | "chromatic_aberration"
  | "effect_intensity" | "grain" | "bloom"
  | "color_saturation" | "contrast" | "speed";

export interface BeatResponse {
  triggerEffect: EffectType | null;
  flashWhite?: number;
  zoomPulse?: number;
  cutProbability: number;
  strobeDuration?: number;
}

export interface DropResponse {
  triggerEffect: EffectType | null;
  maximumIntensity?: number;
  slowMotionFactor?: number;
  chromaticSpike?: number;
  durationBeats?: number;
}

export interface SilenceResponse {
  fadeEffects?: boolean;
  pullBackGrade?: boolean;
  increaseGrain?: boolean;
}

export interface DialogueResponse {
  lowerThirdAuto?: boolean;
  suppressMusicVisuals?: boolean;
  focusPull?: boolean;
}

export interface AudioReactivitySpec {
  enabled: boolean;
  onBeat: BeatResponse;
  onDrop?: DropResponse;
  onSilence?: SilenceResponse;
  onDialogue?: DialogueResponse;
  bassMapsTo?: VisualParameter;
  midMapsTo?: VisualParameter;
  highMapsTo?: VisualParameter;
  energyMapsTo?: VisualParameter;
  sensitivity?: number;
  smoothing?: number;
}

// ──────────────────────────────────────────────────────────────
// THE MAIN STYLE DNA
// ──────────────────────────────────────────────────────────────

export interface StyleDNA {
  id: string;
  name: string;
  category: StyleCategory;
  tags: string[];
  sourceInfluences: string[];
  confidence: number;
  compatibilityScore?: number;

  grade: ColorGradeSpec;
  globalEffects: EffectStackSpec;
  heroEffects: EffectStackSpec;
  timing: TimingSpec;
  camera: CameraSpec;
  graphics: GraphicsSpec;
  editorial: EditorialSpec;
  audioReactivity: AudioReactivitySpec;

  // Internal flags (set by blender)
  _maskedBlend?: boolean;
  _accentStyle?: string;
}
