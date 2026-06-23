import {
  Clip,
  ClipLookupResult,
  MonetClip,
  MonetClipLookupResult,
  MonetEDL,
  MonetEffectBlock,
  MonetTransformKeyframes,
  Project,
} from "./monet-effect-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidEffectType(value: unknown): value is MonetEffectBlock["type"] {
  return (
    value === "speed_ramp" ||
    value === "impact_flash" ||
    value === "context_shake" ||
    value === "color_grade" ||
    value === "gl_transition" ||
    value === "audio_fx" ||
    value === "mask_composite"
  );
}

export function isValidEffectBlock(value: unknown): value is MonetEffectBlock {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isValidEffectType(value.type) &&
    isFiniteNumber(value.start) &&
    value.start >= 0 &&
    isFiniteNumber(value.duration) &&
    value.duration >= 0 &&
    isRecord(value.params)
  );
}

export function isValidTransformKeyframes(
  value: unknown
): value is MonetTransformKeyframes {
  if (!isRecord(value)) return false;

  if (!Array.isArray(value.position)) return false;
  if (!Array.isArray(value.scale)) return false;
  if (!Array.isArray(value.rotation)) return false;

  for (const point of value.position) {
    if (!isRecord(point)) return false;
    if (!isFiniteNumber(point.time) || point.time < 0) return false;
    if (!isFiniteNumber(point.x)) return false;
    if (!isFiniteNumber(point.y)) return false;
  }

  for (const point of value.scale) {
    if (!isRecord(point)) return false;
    if (!isFiniteNumber(point.time) || point.time < 0) return false;
    if (!isFiniteNumber(point.value)) return false;
  }

  for (const point of value.rotation) {
    if (!isRecord(point)) return false;
    if (!isFiniteNumber(point.time) || point.time < 0) return false;
    if (!isFiniteNumber(point.value)) return false;
  }

  if (value.crop !== undefined) {
    if (!Array.isArray(value.crop)) return false;

    for (const crop of value.crop) {
      if (!isRecord(crop)) return false;
      if (!isFiniteNumber(crop.time) || crop.time < 0) return false;
      if (!isFiniteNumber(crop.x)) return false;
      if (!isFiniteNumber(crop.y)) return false;
      if (!isFiniteNumber(crop.width) || crop.width <= 0) return false;
      if (!isFiniteNumber(crop.height) || crop.height <= 0) return false;
    }
  }

  return true;
}

export function findClipInProject(project: Project, clipId: string): ClipLookupResult | null {
  const clipMap = new Map<string, ClipLookupResult>();

  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      clipMap.set(clip.id, { clip, track });
    }
  }

  return clipMap.get(clipId) ?? null;
}

export function findClipInEDL(edl: MonetEDL, clipId: string): MonetClipLookupResult | null {
  const clipMap = new Map<string, MonetClipLookupResult>();

  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      clipMap.set(clip.id, { clip, track });
    }
  }

  return clipMap.get(clipId) ?? null;
}

export function getEmbeddedEDL(project: Project): MonetEDL | null {
  const maybeEDL = project.settings.monet?.edl;

  if (!maybeEDL) return null;
  if (!isRecord(maybeEDL)) return null;
  if (maybeEDL.version !== 1) return null;

  return maybeEDL as MonetEDL;
}

export function ensureClipMeta(clip: Clip): Record<string, unknown> {
  if (!isRecord(clip.meta)) {
    clip.meta = {};
  }

  return clip.meta;
}

export function getClipMetaEffects(clip: Clip): MonetEffectBlock[] {
  const meta = ensureClipMeta(clip);
  const rawEffects = meta.effects;

  if (!Array.isArray(rawEffects)) {
    meta.effects = [];
    return meta.effects as MonetEffectBlock[];
  }

  const validEffects: MonetEffectBlock[] = [];

  for (const effect of rawEffects) {
    if (!isValidEffectBlock(effect)) {
      throw new Error(`Invalid effect found on clip ${clip.id}`);
    }

    validEffects.push(effect);
  }

  meta.effects = validEffects;
  return validEffects;
}

export function upsertEffectInArray(
  effects: MonetEffectBlock[],
  nextEffect: MonetEffectBlock
): MonetEffectBlock[] {
  const indexById = new Map<string, number>();

  effects.forEach((effect, index) => {
    indexById.set(effect.id, index);
  });

  const existingIndex = indexById.get(nextEffect.id);

  if (existingIndex === undefined) {
    return [...effects, nextEffect];
  }

  const copy = effects.slice();
  copy[existingIndex] = nextEffect;
  return copy;
}

export function removeEffectFromArray(
  effects: MonetEffectBlock[],
  effectId: string
): MonetEffectBlock[] {
  return effects.filter((effect) => effect.id !== effectId);
}

export function calculateProjectDuration(project: Project): number {
  let maxDuration = 0;

  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxDuration) maxDuration = end;
    }
  }

  return maxDuration;
}

export function syncEDLDuration(edl: MonetEDL): void {
  let maxDuration = 0;

  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxDuration) maxDuration = end;
    }
  }

  edl.timeline.duration = maxDuration;
}
