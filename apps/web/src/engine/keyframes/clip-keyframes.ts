// apps/web/src/engine/keyframes/clip-keyframes.ts
// Resolves clip-level keyframes into concrete property values at a given time.

import type { Clip } from "@monet/edl";
import { resolveAnimatedValue } from "./interpolator";

export interface ResolvedClipProperties {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  playbackSpeed: number;
  saturation: number;
  brightness: number;
  vignetteAmount: number;
  chromaticAberration: number;
}

const DEFAULT_PROPS: ResolvedClipProperties = {
  scaleX: 1,
  scaleY: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  playbackSpeed: 1,
  saturation: 1,
  brightness: 0,
  vignetteAmount: 0,
  chromaticAberration: 0,
};

/**
 * Resolve clip-level keyframes at a given local time.
 * Clip keyframes use properties like "transform.scale", "transform.x",
 * "playbackSpeed", "color.saturation", etc.
 */
export function resolveClipKeyframes(
  clip: Clip,
  localTime: number,
): ResolvedClipProperties {
  const keyframes = (clip as Record<string, unknown>).keyframes as
    | Array<{ property: string; time: number; value: number; easing?: string }>
    | undefined;

  if (!keyframes || keyframes.length === 0) {
    return { ...DEFAULT_PROPS };
  }

  // Group keyframes by property
  const grouped = new Map<string, Array<{ time: number; value: number; easing?: string }>>();
  for (const kf of keyframes) {
    const existing = grouped.get(kf.property) ?? [];
    existing.push(kf);
    grouped.set(kf.property, existing);
  }

  // Sort each group by time
  for (const frames of grouped.values()) {
    frames.sort((a, b) => a.time - b.time);
  }

  const props = { ...DEFAULT_PROPS };

  // Resolve each property
  for (const [property, frames] of grouped) {
    const value = resolveAnimatedValue({ base: getDefaultForProperty(property), keyframes: frames }, localTime);
    applyProperty(props, property, value);
  }

  return props;
}

function getDefaultForProperty(property: string): number {
  if (property === "playbackSpeed") return 1;
  if (property === "opacity") return 1;
  if (property === "color.saturation") return 1;
  return 0;
}

function applyProperty(
  props: ResolvedClipProperties,
  property: string,
  value: number,
): void {
  switch (property) {
    case "transform.scale":
      props.scaleX = value;
      props.scaleY = value;
      break;
    case "transform.scaleX":
      props.scaleX = value;
      break;
    case "transform.scaleY":
      props.scaleY = value;
      break;
    case "transform.x":
      props.x = value;
      break;
    case "transform.y":
      props.y = value;
      break;
    case "transform.rotation":
      props.rotation = value;
      break;
    case "opacity":
      props.opacity = value;
      break;
    case "playbackSpeed":
      props.playbackSpeed = value;
      break;
    case "color.saturation":
      props.saturation = value;
      break;
    case "color.brightness":
      props.brightness = value;
      break;
    case "vignette.amount":
      props.vignetteAmount = value;
      break;
    case "chromaticAberration":
      props.chromaticAberration = value;
      break;
  }
}
