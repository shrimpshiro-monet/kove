/**
 * Kove EDL → Actions Compiler
 *
 * Converts a DirectorOutput (AI decisions) into a stream of typed OpenReel actions.
 * This is the deepest piece of engineering — it's the compiler that turns creative
 * intent into timeline mutations.
 */

import type { OpenReelAction as Action } from "@monet/openreel-adapter";
import type { DirectorOutput, DirectorAction } from "./contract";
import type { ProjectEDL as MonetEDL } from "@monet/edl";
import { lookupCapability } from "./capabilities/registry";
import type { CapabilityContext } from "./capabilities/types";

// ============================================================================
// COMPILER
// ============================================================================

export interface CompileResult {
  actions: Action[];
  transaction: {
    id: string;
    label: string;
    actions: Action[];
  };
  metadata: {
    totalActions: number;
    clipCount: number;
    effectCount: number;
    compileTimeMs: number;
  };
}

let actionCounter = 0;
function nextId(): string {
  return `kove-${Date.now()}-${++actionCounter}`;
}

function timestamp(): number {
  return Date.now();
}

/**
 * Compile a DirectorOutput into OpenReel actions.
 * Wraps everything in a TRANSACTION so the entire AI generation
 * is a single undoable atomic unit.
 */
export function compileDirectorOutput(output: DirectorOutput, context?: CapabilityContext): CompileResult {
  const start = performance.now();
  const actions: Action[] = [];

  // 1. Clear existing timeline (atomic)
  actions.push({
    type: "timeline/clear" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {},
  });

  // 2. Process each director action
  for (const da of output.actions) {
    const compiled = compileAction(da, context);
    if (compiled) {
      actions.push(...(Array.isArray(compiled) ? compiled : [compiled]));
    }
  }

  const transactionId = nextId();
  const transaction = {
    id: transactionId,
    label: `AI Director: ${output.reasoning.slice(0, 60)}`,
    actions,
  };

  return {
    actions,
    transaction,
    metadata: {
      totalActions: actions.length,
      clipCount: output.metadata.clipCount,
      effectCount: output.metadata.effectCount,
      compileTimeMs: performance.now() - start,
    },
  };
}

/**
 * Compile a single DirectorAction into OpenReel action(s).
 * Consults the registry first, falls back to legacy switch for unmapped types.
 */
function compileAction(da: DirectorAction, context?: CapabilityContext): Action | Action[] | null {
  // --- Step 1: Try registry lookup ---
  // Map DirectorAction type to capability ID
  const capId = mapActionTypeToCapabilityId(da);
  if (capId) {
    const cap = lookupCapability(capId);
    if (cap) {
      if (cap.status !== "alpha") {
        console.warn(`[Compiler] skipping ${capId} (status: ${cap.status})`);
        return null;
      }
      try {
        const validated = (cap.params as any).safeParse
          ? (cap.params as any).safeParse(da.params)
          : { success: true, data: da.params };
        if (!validated.success) {
          console.warn(`[Compiler] validation failed for ${capId}:`, validated.error?.message);
          return null;
        }
        const actions = (cap as any).compile(validated.data, context ?? {});
        return actions as Action | Action[];
      } catch (err) {
        console.warn(`[Compiler] capability ${capId} compile failed:`, (err as Error).message);
        return null;
      }
    }
  }

  // --- Step 2: Legacy switch fallback ---
  switch (da.type) {
    case "timeline.build":
      return compileTimelineBuild(da.params as any);

    case "clip.add":
      return compileClipAdd(da.params as any);

    case "clip.speed":
      return compileClipSpeed(da.params as any);

    case "clip.transform":
      return compileClipTransform(da.params as any);

    case "effect.apply-preset":
      return compileEffectPreset(da.params as any);

    case "effect.custom":
      return compileEffectCustom(da.params as any);

    case "effect.keyframe":
      return compileEffectKeyframe(da.params as any);

    case "audio.beat-sync":
      return compileAudioBeatSync(da.params as any);

    case "audio.ducking":
      return compileAudioDucking(da.params as any);

    case "audio.set-volume":
      return compileAudioVolume(da.params as any);

    case "audio.fade":
      return compileAudioFade(da.params as any);

    case "color.grade":
      return compileColorGrade(da.params as any);

    case "transition.apply":
      return compileTransition(da.params as any);

    case "marker.add":
      return compileMarker(da.params as any);

    case "subtitle.auto":
      return compileSubtitle(da.params as any);

    case "stabilize":
      return compileStabilize(da.params as any);

    case "reframe":
      return compileReframe(da.params as any);

    default:
      console.warn(`[Compiler] Unknown action type: ${da.type}`);
      return null;
  }
}

/**
 * Map a DirectorAction type to a capability ID.
 * Returns null if no mapping exists (falls through to legacy switch).
 */
function mapActionTypeToCapabilityId(da: DirectorAction): string | null {
  // Direct mappings for specific action types
  const directMap: Record<string, string> = {
    "clip.speed-ramp": "speed-ramp",
    "audio.beat-sync": "beat-sync",
    "audio.ducking": "ducking",
    "audio.set-volume": "volume",
    "audio.fade": "audio-fade",
    "color.grade": "color-grade",
    "subtitle.auto": "subtitle-auto",
    "subtitle.animation": "kinetic-caption",
    "stabilize": "stabilize",
    "reframe": "reframe",
  };

  if (directMap[da.type]) return directMap[da.type];

  // effect.custom: extract effectType from params and look up
  if (da.type === "effect.custom") {
    const params = da.params as any;
    if (params?.effectType) {
      const effectTypeMap: Record<string, string> = {
        "push_in": "push-in",
        "pull_out": "pull-out",
        "context_shake": "shake",
        "impact_flash": "flash",
        "whip_pan": "whip-pan-effect",
        "freeze_frame": "freeze-frame",
        "background_blur": "background-blur",
        "color_pulse": "color-pulse",
        "vignette_punch": "vignette-punch",
        "chromatic_burst": "chromatic-burst",
        "echo": "echo",
        "gaussian_blur": "gaussian-blur",
        "sharpen": "sharpen",
        "invert_color": "invert-color",
        "camera_blur": "camera-blur",
        "directional_blur": "directional-blur",
        "unsharp_mask": "unsharp-mask",
        "player_glow": "player-glow",
        "parallax_3d": "parallax-3d",
        "reduce_interlace_flicker": "interlace-flicker",
        "speed_ramp": "speed-ramp-effect",
        "gl_transition": "gl-transition-effect",
        "title_card": "title-card",
        "lower_third": "lower-third",
        "sfx_synthesis": "sfx-synthesis",
      };
      if (effectTypeMap[params.effectType]) return effectTypeMap[params.effectType];
    }
  }

  // transition.apply: extract transition type from params and look up
  if (da.type === "transition.apply") {
    const params = da.params as any;
    if (params?.type) {
      // Check if the transition type is a registered capability
      const cap = lookupCapability(params.type);
      if (cap && cap.status === "alpha") return params.type;
    }
  }

  return null;
}

// ============================================================================
// INDIVIDUAL COMPILERS
// ============================================================================

function compileTimelineBuild(params: any): Action[] {
  const actions: Action[] = [];

  // Create video track
  actions.push({
    type: "track/create" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: { trackId: "video-main", trackType: "video", name: "Main Video" },
  });

  // Create audio track for music
  actions.push({
    type: "track/create" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: { trackId: "audio-music", trackType: "audio", name: "Music" },
  });

  // Add each clip
  if (params.clips) {
    for (const clip of params.clips) {
      actions.push({
        type: "clip/add" as any,
        id: nextId(),
        timestamp: timestamp(),
        params: {
          clipId: nextId(),
          trackId: "video-main",
          mediaId: clip.mediaId,
          startTime: clip.startTime,
          duration: clip.duration,
          inPoint: clip.inPoint,
          outPoint: clip.outPoint,
          speed: clip.speed ?? 1,
        },
      });
    }
  }

  // Add music track
  if (params.musicTrack) {
    actions.push({
      type: "clip/add" as any,
      id: nextId(),
      timestamp: timestamp(),
      params: {
        clipId: nextId(),
        trackId: "audio-music",
        mediaId: params.musicTrack.mediaId,
        startTime: params.musicTrack.startTime ?? 0,
        duration: params.targetDuration ?? 30,
        inPoint: 0,
        outPoint: params.targetDuration ?? 30,
        volume: params.musicTrack.volume ?? 0.8,
      },
    });
  }

  return actions;
}

function compileClipAdd(params: any): Action {
  return {
    type: "clip/add" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: nextId(),
      trackId: params.trackId ?? "video-main",
      mediaId: params.mediaId,
      startTime: params.startTime,
      duration: params.duration,
      inPoint: params.inPoint,
      outPoint: params.outPoint,
      speed: params.speed ?? 1,
    },
  };
}

function compileClipSpeed(params: any): Action[] {
  const actions: Action[] = [];

  // Set base speed
  actions.push({
    type: "clip/update" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: { clipId: params.clipId, speed: params.speed },
  });

  // Add speed ramp keyframes if provided
  if (params.ramp?.length) {
    for (const point of params.ramp) {
      actions.push({
        type: "keyframe/add" as any,
        id: nextId(),
        timestamp: timestamp(),
        params: {
          clipId: params.clipId,
          property: "speed",
          time: point.time,
          value: point.speed,
          easing: "ease-in-out",
        },
      });
    }
  }

  return actions;
}

function compileClipTransform(params: any): Action {
  return {
    type: "transform/update" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      ...params,
    },
  };
}

function compileEffectPreset(params: any): Action {
  return {
    type: "effect/apply" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      target: params.target,
      targetId: params.targetId,
      kind: "preset",
      presetId: params.presetId,
      intensity: params.intensity ?? 1,
    },
  };
}

function compileEffectCustom(params: any): Action {
  return {
    type: "effect/apply" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      target: params.target,
      targetId: params.targetId,
      kind: "custom",
      effectType: params.effectType,
      params: params.params,
    },
  };
}

function compileEffectKeyframe(params: any): Action[] {
  return params.keyframes.map((kf: any) => ({
    type: "keyframe/add" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      effectType: params.effectType,
      property: params.property,
      time: kf.time,
      value: kf.value,
      easing: kf.easing ?? "linear",
    },
  }));
}

function compileAudioBeatSync(params: any): Action {
  return {
    type: "audio/beat-sync" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      mode: params.mode,
      sensitivity: params.sensitivity ?? 0.5,
    },
  };
}

function compileAudioDucking(params: any): Action {
  return {
    type: "audio/ducking" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      musicTrackId: params.musicTrackId,
      voiceTrackId: params.voiceTrackId,
      duckAmount: params.duckAmount ?? 0.3,
      attack: params.attack ?? 0.1,
      release: params.release ?? 0.3,
    },
  };
}

function compileAudioVolume(params: any): Action {
  return {
    type: "clip/update" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: { clipId: params.clipId, volume: params.volume },
  };
}

function compileAudioFade(params: any): Action {
  return {
    type: "clip/update" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      fade: { fadeIn: params.fadeIn ?? 0, fadeOut: params.fadeOut ?? 0 },
    },
  };
}

function compileColorGrade(params: any): Action {
  return {
    type: "effect/apply" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      target: params.target,
      targetId: params.targetId,
      kind: "color-grading",
      preset: params.preset,
      adjustments: params.adjustments,
    },
  };
}

function compileTransition(params: any): Action {
  return {
    type: "transition/add" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipAId: params.clipAId,
      clipBId: params.clipBId,
      type: params.type ?? "crossfade",
      duration: params.duration ?? 0.5,
      params: params.params ?? {},
    },
  };
}

function compileMarker(params: any): Action {
  return {
    type: "marker/add" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      time: params.time,
      label: params.label ?? "beat",
      color: params.color ?? "#FF6B6B",
    },
  };
}

function compileSubtitle(params: any): Action {
  return {
    type: "subtitle/add" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      style: params.style ?? "word-highlight",
      language: params.language ?? "en",
      maxCharsPerLine: params.maxCharsPerLine ?? 40,
    },
  };
}

function compileStabilize(params: any): Action {
  return {
    type: "clip/update" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      stabilization: {
        enabled: true,
        strength: params.strength ?? 0.5,
        cropMode: params.cropMode ?? "auto",
      },
    },
  };
}

function compileReframe(params: any): Action {
  return {
    type: "clip/update" as any,
    id: nextId(),
    timestamp: timestamp(),
    params: {
      clipId: params.clipId,
      reframe: {
        targetRatio: params.targetRatio ?? "9:16",
        lockSubject: params.lockSubject ?? "center",
      },
    },
  };
}

// ============================================================================
// EDL → DIRECTOR OUTPUT (for when we have an EDL but need actions)
// ============================================================================

/**
 * Convert a MonetEDL into DirectorOutput actions.
 * Used when the EDL was generated outside the Director contract
 * (e.g., from the existing generate-edl pipeline).
 */
export function edlToDirectorOutput(edl: MonetEDL): DirectorOutput {
  const actions: DirectorAction[] = [];

  // Build timeline from EDL tracks
  for (const track of edl.timeline.tracks) {
    if (track.type === "video") {
      for (const clip of track.clips) {
        actions.push({
          type: "clip.add",
          params: {
            mediaId: clip.mediaId,
            trackId: track.id,
            startTime: clip.startTime,
            duration: clip.duration,
            inPoint: clip.inPoint,
            outPoint: clip.outPoint,
            speed: clip.speed,
          },
        });

        // Add effects from EDL
        if (clip.effects?.length) {
          for (const effect of clip.effects) {
            actions.push({
              type: "effect.custom",
              params: {
                target: "clip",
                targetId: clip.id,
                effectType: effect.type,
                params: effect.params,
              },
            });
          }
        }
      }
    }

    if (track.type === "audio") {
      for (const clip of track.clips) {
        actions.push({
          type: "clip.add",
          params: {
            mediaId: clip.mediaId,
            trackId: track.id,
            startTime: clip.startTime,
            duration: clip.duration,
            inPoint: clip.inPoint,
            outPoint: clip.outPoint,
          },
        });
      }
    }
  }

  // Add markers
  if (edl.timeline.markers?.length) {
    for (const marker of edl.timeline.markers) {
      actions.push({
        type: "marker.add",
        params: {
          time: marker.time,
          label: marker.label ?? marker.type ?? "marker",
        },
      });
    }
  }

  return {
    reasoning: "EDL imported from Director pipeline",
    actions,
    metadata: {
      provider: "edl-compiler",
      model: "deterministic",
      latencyMs: 0,
      tier: "pro",
      estimatedDuration: edl.timeline.duration,
      clipCount: edl.timeline.tracks.reduce(
        (sum, t) => sum + t.clips.length,
        0,
      ),
      effectCount: edl.timeline.tracks.reduce(
        (sum, t) =>
          sum + t.clips.reduce((s, c) => s + (c.effects?.length ?? 0), 0),
        0,
      ),
    },
  };
}
