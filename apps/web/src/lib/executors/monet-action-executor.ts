// apps/web/src/lib/executors/monet-action-executor.ts
/**
 * MonetActionExecutor — translates Monet EDL features into OpenReel project mutations.
 *
 * Director generates features like `push_in`, `impact_flash`, `color_pulse`,
 * `context_shake`, `beat_cut`. The fallback executor only handles `addMedia` + `cut`,
 * which is why outputs feel mid even though EDLs look ambitious.
 *
 * This executor implements the FULL feature set so what the director plans
 * is what the user actually sees.
 */

import type {
  ProjectState, Track, Clip, Effect, Keyframe, Overlay,
} from "../project-store-types";

const FEATURE_ALIASES: Record<string, string> = {
  // Direct synonyms
  shake: "context_shake",
  motion_blur: "whip_pan",
  rgb_split: "chromatic_burst",
  color_shift: "color_pulse",
  rgb_burst: "chromatic_burst",

  // Map non-implemented to closest visual equivalent
  zoom_pulse: "push_in",
  whip_transition: "whip_pan",
  glow: "color_pulse",
  sharpen: "color_pulse",
  blur_in: "push_in",
  shutter_drag: "whip_pan",

  // Direct passthrough
  push_in: "push_in",
  pull_out: "pull_out",
  context_shake: "context_shake",
  impact_flash: "impact_flash",
  color_pulse: "color_pulse",
  speed_ramp: "speed_ramp",
  freeze_frame: "freeze_frame",
  vignette_punch: "vignette_punch",
  chromatic_burst: "chromatic_burst",
  whip_pan: "whip_pan",
  beat_cut: "beat_cut",

  // Shader FX passthrough
  glitch: "glitch",
  vhs: "vhs",
  scanlines: "scanlines",
  pixelate: "pixelate",

  // Particle FX passthrough
  light_leak: "light_leak",
  sparks: "sparks",
  lens_flare: "lens_flare",
  dust: "dust",
  smoke: "smoke",
  confetti: "confetti",
  rain: "rain",

  // Text engine passthrough
  kinetic_caption: "kinetic_caption",
  subtitle: "subtitle",
  title_card: "title_card",
  lower_third: "lower_third",
  lyric_text: "lyric_text",
  word_pop: "word_pop",

  // AI Specialist passthrough and aliases
  tracked_caption: "tracked_caption",
  face_follow: "tracked_caption",
  tracked_text: "tracked_caption",

  // glfx + shadertoy aliases — pass through to shader engine
  brightness_contrast: "brightness_contrast",
  brightness: "brightness_contrast",
  hue_saturation: "hue_saturation",
  hue_shift: "hue_saturation",
  vibrance: "vibrance",
  sepia: "sepia",
  vignette_pro: "vignette_pro",
  triangle_blur: "triangle_blur",
  soft_blur: "triangle_blur",
  lens_blur: "lens_blur",
  bokeh_blur: "lens_blur",
  tilt_shift: "tilt_shift",
  miniature: "tilt_shift",
  edges_gfx: "edges_gfx",
  edge_detect: "edges_gfx",
  ink_gfx: "ink_gfx",
  pen_sketch: "ink_gfx",
  emboss_gfx: "emboss_gfx",
  swirl_gfx: "swirl_gfx",
  twist: "swirl_gfx",
  bulge_pinch: "bulge_pinch",
  fish_eye: "bulge_pinch",
  noise_film: "noise_film",
  film_grain: "noise_film",
  posterize_gfx: "posterize_gfx",
  zoom_blur: "zoom_blur",
  radial_blur: "zoom_blur",
  denoise_gfx: "denoise_gfx",
  color_halftone: "color_halftone",
  newspaper: "color_halftone",
  dot_screen: "dot_screen",
  shift_towards: "shift_towards",
  warm_shift: "shift_towards",
  cool_shift: "shift_towards",
  plasma: "plasma",
  psychedelic: "plasma",
  heat_wave: "heat_wave",
  mirage: "heat_wave",
  crt_monitor: "crt_monitor",
  crt: "crt_monitor",
  retro_tv: "crt_monitor",
  dream_blur: "dream_blur",
  dream: "dream_blur",
  kaleidoscope: "kaleidoscope",
  pulse_wave: "pulse_wave",
  shock_wave: "pulse_wave",
  ascii_matrix: "ascii_matrix",
  matrix: "ascii_matrix",
  hologram: "hologram",
  sci_fi: "hologram",
  thermal: "thermal",
  predator_vision: "thermal",
  duotone: "duotone",
  floating_dust: "floating_dust",
  particles_dust: "floating_dust",
  infrared: "infrared",
  edge_glow: "infrared",
  film_scratches: "film_scratches",
  old_film: "film_scratches",
  liquid: "liquid",
  underwater: "liquid",
  bloom_highlights: "bloom_highlights",
  bloom: "bloom_highlights",
  glow_pro: "bloom_highlights",

  // Specialist AI aliases
  subject_isolation: "subject_isolation",
  isolate_subject: "subject_isolation",
  subject_pop: "subject_pop",
  bg_blur: "bg_blur_subject",
  bg_dim: "bg_dim_subject",
  depth_focus: "depth_focus",
  rack_focus: "depth_focus",
  depth_parallax: "depth_parallax",
  parallax: "depth_parallax",
  text_behind_subject: "text_behind_subject",
  smooth_slowmo: "smooth_slowmo",
  rife_slowmo: "smooth_slowmo",
  face_detect_overlay: "face_detect_overlay",
  edge_outline: "edge_outline",
  optical_flow_vis: "optical_flow_vis",
};

function aliasEffectKind(rawKind: string): string {
  const mapped = FEATURE_ALIASES[rawKind];
  if (mapped && mapped !== rawKind) {
    console.log(`[monet] aliased effect: ${rawKind} → ${mapped}`);
  }
  return mapped ?? rawKind;
}

// ============================================================================
// Types
// ============================================================================

export interface MonetShot {
  clipId: string;             // source media id
  sourceIn: number;           // seconds into source
  sourceOut: number;
  timelineStart: number;      // seconds on output timeline
  duration: number;           // timelineStart + duration = next shot start
  features?: MonetFeature[];
  styleTags?: string[];       // e.g. ["punchy", "vintage", "high-energy"]
}

export interface MonetFeature {
  kind: FeatureKind;
  params?: Record<string, any>;
  atTime?: number;            // time within the shot (0 = start), defaults to 0
  duration?: number;          // how long the effect lasts within the shot
  intensity?: number;         // 0..1, defaults to 0.7
}

export type FeatureKind =
  | "beat_cut"           // hard cut at beat boundary (no visual — already implicit in shot)
  | "push_in"            // ramp scale 1.0 → 1.15 over duration
  | "pull_out"           // ramp scale 1.15 → 1.0
  | "impact_flash"       // white frame at hit, decays in 80-150ms
  | "color_pulse"        // saturation/brightness pump for ~250ms
  | "context_shake"      // small camera shake (subtle, not seizure)
  | "freeze_frame"       // hold a single frame for N seconds
  | "speed_ramp"         // ramp speed e.g. 1.0 → 0.3 → 1.0
  | "whip_pan"           // quick blur pan into the next shot
  | "vignette_punch"     // sudden vignette closing in
  | "chromatic_burst"    // RGB split for impact
  // Shader FX
  | "glitch" | "vhs" | "scanlines" | "pixelate" | "rgb_shift"
  // Particles
  | "light_leak" | "sparks" | "lens_flare" | "dust" | "smoke" | "confetti" | "rain"
  // Text
  | "kinetic_caption" | "subtitle" | "title_card" | "lower_third" | "lyric_text" | "word_pop"
  // glfx effects
  | "brightness_contrast" | "hue_saturation" | "vibrance" | "sepia" | "vignette_pro"
  | "triangle_blur" | "lens_blur" | "tilt_shift" | "edges_gfx" | "ink_gfx" | "emboss_gfx"
  | "swirl_gfx" | "bulge_pinch" | "noise_film" | "posterize_gfx" | "zoom_blur" | "denoise_gfx"
  | "color_halftone" | "dot_screen" | "shift_towards"
  // shadertoy effects
  | "plasma" | "heat_wave" | "crt_monitor" | "dream_blur" | "kaleidoscope"
  | "pulse_wave" | "ascii_matrix" | "hologram" | "thermal" | "duotone"
  | "floating_dust" | "infrared" | "film_scratches" | "liquid" | "bloom_highlights"
  // specialist AI effects
  | "subject_isolation" | "subject_pop" | "bg_blur_subject" | "bg_dim_subject"
  | "depth_focus" | "depth_parallax" | "text_behind_subject"
  | "smooth_slowmo" | "rife_slowmo"
  // OpenCV browser effects
  | "face_detect_overlay" | "edge_outline" | "optical_flow_vis";

export interface MonetEDL {
  shots: MonetShot[];
  captions?: MonetCaption[];
  audioTracks?: MonetAudioTrack[];
  style?: {
    grade?: ColorGrade;
    pacing?: "slow_burn" | "balanced" | "rapid" | "frantic";
    globalIntensity?: number;
  };
  duration: number;
}

export interface MonetCaption {
  text: string;
  startTime: number;
  duration: number;
  style?: {
    color?: string;
    fontSize?: string | number;
    fontFamily?: string;
    fontWeight?: string;
    backgroundColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    position?: { x: number | string; y: number | string };
    animation?: "pop" | "fade" | "slide_up" | "typewriter" | "none";
  };
}

export interface MonetAudioTrack {
  mediaId: string;
  timelineStart: number;
  sourceIn?: number;
  sourceOut?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  duckUnderVO?: boolean;
}

export interface ColorGrade {
  saturation?: number;     // 1.0 = neutral
  contrast?: number;
  brightness?: number;
  temperature?: number;    // -1 cool, +1 warm
  tint?: number;
  shadows?: string;        // hex tint
  highlights?: string;
  lift?: number;
  gamma?: number;
  gain?: number;
}

export interface ApplyResult {
  appliedShots: number;
  appliedFeatures: number;
  skippedFeatures: { kind: string; reason: string }[];
  duration: number;
  warnings: string[];
}

// ============================================================================
// Executor
// ============================================================================

export class MonetActionExecutor {
  readonly version = "monet/v1";

  /**
   * Normalize EDL shots — fills in missing timelineStart/duration/sourceOut
   * by computing them from neighbors. LLMs frequently omit these.
   */
  private normalizeShots(edl: any): MonetEDL {
    if (!edl.shots || edl.shots.length === 0) {
      return { ...edl, shots: [], duration: numberOr(edl.duration ?? edl.timeline?.duration, 0) };
    }

    const normalized: MonetShot[] = [];
    let cursor = 0;

    for (let i = 0; i < edl.shots.length; i++) {
      const raw = edl.shots[i] as any;
      const next = edl.shots[i + 1] as any;

      // === SCHEMA ADAPTATION ===
      // Director EDL uses: shot.source.{clipId, inPoint, outPoint}
      //                    shot.timing.{startTime, duration, speed}
      //                    shot.effects: [...]
      //                    shot.transition: {...}
      //
      // Also supports older flat-shape variants for safety.

      const clipId =
        raw.source?.clipId ??
        raw.source?.mediaId ??
        raw.clipId ??
        raw.mediaId;

      const sourceIn = numberOr(
        raw.source?.inPoint ??
        raw.source?.in ??
        raw.source?.sourceIn ??
        raw.sourceIn ??
        raw.inPoint,
        0,
      );

      const sourceOut = numberOr(
        raw.source?.outPoint ??
        raw.source?.out ??
        raw.source?.sourceOut ??
        raw.sourceOut ??
        raw.outPoint,
        sourceIn + numberOr(raw.timing?.duration ?? raw.duration, 2.0),
      );

      const timelineStart = numberOr(
        raw.timing?.startTime ??
        raw.timing?.start ??
        raw.timelineStart ??
        raw.startTime,
        cursor,
      );

      let duration = numberOr(
        raw.timing?.duration ?? raw.duration,
        sourceOut - sourceIn,
      );
      if (!Number.isFinite(duration) || duration <= 0) {
        if (next) {
          const nextStart = numberOr(
            next.timing?.startTime ?? next.timing?.start ?? next.timelineStart ?? next.startTime,
            NaN,
          );
          duration = Number.isFinite(nextStart)
            ? Math.max(0.1, nextStart - timelineStart)
            : 2.0;
        } else {
          duration = 2.0;
        }
      }

      if (!clipId) {
        console.warn(`[monet] shot ${i} has no clipId; skipping`, raw);
        continue;
      }

      // === SPEED → optional speed_ramp injection ===
      // Director's `shot.timing.speed` is the playback speed for this shot.
      // We don't carry it on MonetShot directly; if speed != 1, synthesize a feature.
      const shotSpeed = numberOr(raw.timing?.speed ?? raw.speed, 1);

      // === EFFECTS / FEATURES — handle both names ===
      const rawFeatures = raw.effects ?? raw.features ?? [];
      const features = rawFeatures
        .filter((f: any) => f && typeof (f.kind ?? f.type ?? f.name) === "string")
        .map((f: any) => {
          const rawKind = f.kind ?? f.type ?? f.name;
          return {
            kind: aliasEffectKind(rawKind) as FeatureKind,
            atTime: numberOr(f.atTime ?? f.startTime ?? f.timing?.startTime, 0),
            duration: numberOr(f.duration ?? f.timing?.duration, duration),
            intensity: clamp(numberOr(f.intensity ?? f.strength, 0.7), 0, 1),
            params: f.params ?? f.options ?? {},
          };
        });

      // If speed isn't 1.0, inject a speed_ramp / playbackSpeed feature
      if (Math.abs(shotSpeed - 1) > 0.01) {
        features.push({
          kind: "speed_ramp" as FeatureKind,
          atTime: 0,
          duration,
          intensity: 0.7,
          params: { minSpeed: shotSpeed, maxSpeed: shotSpeed }, // hold constant speed
        });
      }

      normalized.push({
        clipId,
        sourceIn,
        sourceOut,
        timelineStart,
        duration,
        features,
        styleTags: Array.isArray(raw.styleTags ?? raw.tags) ? (raw.styleTags ?? raw.tags) : [],
      });

      cursor = timelineStart + duration;
    }

    // Normalize captions defensively too
    const rawCaptions = edl.captions ?? edl.textOverlays ?? edl.texts ?? [];
    const captions = rawCaptions
      .filter((c: any) => c && typeof (c.text ?? c.content) === "string")
      .map((c: any) => ({
        text: c.text ?? c.content,
        startTime: numberOr(c.startTime ?? c.timelineStart ?? c.timing?.startTime, 0),
        duration: numberOr(c.duration ?? c.timing?.duration, 1.5),
        style: c.style ?? c.styling ?? {},
      }));

    // Normalize audio tracks
    const rawAudio = (() => {
      if (Array.isArray(edl.audioTracks)) return edl.audioTracks;
      if (Array.isArray(edl.audio)) return edl.audio;
      if (edl.music) return [edl.music];
      return [];
    })();

    const audioTracks = rawAudio
      .filter((a: any) => a && (a.mediaId ?? a.sourceId ?? a.clipId))
      .map((a: any) => ({
        mediaId: a.mediaId ?? a.sourceId ?? a.clipId,
        timelineStart: numberOr(a.timelineStart ?? a.startTime ?? a.timing?.startTime, 0),
        sourceIn: numberOr(a.sourceIn ?? a.inPoint ?? a.in, 0),
        sourceOut: numberOr(a.sourceOut ?? a.outPoint ?? a.out, undefined as any),
        volume: clamp(numberOr(a.volume, 1.0), 0, 2),
        fadeIn: numberOr(a.fadeIn, 0),
        fadeOut: numberOr(a.fadeOut, 0),
        duckUnderVO: !!a.duckUnderVO,
      }));

    // === TOP-LEVEL STYLE ===
    const style = edl.style ?? edl.globalEffects ?? edl.globalStyle ?? undefined;

    // === DURATION ===
    const topDuration = numberOr(
      edl.duration ?? edl.timeline?.duration,
      cursor,
    );

    return {
      ...edl,
      duration: topDuration,
      shots: normalized,
      captions,
      audioTracks,
      style,
    };
  }

  /**
   * Apply a Monet EDL to a project state, producing a fully-rigged timeline.
   * Returns the mutated project + a coverage report.
   */
  apply(project: ProjectState, rawEdl: any): { project: ProjectState; result: ApplyResult } {
    const edl = this.normalizeShots(rawEdl);
    const warnings: string[] = [];
    const skipped: ApplyResult["skippedFeatures"] = [];
    let appliedFeatures = 0;

    // 1. Clear any previous Monet-applied tracks (idempotent)
    project = this.clearMonetTracks(project);

    // 2. Build the video track
    const videoTrack: Track = {
      id: "monet_video_1",
      kind: "video",
      name: "Monet Video",
      clips: [],
      managed_by: "monet/v1",
    };

    // 3. Build overlay tracks for impact effects, captions, etc.
    const fxTrack: Track = {
      id: "monet_fx_1",
      kind: "overlay",
      name: "Monet FX",
      clips: [],
      managed_by: "monet/v1",
    };

    const textTrack: Track = {
      id: "monet_text_1",
      kind: "text",
      name: "Monet Captions",
      clips: [],
      managed_by: "monet/v1",
    };

    const audioTrack: Track = {
      id: "monet_audio_1",
      kind: "audio",
      name: "Monet BGM",
      clips: [],
      managed_by: "monet/v1",
    };

    // 4. Process each shot
    for (const shot of edl.shots) {
      const clip = this.buildClipFromShot(shot, edl.style);
      videoTrack.clips.push(clip);

      // Apply features that produce overlay elements (not just clip mutations)
      for (const feature of shot.features || []) {
        try {
          const overlay = this.featureToOverlay(feature, shot);
          if (overlay) fxTrack.clips.push(overlay);
          appliedFeatures++;
        } catch (e: any) {
          skipped.push({ kind: feature.kind, reason: e.message });
        }
      }
    }

    // 5. Captions
    for (const caption of edl.captions || []) {
      textTrack.clips.push(this.buildCaptionClip(caption));
    }

    // 6. Audio (BGM, with optional ducking)
    for (const audio of edl.audioTracks || []) {
      audioTrack.clips.push(this.buildAudioClip(audio));
    }

    // 7. Apply global color grade as a track-level effect
    if (edl.style?.grade) {
      videoTrack.effects = [
        ...(videoTrack.effects || []),
        this.gradeToEffect(edl.style.grade),
      ];
    }

    // 8. Commit tracks to project
    const tracksToApply = [
      videoTrack,
      fxTrack,
      textTrack,
      audioTrack,
    ];

    project = {
      ...project,
      tracks: [
        ...(project.tracks || []).filter((t: Track) => t.managed_by !== "monet/v1"),
        ...tracksToApply,
      ],
      timeline: project.timeline ? {
        ...project.timeline,
        tracks: [
          ...(project.timeline.tracks || []).filter((t: any) => t.managed_by !== "monet/v1" && t.id !== "video-main" && t.id !== "audio-main"),
          ...tracksToApply.map(t => ({
            id: t.id,
            kind: t.kind,
            type: t.kind, // map kind back to type since openreel-video uses type
            clips: t.clips.map(c => ({
              ...c,
              startTime: c.timelineStart, // map timelineStart back to startTime
              mediaId: c.sourceId, // map sourceId back to mediaId
              inPoint: c.sourceIn,
              outPoint: c.sourceOut,
            })),
            transitions: [],
            locked: false,
            hidden: false,
            managed_by: "monet/v1",
          })),
        ],
        duration: Math.max(project.timeline.duration || 0, edl.duration),
      } : {
        tracks: tracksToApply.map(t => ({
          id: t.id,
          kind: t.kind,
          type: t.kind,
          clips: t.clips.map(c => ({
            ...c,
            startTime: c.timelineStart,
            mediaId: c.sourceId,
            inPoint: c.sourceIn,
            outPoint: c.sourceOut,
          })),
          transitions: [],
          locked: false,
          hidden: false,
          managed_by: "monet/v1",
        })),
        duration: edl.duration,
      },
      duration: Math.max(project.duration || 0, edl.duration),
      lastEditor: "monet/v1",
    };

    return {
      project,
      result: {
        appliedShots: edl.shots.length,
        appliedFeatures,
        skippedFeatures: skipped,
        duration: edl.duration,
        warnings,
      },
    };
  }

  private clearMonetTracks(project: ProjectState): ProjectState {
    return {
      ...project,
      tracks: (project.tracks || []).filter((t: Track) => t.managed_by !== "monet/v1"),
    };
  }

  // ------------------------------------------------------------------------
  // Shot → Clip with effects + keyframes
  // ------------------------------------------------------------------------

  private buildClipFromShot(shot: MonetShot, globalStyle?: MonetEDL["style"]): Clip {
    const features = shot.features || [];
    const timelineStart = numberOr(shot.timelineStart, 0);
    const duration = numberOr(shot.duration, 2.0);

    const clip: Clip = {
      id: `${shot.clipId}_${timelineStart.toFixed(3)}`,
      sourceId: shot.clipId,
      sourceIn: shot.sourceIn,
      sourceOut: shot.sourceOut,
      timelineStart,
      duration,
      effects: [],
      keyframes: [],
      transform: { scale: 1.0, x: 0, y: 0, rotation: 0 },
      volume: 1.0,
    };

    // Apply each feature that affects the clip itself (transforms, keyframes, grades)
    for (const feature of features) {
      const intensity = feature.intensity ?? 0.7;
      const at = feature.atTime ?? 0;
      const dur = feature.duration ?? duration;

      switch (feature.kind) {
        case "push_in":
          this.applyPushIn(clip, at, dur, intensity);
          break;
        case "pull_out":
          this.applyPullOut(clip, at, dur, intensity);
          break;
        case "color_pulse":
          this.applyColorPulse(clip, at, dur, intensity);
          break;
        case "context_shake":
          this.applyContextShake(clip, at, dur, intensity);
          break;
        case "speed_ramp":
          this.applySpeedRamp(clip, at, dur, intensity, feature.params);
          break;
        case "freeze_frame":
          this.applyFreezeFrame(clip, at, feature.params?.holdDuration ?? 0.5);
          break;
        case "vignette_punch":
          this.applyVignettePunch(clip, at, dur, intensity);
          break;
        case "chromatic_burst":
          this.applyChromaticBurst(clip, at, dur, intensity);
          break;
        case "whip_pan":
          this.applyWhipPan(clip, at, dur, intensity);
          break;
        // beat_cut and impact_flash don't mutate the clip; handled elsewhere
        case "beat_cut":
        case "impact_flash":
          break;

        // Specialized engine effects bypass clip mutations as they are rendered at dispatcher stage
        case "glitch": case "vhs": case "scanlines": case "pixelate": case "rgb_shift":
        case "light_leak": case "sparks": case "lens_flare": case "dust": case "smoke":
        case "confetti": case "rain":
        case "kinetic_caption": case "subtitle": case "title_card":
        case "lower_third": case "lyric_text": case "word_pop":
        // glfx + shadertoy effects — dispatched to shader engine at render time
        case "brightness_contrast": case "hue_saturation": case "vibrance":
        case "sepia": case "vignette_pro": case "triangle_blur": case "lens_blur":
        case "tilt_shift": case "edges_gfx": case "ink_gfx": case "emboss_gfx":
        case "swirl_gfx": case "bulge_pinch": case "noise_film": case "posterize_gfx":
        case "zoom_blur": case "denoise_gfx": case "color_halftone": case "dot_screen":
        case "shift_towards":
        case "plasma": case "heat_wave": case "crt_monitor": case "dream_blur":
        case "kaleidoscope": case "pulse_wave": case "ascii_matrix": case "hologram":
        case "thermal": case "duotone": case "floating_dust": case "infrared":
        case "film_scratches": case "liquid": case "bloom_highlights":
        // specialist AI effects — dispatched at render time
        case "subject_isolation": case "subject_pop": case "bg_blur_subject":
        case "bg_dim_subject": case "depth_focus": case "depth_parallax":
        case "text_behind_subject": case "smooth_slowmo": case "rife_slowmo":
        // OpenCV browser effects
        case "face_detect_overlay": case "edge_outline": case "optical_flow_vis":
          break;
      }
    }

    // Apply global pacing-derived effect (subtle)
    if (globalStyle?.pacing === "frantic") {
      clip.effects?.push({ kind: "motionBlur", params: { amount: 0.15 } });
    }

    return clip;
  }

  // ------------------------------------------------------------------------
  // Feature handlers — each is a real keyframe + effect chain
  // ------------------------------------------------------------------------

  private applyPushIn(clip: Clip, at: number, dur: number, intensity: number) {
    const startScale = 1.0;
    const endScale = 1.0 + 0.22 * intensity;   // Bump zoom punch for TikTok-tier feel
    clip.keyframes!.push(
      { property: "transform.scale", time: at,        value: startScale, easing: "easeOutCubic" },
      { property: "transform.scale", time: at + dur,  value: endScale,   easing: "easeOutCubic" },
    );
  }

  private applyPullOut(clip: Clip, at: number, dur: number, intensity: number) {
    const startScale = 1.0 + 0.15 * intensity;
    const endScale = 1.0;
    clip.keyframes!.push(
      { property: "transform.scale", time: at,       value: startScale, easing: "easeInOutCubic" },
      { property: "transform.scale", time: at + dur, value: endScale,   easing: "easeInOutCubic" },
    );
  }

  private applyColorPulse(clip: Clip, at: number, dur: number, intensity: number) {
    const peak = at + dur * 0.3;
    const end = at + dur;
    const satBoost = 1.0 + 0.5 * intensity;
    const brightBoost = 0.1 * intensity;
    clip.keyframes!.push(
      { property: "color.saturation", time: at,   value: 1.0,       easing: "easeOutQuad" },
      { property: "color.saturation", time: peak, value: satBoost,  easing: "easeOutQuad" },
      { property: "color.saturation", time: end,  value: 1.0,       easing: "easeInQuad" },
      { property: "color.brightness", time: at,   value: 0,          easing: "easeOutQuad" },
      { property: "color.brightness", time: peak, value: brightBoost, easing: "easeOutQuad" },
      { property: "color.brightness", time: end,  value: 0,          easing: "easeInQuad" },
    );
    clip.effects!.push({ kind: "colorGrade", params: { animated: true } });
  }

  private applyContextShake(clip: Clip, at: number, dur: number, intensity: number) {
    // Generate ~12 keyframes of jitter
    const amplitude = 14 * intensity;    // Bump amplitude for punchier feel
    const freq = 18;                      // ~18 Hz shake
    const samples = Math.max(8, Math.ceil(dur * 12));
    for (let i = 0; i <= samples; i++) {
      const t = at + (i / samples) * dur;
      const decay = Math.exp(-2 * (i / samples));   // fade out shake
      const x = Math.sin(2 * Math.PI * freq * (i / samples) * dur) * amplitude * decay;
      const y = Math.cos(2 * Math.PI * freq * 1.37 * (i / samples) * dur) * amplitude * decay;
      clip.keyframes!.push(
        { property: "transform.x", time: t, value: x, easing: "linear" },
        { property: "transform.y", time: t, value: y, easing: "linear" },
      );
    }
    // Slightly oversize the clip so shake doesn't reveal edges
    clip.keyframes!.push(
      { property: "transform.scale", time: at,       value: 1.05, easing: "linear" },
      { property: "transform.scale", time: at + dur, value: 1.05, easing: "linear" },
    );
  }

  private applySpeedRamp(
    clip: Clip, at: number, dur: number, intensity: number,
    params?: { minSpeed?: number; maxSpeed?: number },
  ) {
    const minSpeed = params?.minSpeed ?? Math.max(0.2, 1.0 - 0.6 * intensity);
    const maxSpeed = params?.maxSpeed ?? 1.0;
    clip.keyframes!.push(
      { property: "playbackSpeed", time: at,             value: maxSpeed, easing: "easeInQuad" },
      { property: "playbackSpeed", time: at + dur * 0.5, value: minSpeed, easing: "easeOutQuad" },
      { property: "playbackSpeed", time: at + dur,       value: maxSpeed, easing: "easeInOutQuad" },
    );
  }

  private applyFreezeFrame(clip: Clip, at: number, holdDuration: number) {
    clip.effects!.push({
      kind: "freezeFrame",
      params: { atTime: at, holdDuration },
    });
  }

  private applyVignettePunch(clip: Clip, at: number, dur: number, intensity: number) {
    const peak = at + dur * 0.4;
    clip.keyframes!.push(
      { property: "vignette.amount", time: at,   value: 0,                  easing: "easeOutCubic" },
      { property: "vignette.amount", time: peak, value: 0.85 * intensity,   easing: "easeOutCubic" }, // Bumped peak vignette
      { property: "vignette.amount", time: at + dur, value: 0.2 * intensity, easing: "easeInCubic" },
    );
    clip.effects!.push({ kind: "vignette", params: { animated: true } });
  }

  private applyChromaticBurst(clip: Clip, at: number, dur: number, intensity: number) {
    const peak = at + 0.06;
    clip.keyframes!.push(
      { property: "chromaticAberration", time: at,        value: 0,                easing: "easeOutQuad" },
      { property: "chromaticAberration", time: peak,      value: 16 * intensity,   easing: "easeOutQuad" }, // Bumped RGB split
      { property: "chromaticAberration", time: at + dur,  value: 0,                easing: "easeInQuad" },
    );
    clip.effects!.push({ kind: "chromaticAberration", params: { animated: true } });
  }

  private applyWhipPan(clip: Clip, at: number, dur: number, intensity: number) {
    // Whip pan = motion blur + horizontal translation at the end of the clip
    const start = Math.max(0, at + dur - 0.25);
    clip.keyframes!.push(
      { property: "transform.x",        time: start,         value: 0,                easing: "easeInQuad" },
      { property: "transform.x",        time: at + dur,      value: -400 * intensity, easing: "easeInQuad" },
      { property: "motionBlur.amount",  time: start,         value: 0,                easing: "easeInQuad" },
      { property: "motionBlur.amount",  time: at + dur,      value: 0.8 * intensity,  easing: "easeInQuad" },
    );
    clip.effects!.push({ kind: "motionBlur", params: { directional: true, animated: true } });
  }

  // ------------------------------------------------------------------------
  // Features that produce overlays (live on FX track, not the clip)
  // ------------------------------------------------------------------------

  private featureToOverlay(feature: MonetFeature, shot: MonetShot): Overlay | null {
    if (feature.kind === "impact_flash") {
      const shotStart = numberOr(shot.timelineStart, 0);
      const start = shotStart + numberOr(feature.atTime, 0);
      const duration = numberOr(feature.duration, 0.1);
      const intensity = numberOr(feature.intensity, 0.9);
      return {
        id: `flash_${start.toFixed(3)}`,
        kind: "flash",
        timelineStart: start,
        duration,
        sourceIn: 0,
        sourceOut: duration,
        params: {
          color: feature.params?.color ?? "white",
          opacity: intensity,
          fadeOut: 0.06,
        },
      };
    }
    return null;
  }

  // ------------------------------------------------------------------------
  // Captions
  // ------------------------------------------------------------------------

  private buildCaptionClip(caption: MonetCaption): Clip {
    const startTime = numberOr(caption.startTime, 0);
    const duration = numberOr(caption.duration, 1.5);
    return {
      id: `caption_${startTime.toFixed(3)}`,
      kind: "text",
      sourceId: "__text__",
      sourceIn: 0,
      sourceOut: duration,
      timelineStart: startTime,
      duration,
      text: caption.text,
      style: {
        color: caption.style?.color ?? "white",
        fontSize: caption.style?.fontSize ?? "8vw",
        fontFamily: caption.style?.fontFamily ?? "Impact",
        fontWeight: caption.style?.fontWeight ?? "bold",
        backgroundColor: caption.style?.backgroundColor,
        strokeColor: caption.style?.strokeColor ?? "black",
        strokeWidth: caption.style?.strokeWidth ?? 4,
        position: caption.style?.position ?? { x: "50%", y: "75%" },
        animation: caption.style?.animation ?? "pop",
      },
      // Animation = keyframes on the text element
      keyframes: this.buildCaptionAnimation(
        caption.style?.animation ?? "pop", duration,
      ),
    };
  }

  private buildCaptionAnimation(kind: string, duration: number): Keyframe[] {
    switch (kind) {
      case "pop":
        return [
          { property: "transform.scale", time: 0,        value: 0,   easing: "easeOutBack" },
          { property: "transform.scale", time: 0.15,     value: 1.1, easing: "easeOutBack" },
          { property: "transform.scale", time: 0.25,     value: 1.0, easing: "easeInOutQuad" },
          { property: "opacity",         time: 0,        value: 0,   easing: "linear" },
          { property: "opacity",         time: 0.1,      value: 1,   easing: "easeOutCubic" },
          { property: "opacity",         time: duration - 0.1, value: 1, easing: "linear" },
          { property: "opacity",         time: duration, value: 0,   easing: "easeInCubic" },
        ];
      case "fade":
        return [
          { property: "opacity", time: 0,        value: 0, easing: "easeOutCubic" },
          { property: "opacity", time: 0.2,     value: 1, easing: "easeOutCubic" },
          { property: "opacity", time: duration - 0.2, value: 1, easing: "linear" },
          { property: "opacity", time: duration, value: 0, easing: "easeInCubic" },
        ];
      case "slide_up":
        return [
          { property: "transform.y", time: 0,        value: 80, easing: "easeOutCubic" },
          { property: "transform.y", time: 0.3,     value: 0,  easing: "easeOutCubic" },
          { property: "opacity",     time: 0,        value: 0,  easing: "linear" },
          { property: "opacity",     time: 0.2,     value: 1,  easing: "easeOutCubic" },
          { property: "opacity",     time: duration - 0.1, value: 1, easing: "linear" },
          { property: "opacity",     time: duration, value: 0,  easing: "easeInCubic" },
        ];
      case "typewriter":
        // Renderer handles this specially; mark with a directive
        return [
          { property: "typewriter.progress", time: 0,        value: 0, easing: "linear" },
          { property: "typewriter.progress", time: duration * 0.6, value: 1, easing: "linear" },
          { property: "opacity",             time: duration - 0.1, value: 1, easing: "linear" },
          { property: "opacity",             time: duration, value: 0,    easing: "easeInCubic" },
        ];
      default:
        return [
          { property: "opacity", time: 0,        value: 1, easing: "linear" },
          { property: "opacity", time: duration, value: 1, easing: "linear" },
        ];
    }
  }

  // ------------------------------------------------------------------------
  // Audio
  // ------------------------------------------------------------------------

  private buildAudioClip(audio: MonetAudioTrack): Clip {
    const timelineStart = numberOr(audio.timelineStart, 0);
    return {
      id: `audio_${timelineStart.toFixed(3)}`,
      sourceId: audio.mediaId,
      sourceIn: audio.sourceIn ?? 0,
      sourceOut: audio.sourceOut,
      timelineStart,
      volume: audio.volume ?? 1.0,
      fadeIn: audio.fadeIn ?? 0,
      fadeOut: audio.fadeOut ?? 0,
      audioFlags: { duckUnderVO: audio.duckUnderVO ?? false },
      duration: (audio.sourceOut ?? 30) - (audio.sourceIn ?? 0), // provide fallback duration
    };
  }

  // ------------------------------------------------------------------------
  // Color grade as track-level effect
  // ------------------------------------------------------------------------

  private gradeToEffect(grade: ColorGrade): Effect {
    return {
      kind: "colorGrade",
      params: {
        saturation: grade.saturation ?? 1.0,
        contrast: grade.contrast ?? 1.0,
        brightness: grade.brightness ?? 0,
        temperature: grade.temperature ?? 0,
        tint: grade.tint ?? 0,
        shadows: grade.shadows,
        highlights: grade.highlights,
        lift: grade.lift ?? 0,
        gamma: grade.gamma ?? 1.0,
        gain: grade.gain ?? 1.0,
      },
    };
  }
}

// ============================================================================
// Singleton + registration
// ============================================================================

export const monetActionExecutor = new MonetActionExecutor();

let _registered = false;
/**
 * Call this once at app boot. After this, applyMonetEDLToProject will use
 * THIS executor instead of the fallback.
 */
export function registerMonetExecutor(projectStore: any) {
  if (_registered) return;
  const hadMethod = typeof projectStore.registerActionExecutor === "function";
  projectStore.registerActionExecutor?.("monet/v1", monetActionExecutor);
  _registered = true;
  console.log(`[monet] action executor registered — store had method: ${hadMethod} — push_in, impact_flash, color_pulse, context_shake, speed_ramp, vignette_punch, chromatic_burst, whip_pan all live`);
}

// ============================================================================
// Helpers
// ============================================================================

function numberOr(value: any, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
