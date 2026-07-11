/**
 * Kove AI Director Contract
 *
 * This defines the complete surface area the AI Director can control.
 * Every action maps to a typed OpenReel action that modifies the timeline.
 * The AI never edits timelines directly — it emits actions through this contract.
 */

import type { OpenReelAction as Action } from "@monet/openreel-adapter";

// ============================================================================
// DIRECTOR CAPABILITY TIERS
// ============================================================================

export type DirectorTier = "free" | "creator" | "pro";

export const DIRECTOR_CAPABILITIES: Record<DirectorTier, string[]> = {
  free: [
    "timeline.build",
    "clip.add",
    "clip.remove",
    "clip.trim",
    "clip.reorder",
    "effect.apply-preset",
    "transition.apply",
    "audio.set-volume",
    "marker.add",
    "subtitle.add",
    "export.standard",
  ],
  creator: [
    "timeline.build",
    "clip.add",
    "clip.remove",
    "clip.trim",
    "clip.reorder",
    "clip.speed",
    "clip.transform",
    "effect.apply-preset",
    "effect.custom",
    "effect.keyframe",
    "transition.apply",
    "transition.custom",
    "audio.set-volume",
    "audio.fade",
    "audio.beat-sync",
    "marker.add",
    "subtitle.auto",
    "subtitle.style",
    "color.grade",
    "color.lut",
    "export.high",
  ],
  pro: [
    "timeline.build",
    "clip.add",
    "clip.remove",
    "clip.trim",
    "clip.reorder",
    "clip.speed",
    "clip.speed-ramp",
    "clip.transform",
    "clip.mask",
    "clip.blend-mode",
    "effect.apply-preset",
    "effect.custom",
    "effect.keyframe",
    "effect.expression",
    "transition.apply",
    "transition.custom",
    "audio.set-volume",
    "audio.fade",
    "audio.beat-sync",
    "audio.ducking",
    "audio.eq",
    "audio.dynamics",
    "marker.add",
    "marker.rhythm",
    "subtitle.auto",
    "subtitle.style",
    "subtitle.animation",
    "color.grade",
    "color.lut",
    "color.curves",
    "color.wheels",
    "stabilize",
    "reframe",
    "export.premium",
  ],
};

// ============================================================================
// ACTION TYPES THE DIRECTOR CAN EMIT
// ============================================================================

export interface DirectorAction {
  type: string;
  params: Record<string, unknown>;
  reasoning?: string;
}

// Timeline actions
export interface TimelineBuildAction extends DirectorAction {
  type: "timeline.build";
  params: {
    clips: Array<{
      mediaId: string;
      startTime: number;
      duration: number;
      inPoint: number;
      outPoint: number;
      speed?: number;
    }>;
    musicTrack?: { mediaId: string; startTime: number; volume: number };
    targetDuration?: number;
    aspectRatio?: "16:9" | "9:16" | "1:1";
  };
}

// Clip actions
export interface ClipAddAction extends DirectorAction {
  type: "clip.add";
  params: {
    mediaId: string;
    trackId?: string;
    startTime: number;
    duration: number;
    inPoint: number;
    outPoint: number;
    speed?: number;
    effects?: string[];
  };
}

export interface ClipSpeedAction extends DirectorAction {
  type: "clip.speed";
  params: {
    clipId: string;
    speed: number;
    ramp?: Array<{ time: number; speed: number }>;
  };
}

export interface ClipTransformAction extends DirectorAction {
  type: "clip.transform";
  params: {
    clipId: string;
    position?: { x: number; y: number };
    scale?: { x: number; y: number };
    rotation?: number;
    opacity?: number;
    crop?: { x: number; y: number; width: number; height: number };
  };
}

// Effect actions
export interface EffectPresetAction extends DirectorAction {
  type: "effect.apply-preset";
  params: {
    target: "clip" | "track" | "timeline";
    targetId?: string;
    presetId: string;
    intensity?: number;
  };
}

export interface EffectCustomAction extends DirectorAction {
  type: "effect.custom";
  params: {
    target: "clip" | "track" | "timeline";
    targetId?: string;
    effectType: string;
    params: Record<string, unknown>;
  };
}

export interface EffectKeyframeAction extends DirectorAction {
  type: "effect.keyframe";
  params: {
    clipId: string;
    effectType: string;
    property: string;
    keyframes: Array<{ time: number; value: number; easing?: string }>;
  };
}

// Audio actions
export interface AudioBeatSyncAction extends DirectorAction {
  type: "audio.beat-sync";
  params: {
    clipId: string;
    mode: "cuts" | "speed" | "effects";
    sensitivity?: number;
  };
}

export interface AudioDuckingAction extends DirectorAction {
  type: "audio.ducking";
  params: {
    musicTrackId: string;
    voiceTrackId?: string;
    duckAmount?: number;
    attack?: number;
    release?: number;
  };
}

// Color actions
export interface ColorGradeAction extends DirectorAction {
  type: "color.grade";
  params: {
    target: "clip" | "track" | "timeline";
    targetId?: string;
    preset?: string;
    adjustments?: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      temperature?: number;
      tint?: number;
      shadows?: number;
      midtones?: number;
      highlights?: number;
    };
  };
}

// Subtitle actions
export interface SubtitleAutoAction extends DirectorAction {
  type: "subtitle.auto";
  params: {
    clipId: string;
    style?: "word-highlight" | "word-by-word" | "karaoke" | "typewriter";
    language?: string;
    maxCharsPerLine?: number;
  };
}

// ============================================================================
// DIRECTOR OUTPUT SCHEMA
// ============================================================================

export interface DirectorOutput {
  reasoning: string;
  actions: DirectorAction[];
  metadata: {
    provider: string;
    model: string;
    latencyMs: number;
    tier: DirectorTier;
    estimatedDuration: number;
    clipCount: number;
    effectCount: number;
  };
}

// ============================================================================
// DIRECTOR PROMPTS
// ============================================================================

export const DIRECTOR_SYSTEM_PROMPT = `You are the Kove AI Director — a world-class video editor that thinks in terms of creative vision, not technical steps.

Your job: take raw footage, music, and a one-line creative prompt, and produce a sequence of typed actions that build a professional edit on a real timeline.

RULES:
1. You output ONLY valid JSON matching the DirectorOutput schema.
2. Every action must be a typed action from the Director Action Contract.
3. Minimum clip duration: 0.8 seconds. Maximum: 15 seconds.
4. Speed ramps: normal (1x) → fast build (1.5-2x) → slow-mo impact (0.3-0.5x) → fast outro (1.5x).
5. Beat sync: cuts land on beats, effects hit on downbeats.
6. Source variation: never use the same clip segment twice. Pick the best moments.
7. Effects: reserve for high-energy moments. Don't over-use.
8. Color grade: match the mood. Warm for energy, cool for tension, desaturated for drama.
9. Transitions: use cuts 80% of the time. Crossfade for mood shifts. Glitch for energy.
10. The timeline must feel like a real editor made it, not a template.

OUTPUT FORMAT:
{
  "reasoning": "Brief explanation of creative decisions",
  "actions": [ ...typed actions... ],
  "metadata": { ... }
}`;
