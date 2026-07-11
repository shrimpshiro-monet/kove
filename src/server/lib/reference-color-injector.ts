import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function findBracketingGrades(
  colorGrades: NonNullable<ReferenceStyle["colorGrades"]>,
  time: number
): { prev: number; next: number } {
  if (colorGrades.length === 0) return { prev: -1, next: -1 };

  for (let i = 0; i < colorGrades.length - 1; i++) {
    if (time >= colorGrades[i].timestamp && time <= colorGrades[i + 1].timestamp) {
      return { prev: i, next: i + 1 };
    }
  }

  if (time < colorGrades[0].timestamp) {
    return { prev: 0, next: 0 };
  }

  return { prev: colorGrades.length - 1, next: colorGrades.length - 1 };
}

function interpolateColorGrade(
  colorGrades: NonNullable<ReferenceStyle["colorGrades"]>,
  time: number
): { saturation: number; brightness: number; contrast: number } {
  const { prev, next } = findBracketingGrades(colorGrades, time);

  if (prev === -1 || next === -1) {
    return { saturation: 1, brightness: 1, contrast: 1 };
  }

  if (prev === next) {
    const grade = colorGrades[prev];
    return {
      saturation: grade.saturation,
      brightness: grade.brightness,
      contrast: grade.contrast,
    };
  }

  const a = colorGrades[prev];
  const b = colorGrades[next];
  const t = (time - a.timestamp) / (b.timestamp - a.timestamp || 1);

  return {
    saturation: lerp(a.saturation, b.saturation, t),
    brightness: lerp(a.brightness, b.brightness, t),
    contrast: lerp(a.contrast, b.contrast, t),
  };
}

export function injectReferenceColorGrades(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle
): MonetEDL {
  const colorGrades = referenceStyle.colorGrades;
  if (!colorGrades || colorGrades.length === 0) return edl;

  for (const shot of edl.shots) {
    const midpoint = shot.timing.startTime + shot.timing.duration / 2;
    const grade = interpolateColorGrade(colorGrades, midpoint);

    const colorGradeEffect = {
      id: `fx_color_grade_${shot.id}`,
      type: "color_grade",
      intensity: 1,
      startTime: shot.timing.startTime,
      duration: shot.timing.duration,
      params: {
        saturation: grade.saturation,
        brightness: grade.brightness,
        contrast: grade.contrast,
      },
    };

    if (!shot.effects) shot.effects = [];
    shot.effects.push(colorGradeEffect);
  }

  return edl;
}
