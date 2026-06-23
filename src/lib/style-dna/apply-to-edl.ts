import type { StyleDNA } from "./types";

interface ApplyResult {
  edl: any;
  summary: {
    heroShots: number;
    globalEffectsApplied: number;
    heroEffectsApplied: number;
    beatTriggeredEffects: number;
    dropTriggeredEffects: number;
  };
}

export function applyStyleDNAToEdl(edl: any, dna: StyleDNA): ApplyResult {
  const summary = {
    heroShots: 0,
    globalEffectsApplied: 0,
    heroEffectsApplied: 0,
    beatTriggeredEffects: 0,
    dropTriggeredEffects: 0,
  };

  if (!edl?.shots?.length) return { edl, summary };

  const next = structuredClone(edl);

  next.globalEffects = next.globalEffects ?? {};
  next.globalEffects.colorGrade = dna.id;
  next.globalEffects.gradeParams = dna.grade;
  next.globalEffects.frameRateFeel = dna.timing.frameRateFeel;
  next.globalEffects.cameraEnergy = dna.camera.energy;
  next.globalEffects.defaultTextStyle = dna.graphics.text;

  const heroShotIds = new Set<string>();
  for (const shot of next.shots) {
    if (shot.styleTags?.includes("hero_moment")) {
      heroShotIds.add(shot.id);
    }
  }
  summary.heroShots = heroShotIds.size;

  const dropTimestamps: number[] = (next.musicStructure?.drops ?? []).map(
    (ms: number) => ms / 1000,
  );

  const beatTimestamps: number[] = next.music?.beatGrid ?? [];

  for (const shot of next.shots) {
    shot.effects = shot.effects ?? [];
    const shotStart = shot.timing?.startTime ?? 0;
    const shotDuration = shot.timing?.duration ?? 2.0;
    const shotEnd = shotStart + shotDuration;

    const isHero = heroShotIds.has(shot.id);
    const startsOnBeat = beatTimestamps.some(
      (b) => Math.abs(b - shotStart) < 0.1,
    );
    const startsOnDrop = dropTimestamps.some(
      (d) => Math.abs(d - shotStart) < 0.15,
    );
    const containsDrop = dropTimestamps.some(
      (d) => d >= shotStart && d <= shotEnd,
    );

    for (const eff of dna.globalEffects?.effects ?? []) {
      if (eff.enabled === false) continue;

      const triggerOn = eff.triggerOnAudio?.on;

      if (triggerOn === "beat" && !startsOnBeat) continue;
      if (triggerOn === "drop" && !startsOnDrop && !containsDrop) continue;

      const isContinuous =
        !triggerOn ||
        eff.type === "noise_grain" ||
        eff.type === "scanlines" ||
        eff.type === "vhs_tracking" ||
        eff.type === "halftone_benday" ||
        eff.type === "vignette" ||
        eff.type === "duotone";

      const intensity = clamp(
        numberOr((eff.params as any)?.intensity, 0.7),
        0,
        1,
      );

      shot.effects.push({
        type: eff.type,
        intensity,
        startTime: 0,
        duration: isContinuous ? shotDuration : Math.min(0.4, shotDuration),
        params: eff.params ?? {},
        source: "style_dna_global",
      });

      summary.globalEffectsApplied++;
      if (triggerOn === "beat") summary.beatTriggeredEffects++;
      if (triggerOn === "drop") summary.dropTriggeredEffects++;
    }

    if (isHero) {
      for (const eff of dna.heroEffects?.effects ?? []) {
        if (eff.enabled === false) continue;

        const intensity = clamp(
          numberOr((eff.params as any)?.intensity, 0.85),
          0,
          1,
        );

        const heroDuration = Math.min(0.35, shotDuration * 0.6);

        shot.effects.push({
          type: eff.type,
          intensity,
          startTime: 0,
          duration: heroDuration,
          params: eff.params ?? {},
          source: "style_dna_hero",
        });

        summary.heroEffectsApplied++;
      }
    }

    if (dna.timing.speedRampStyle === "punch" && isHero) {
      shot.timing = shot.timing ?? {};
      shot.timing.speed = 0.4;
    } else if (dna.timing.speedRampStyle === "slowburn" && isHero) {
      shot.timing = shot.timing ?? {};
      shot.timing.speed = 0.6;
    } else if (dna.timing.speedRampStyle === "whip") {
      shot.timing = shot.timing ?? {};
      shot.timing.speed = 1.4;
    }
  }

  const MIN_EFFECTS_PER_SHOT = 3;
  const MIN_HERO_EFFECTS = 5;

  for (const shot of next.shots) {
    const isHero = heroShotIds.has(shot.id);
    const targetCount = isHero ? MIN_HERO_EFFECTS : MIN_EFFECTS_PER_SHOT;

    while (shot.effects.length < targetCount) {
      const pool = isHero
        ? [...(dna.heroEffects?.effects ?? []), ...(dna.globalEffects?.effects ?? [])]
        : (dna.globalEffects?.effects ?? []);

      if (pool.length === 0) break;

      const eff = pool[shot.effects.length % pool.length];
      shot.effects.push({
        type: eff.type,
        intensity: clamp(
          numberOr((eff.params as any)?.intensity, 0.7),
          0,
          1,
        ),
        startTime: 0,
        duration: shot.timing?.duration ?? 2.0,
        params: eff.params ?? {},
        source: "style_dna_floor",
      });

      summary.globalEffectsApplied++;
    }
  }

  next.meta = next.meta ?? {};
  next.meta.styleDNA = dna.id;
  next.meta.styleDNAName = dna.name;
  next.meta.styleConfidence = dna.confidence;
  next.meta.styleApplicationSummary = summary;

  return { edl: next, summary };
}

function numberOr(v: any, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
