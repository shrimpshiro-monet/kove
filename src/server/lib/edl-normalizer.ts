import type { MonetEDL, Shot, Effect, TextOverlay } from "../types/edl";
import type { RendererCapabilities } from "../types/edl-capabilities";
import {
  hasEffectCapability,
  hasTransitionCapability,
  normalizeEffectType,
  normalizeTransitionType,
} from "../types/edl-capabilities";
import { type Result, ok } from "./result";

export interface NormalizationWarning {
  code:
    | "UNSUPPORTED_TRANSITION"
    | "UNSUPPORTED_EFFECT"
    | "FACIAL_BLUR_FALLBACK"
    | "SUBJECT_MASK_FALLBACK"
    | "DEPTH_PARALLAX_FALLBACK"
    | "MOTION_BLUR_FALLBACK"
    | "RIFE_INTERPOLATION_FALLBACK"
    | "ILLEGAL_SPEED_RAMP"
    | "FONT_FALLBACK"
    | "INVALID_TEXT_OVERLAY"
    | "TIMING_CLAMPED";
  message: string;
  shotId?: string;
  effectId?: string;
  overlayId?: string;
}

export interface NormalizerOutput {
  edl: MonetEDL;
  warnings: NormalizationWarning[];
}

export interface ProjectNormalizationContext {
  hasFaceTrack?: boolean;
  faceTrackClipIds?: Set<string>;
  subjectMaskClipIds?: Set<string>;
  depthMapClipIds?: Set<string>;
  availableFonts?: Set<string>;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cloneParams(params: Record<string, number> | undefined): Record<string, number> {
  return params ? { ...params } : {};
}

function normalizeTransition(
  shot: Shot,
  capabilities: RendererCapabilities,
  warnings: NormalizationWarning[]
): Shot["transition"] {
  if (!shot.transition) {
    return undefined;
  }

  const originalType = shot.transition.type;
  const normalizedType = normalizeTransitionType(originalType);

  if (normalizedType !== "cut" && !hasTransitionCapability(capabilities, normalizedType)) {
    warnings.push({
      code: "UNSUPPORTED_TRANSITION",
      message: `Transition type '${originalType}' is not supported by this renderer. Downgraded to 'crossfade'.`,
      shotId: shot.id,
    });

    return {
      ...shot.transition,
      type: "crossfade",
      duration: isPositiveFiniteNumber(shot.transition.duration)
        ? clampNumber(shot.transition.duration, 0, 5)
        : 0.25,
    };
  }

  return {
    ...shot.transition,
    type: normalizedType as any,
    duration: isPositiveFiniteNumber(shot.transition.duration)
      ? clampNumber(shot.transition.duration, 0, 5)
      : normalizedType === "cut"
        ? 0
        : 0.25,
  };
}

function normalizeEffectForCapabilities(params: {
  shot: Shot;
  effect: Effect;
  capabilities: RendererCapabilities;
  context: ProjectNormalizationContext;
  warnings: NormalizationWarning[];
}): Effect | null {
  const { shot, effect, capabilities, context, warnings } = params;
  const originalType = effect.type;
  const normalizedType = normalizeEffectType(originalType);

  let normalizedEffect: Effect = {
    ...effect,
    type: normalizedType as Effect["type"],
    params: cloneParams(effect.params),
  };

  if (normalizedType === "facial_blur") {
    const hasFaceTrack =
      context.hasFaceTrack === true ||
      (context.faceTrackClipIds?.has(shot.source.clipId) ?? false);

    if (!capabilities.supports.facialTracking || !hasFaceTrack) {
      warnings.push({
        code: "FACIAL_BLUR_FALLBACK",
        message:
          `Facial blur requested for clip '${shot.source.clipId}', but facial tracking is unavailable. ` +
          "Downgraded to standard blur.",
        shotId: shot.id,
        effectId: effect.id,
      });

      const currentParams = normalizedEffect.params ?? {};
      normalizedEffect = {
        ...normalizedEffect,
        type: "blur" as Effect["type"],
        params: {
          ...currentParams,
          radius:
            typeof currentParams.radius === "number"
              ? currentParams.radius
              : 8,
        },
      };
    }
  }

  if (normalizedType === "subject_blur" || normalizedType === "maskComposite") {
    const hasSubjectMask = context.subjectMaskClipIds?.has(shot.source.clipId) ?? false;

    if (!capabilities.supports.subjectMasks || !hasSubjectMask) {
      warnings.push({
        code: "SUBJECT_MASK_FALLBACK",
        message:
          `Subject-mask effect '${originalType}' requested for clip '${shot.source.clipId}', ` +
          "but subject masks are unavailable. Effect disabled.",
        shotId: shot.id,
        effectId: effect.id,
      });
      return null;
    }
  }

  if (normalizedType === "depth_parallax" || normalizedType === "depthParallax") {
    const hasDepthMap = context.depthMapClipIds?.has(shot.source.clipId) ?? false;

    if (!capabilities.supports.depthParallax || !hasDepthMap) {
      warnings.push({
        code: "DEPTH_PARALLAX_FALLBACK",
        message:
          `Depth parallax requested for clip '${shot.source.clipId}', but depth maps are unavailable. Effect disabled.`,
        shotId: shot.id,
        effectId: effect.id,
      });
      return null;
    }
  }

  if (normalizedType === "motion_blur" && !capabilities.supports.motionBlur) {
    warnings.push({
      code: "MOTION_BLUR_FALLBACK",
      message: "Motion blur is unsupported by this renderer. Effect disabled.",
      shotId: shot.id,
      effectId: effect.id,
    });
    return null;
  }

  if (!hasEffectCapability(capabilities, normalizedEffect.type)) {
    warnings.push({
      code: "UNSUPPORTED_EFFECT",
      message: `Effect type '${originalType}' is unsupported by this renderer. Effect disabled.`,
      shotId: shot.id,
      effectId: effect.id,
    });
    return null;
  }

  return normalizedEffect;
}

function normalizeEffects(
  shot: Shot,
  capabilities: RendererCapabilities,
  context: ProjectNormalizationContext,
  warnings: NormalizationWarning[]
): Effect[] {
  if (!Array.isArray(shot.effects) || shot.effects.length === 0) {
    return [];
  }

  const normalizedEffects: Effect[] = [];

  for (const effect of shot.effects) {
    const normalizedEffect = normalizeEffectForCapabilities({
      shot,
      effect,
      capabilities,
      context,
      warnings,
    });

    if (normalizedEffect) {
      normalizedEffects.push(normalizedEffect);
    }
  }

  return normalizedEffects;
}

function normalizeTiming(
  shot: Shot,
  capabilities: RendererCapabilities,
  warnings: NormalizationWarning[]
): Shot["timing"] {
  const timing = {
    ...shot.timing,
    startTime: Number.isFinite(shot.timing.startTime)
      ? Math.max(0, shot.timing.startTime)
      : 0,
    duration: isPositiveFiniteNumber(shot.timing.duration)
      ? Math.max(0.05, shot.timing.duration)
      : 1,
    speed: isPositiveFiniteNumber(shot.timing.speed)
      ? clampNumber(shot.timing.speed, 0.05, 16)
      : 1,
  };

  if (!Number.isFinite(shot.timing.startTime) || !isPositiveFiniteNumber(shot.timing.duration)) {
    warnings.push({
      code: "TIMING_CLAMPED",
      message: "Shot timing contained invalid startTime or duration. Values were clamped.",
      shotId: shot.id,
    });
  }

  if (timing.speedRamp) {
    const ramp = timing.speedRamp;

    const startSpeed = isPositiveFiniteNumber(ramp.startSpeed)
      ? clampNumber(ramp.startSpeed, 0.05, 16)
      : 0.1;

    const endSpeed = isPositiveFiniteNumber(ramp.endSpeed)
      ? clampNumber(ramp.endSpeed, 0.05, 16)
      : 0.1;

    if (startSpeed !== ramp.startSpeed || endSpeed !== ramp.endSpeed) {
      warnings.push({
        code: "ILLEGAL_SPEED_RAMP",
        message: "Speed ramp values must be strictly greater than 0. Values were clamped.",
        shotId: shot.id,
      });
    }

    timing.speedRamp = {
      ...ramp,
      startSpeed,
      endSpeed,
    };
  }

  const interpolation = (timing as unknown as { interpolation?: { enabled?: boolean; model?: string } }).interpolation;

  if (
    interpolation?.enabled === true &&
    interpolation.model === "rife" &&
    !capabilities.supports.rifeInterpolation
  ) {
    warnings.push({
      code: "RIFE_INTERPOLATION_FALLBACK",
      message: "RIFE interpolation requested but unsupported by this renderer. Interpolation disabled.",
      shotId: shot.id,
    });

    (timing as unknown as { interpolation?: { enabled: boolean; model?: string } }).interpolation = {
      ...interpolation,
      enabled: false,
    };
  }

  return timing;
}

function normalizeTextOverlay(
  overlay: TextOverlay,
  capabilities: RendererCapabilities,
  context: ProjectNormalizationContext,
  warnings: NormalizationWarning[]
): TextOverlay | null {
  if (!overlay.id || typeof overlay.text !== "string") {
    warnings.push({
      code: "INVALID_TEXT_OVERLAY",
      message: "Text overlay is missing id or text. Overlay omitted.",
      overlayId: overlay.id,
    });
    return null;
  }

  const startTime = Number.isFinite(overlay.startTime) ? Math.max(0, overlay.startTime) : 0;
  const endTime = Number.isFinite(overlay.endTime)
    ? Math.max(startTime + 0.05, overlay.endTime)
    : startTime + 2;

  const normalizedOverlay: TextOverlay = {
    ...overlay,
    startTime,
    endTime,
    style: overlay.style ? { ...overlay.style } : undefined,
  };

  const requestedFont = normalizedOverlay.style?.fontFamily;

  if (requestedFont) {
    const fontAvailable =
      capabilities.supports.customFonts ||
      context.availableFonts?.has(requestedFont) === true ||
      requestedFont.includes("system-ui") ||
      requestedFont.includes("sans-serif");

    if (!fontAvailable) {
      warnings.push({
        code: "FONT_FALLBACK",
        message: `Font family '${requestedFont}' is unsupported or unavailable. Falling back to system sans-serif.`,
        overlayId: overlay.id,
      });

      normalizedOverlay.style = {
        ...normalizedOverlay.style,
        fontFamily: "system-ui, sans-serif",
      };
    }
  }

  return normalizedOverlay;
}

/**
 * Normalizes an unbounded Creative/Monet EDL into a capability-safe, renderer-ready MonetEDL.
 * This is non-destructive: it returns a cloned EDL with unsupported features downgraded or removed.
 */
export function normalizeCreativeEDL(
  edl: MonetEDL,
  capabilities: RendererCapabilities,
  projectContext: ProjectNormalizationContext = {}
): Result<NormalizerOutput, Error> {
  const warnings: NormalizationWarning[] = [];

  const normalizedShots: Shot[] = edl.shots.map((shot) => {
    const normalizedShot: Shot = {
      ...shot,
      source: { ...shot.source },
      timing: normalizeTiming(shot, capabilities, warnings),
      transition: normalizeTransition(shot, capabilities, warnings),
      effects: normalizeEffects(shot, capabilities, projectContext, warnings),
      transform: shot.transform ? structuredClone(shot.transform) : undefined,
      compositing: shot.compositing ? { ...shot.compositing } : undefined,
    };

    return normalizedShot;
  });

  const normalizedOverlays: TextOverlay[] = [];

  for (const overlay of edl.textOverlays ?? []) {
    const normalizedOverlay = normalizeTextOverlay(
      overlay,
      capabilities,
      projectContext,
      warnings
    );

    if (normalizedOverlay) {
      normalizedOverlays.push(normalizedOverlay);
    }
  }

  return ok({
    edl: {
      ...edl,
      timeline: { ...edl.timeline, resolution: { ...edl.timeline.resolution } },
      metadata: { ...edl.metadata },
      shots: normalizedShots,
      textOverlays: normalizedOverlays,
      motionTracks: edl.motionTracks ? structuredClone(edl.motionTracks) : undefined,
      planarTracks: edl.planarTracks ? structuredClone(edl.planarTracks) : undefined,
      masks: edl.masks ? structuredClone(edl.masks) : undefined,
      music: edl.music ? structuredClone(edl.music) : undefined,
      globalEffects: edl.globalEffects ? structuredClone(edl.globalEffects) : undefined,
    },
    warnings,
  });
}

export type { MonetEDL };
