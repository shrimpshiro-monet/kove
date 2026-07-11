import type { MonetEDL, Effect } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

interface RefEffect {
  type: string;
  intensity: number;
  timing: "start" | "middle" | "end" | "throughout";
  params?: Record<string, number>;
}

interface RefShot {
  shotIndex: number;
  startTime: number;
  duration: number;
  effects: RefEffect[];
  transition?: { type: string; duration: number };
}

let effectIdCounter = 0;
const nextId = (prefix: string) => `ref_${prefix}_${Date.now()}_${++effectIdCounter}`;

function mapRefEffectToEDLEffect(
  refEffect: RefEffect,
  shotStartTime: number,
  shotDuration: number,
): { id: string; type: string; intensity: number; startTime?: number; duration?: number; params?: Record<string, number> } {
  let startTime: number;
  let duration: number;

  switch (refEffect.timing) {
    case "start":
      startTime = shotStartTime;
      duration = Math.min(0.15, shotDuration * 0.15);
      break;
    case "end":
      startTime = shotStartTime + shotDuration * 0.85;
      duration = Math.min(0.15, shotDuration * 0.15);
      break;
    case "middle":
      startTime = shotStartTime + shotDuration * 0.4;
      duration = Math.min(0.2, shotDuration * 0.2);
      break;
    case "throughout":
    default:
      startTime = shotStartTime;
      duration = shotDuration;
      break;
  }

  return {
    id: nextId(refEffect.type),
    type: refEffect.type,
    intensity: Math.max(0, Math.min(1, refEffect.intensity)),
    startTime,
    duration,
    params: refEffect.params,
  };
}

function findMatchingRefShot(
  edlShotStartTime: number,
  refShots: RefShot[],
  tolerance: number,
): RefShot | undefined {
  let best: RefShot | undefined;
  let bestDist = tolerance;
  for (const rs of refShots) {
    const dist = Math.abs(rs.startTime - edlShotStartTime);
    if (dist < bestDist) {
      bestDist = dist;
      best = rs;
    }
  }
  return best;
}

function pickFromVocabulary(
  refStyle: ReferenceStyle,
  shotIndex: number,
): RefEffect[] {
  const vocab = refStyle.effectVocabulary;
  if (!vocab || vocab.length === 0) return [];

  const allEffects: RefEffect[] = [];
  for (const entry of vocab) {
    for (const e of entry.effects) {
      allEffects.push(e);
    }
  }
  if (allEffects.length === 0) return [];

  const effectCounts = new Map<string, number>();
  for (const e of allEffects) {
    effectCounts.set(e.type, (effectCounts.get(e.type) ?? 0) + 1);
  }

  const sorted = [...effectCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalEffects = allEffects.length;

  const selected: RefEffect[] = [];
  let remaining = Math.min(2, sorted.length);

  for (const [type, count] of sorted) {
    if (remaining <= 0) break;
    const freq = count / totalEffects;
    if (freq < 0.05) continue;

    const matching = allEffects.filter((e) => e.type === type);
    const pick = matching[shotIndex % matching.length];
    selected.push({ ...pick, timing: pick.timing ?? "throughout" });
    remaining--;
  }

  return selected;
}

function isGenericEffect(effect: { id: string; type: string }): boolean {
  return effect.id.startsWith("effect-glow-");
}

function normalizeEffectType(type: string): string {
  const map: Record<string, string> = {
    morph_cut: "glitch",
    push_in: "zoom_pulse",
    pull_out: "zoom_pulse",
    glitch: "glitch",
    shake: "shake",
    zoom: "zoom_pulse",
    flash: "glow",
    flash_white: "glow",
    chromatic: "chromatic_aberration",
    desaturation: "saturation",
    color_shift: "color_shift",
    speed_ramp: "posterize_time",
    impact: "glow",
    glow: "glow",
    vignette: "vignette_pro",
    blur: "blur",
    contrast: "contrast",
    saturation: "saturation",
    brightness: "brightness",
    rgb_split: "rgb_split",
    radial_blur: "directional_blur",
  };
  return map[type] ?? type;
}

export function injectReferenceEffects(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle,
): MonetEDL {
  if (!referenceStyle.effectVocabulary && !referenceStyle.flashFrames && !referenceStyle.velocityRamps) {
    return edl;
  }

  const refShots = referenceStyle.effectVocabulary ?? [];
  const shots = edl.shots.map((shot, i) => {
    const existingEffects: Effect[] = (shot.effects ?? []).filter((e) => !isGenericEffect(e));
    const refMatch = findMatchingRefShot(shot.timing.startTime, refShots, 1.0);

    let newEffects: Effect[];

    if (refMatch && refMatch.effects.length > 0) {
      const refEffects = refMatch.effects.map((re) =>
        mapRefEffectToEDLEffect(
          { ...re, type: normalizeEffectType(re.type) },
          shot.timing.startTime,
          shot.timing.duration,
        ),
      ) as Effect[];
      newEffects = [...existingEffects, ...refEffects];
    } else {
      const vocabEffects = pickFromVocabulary(referenceStyle, i);
      if (vocabEffects.length > 0) {
        const mapped = vocabEffects.map((re) =>
          mapRefEffectToEDLEffect(
            { ...re, type: normalizeEffectType(re.type) },
            shot.timing.startTime,
            shot.timing.duration,
          ),
        ) as Effect[];
        newEffects = [...existingEffects, ...mapped];
      } else {
        newEffects = existingEffects;
      }
    }

    return { ...shot, effects: newEffects };
  });

  let enrichedShots = [...shots];

  if (referenceStyle.flashFrames && referenceStyle.flashFrames.length > 0) {
    for (const ff of referenceStyle.flashFrames) {
      const targetShot = enrichedShots.find(
        (s) =>
          ff.timestamp >= s.timing.startTime &&
          ff.timestamp < s.timing.startTime + s.timing.duration,
      );
      if (targetShot) {
        const flashEffect = {
          id: nextId("impact_flash"),
          type: "flash_white",
          intensity: ff.brightness,
          startTime: ff.timestamp,
          duration: 0.033,
        } as unknown as Effect;
        const existing = targetShot.effects ?? [];
        targetShot.effects = [...existing, flashEffect];
      }
    }
  }

  if (referenceStyle.velocityRamps && referenceStyle.velocityRamps.length > 0) {
    for (const vr of referenceStyle.velocityRamps) {
      const targetShot = enrichedShots.find(
        (s) =>
          vr.startTime >= s.timing.startTime &&
          vr.startTime < s.timing.startTime + s.timing.duration,
      );
      if (targetShot) {
        const easingMap: Record<string, string> = {
          linear: "linear",
          ease_in: "ease-in",
          ease_out: "ease-out",
          ease_in_out: "ease-in-out",
        };
        targetShot.timing = {
          ...targetShot.timing,
          speedRamp: {
            startSpeed: vr.entrySpeed,
            endSpeed: vr.exitSpeed,
            easing: (easingMap[vr.easing] ?? "ease-in-out") as any,
          },
        };
      }
    }
  }

  const breakdown = referenceStyle.effects?.transitionsBreakdown ?? {
    cutPercentage: 0.7,
    crossfadePercentage: 0.2,
    otherPercentage: 0.1,
  };

  const flashFrames = referenceStyle.flashFrames ?? [];

  for (let i = 0; i < enrichedShots.length; i++) {
    const shot = enrichedShots[i];
    const rand = Math.random();
    let transitionType: string;

    if (rand < breakdown.cutPercentage) {
      transitionType = "cut";
    } else if (rand < breakdown.cutPercentage + breakdown.crossfadePercentage) {
      transitionType = "crossfade";
    } else {
      const hasFlashFrame = flashFrames.some(
        (f) =>
          f.timestamp >= shot.timing.startTime &&
          f.timestamp < shot.timing.startTime + shot.timing.duration,
      );
      transitionType = hasFlashFrame ? "flash" : "dissolve";
    }

    if (transitionType !== "cut") {
      shot.transition = {
        type: transitionType as any,
        duration: referenceStyle.rhythm?.avgShotDuration
          ? referenceStyle.rhythm.avgShotDuration * 0.15
          : 0.2,
      };
    }
  }

  return { ...edl, shots: enrichedShots };
}
