import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";
import type { RhythmMap } from "../lib/edl-scoring";

/**
 * Effects are MOTIVATED, never random.
 *  impact_flash  -> strongest onset inside the shot
 *  speed_ramp    -> shots flagged with a velocity U-curve by perception
 *  context_shake -> shots overlapping a real drop candidate
 *  push_in       -> hero shots / section starts
 * Pre-climax = restraint (max 1 subtle fx). Post-climax = motivated intensity.
 */
export function placeEffectsDeterministically(
  edl: MonetEDL,
  referenceStyle: ReferenceStyle,
  rhythm: RhythmMap,
): MonetEDL {
  if (!edl.shots?.length) return edl;

  const climaxPos = referenceStyle.pacing?.climaxPosition ?? 0.5;
  const dur = edl.timeline?.duration ?? 30;
  const climaxTs = climaxPos * dur;
  const freq = referenceStyle.effects?.effectsFrequency ?? 0.3;

  const onsets = rhythm?.onsets ?? [];
  const drops = rhythm?.drop_candidates ?? [];
  const HEAVY = ["impact_flash", "speed_ramp", "color_pulse", "context_shake"];

  for (const shot of edl.shots) {
    const s = shot.timing.startTime;
    const e = s + shot.timing.duration;
    shot.effects = shot.effects ?? [];
    const isPre = e <= climaxTs;

    // ---- PRE-CLIMAX: restraint ----
    if (isPre) {
      shot.effects = shot.effects
        .filter((fx: any) => !HEAVY.includes(fx.type))
        .slice(0, 1);
      continue;
    }

    // ---- POST-CLIMAX: motivated intensity ----

    // 1) impact_flash on the strongest onset within the shot
    const inShot = onsets.filter((o) => o.time >= s && o.time < e);
    const strongest = inShot.sort((a, b) => b.strength - a.strength)[0];
    if (strongest && strongest.strength >= 0.55) {
      if (!shot.effects.some((fx: any) => fx.type === "impact_flash")) {
        shot.effects.push({
          id: `fx_${shot.id}_flash`,
          type: "impact_flash",
          intensity: Math.min(1, strongest.strength),
          startTime: Math.max(0, strongest.time - s),
          params: {
            peakBrightness: 0.85 + 0.15 * strongest.strength,
            flashFrameCount: 2,
          },
        });
      }
    }

    // 2) speed_ramp only if perception flagged a velocity U-curve
    if (
      (shot.source as any)?.hasVelocityRamp &&
      !shot.effects.some((fx: any) => fx.type === "speed_ramp")
    ) {
      shot.effects.push({
        id: `fx_${shot.id}_ramp`,
        type: "speed_ramp",
        intensity: 0.6,
        params: { entrySpeed: 1.0, anchorSpeed: 0.45, exitSpeed: 1.0, anchorAt: 0.5 },
      });
    }

    // 3) context_shake if a real drop occurs inside the shot
    if (
      drops.some((d) => d >= s && d < e) &&
      !shot.effects.some((fx: any) => fx.type === "context_shake")
    ) {
      shot.effects.push({
        id: `fx_${shot.id}_shake`,
        type: "context_shake",
        intensity: 0.7,
        params: { amplitude: 0.02, decay: 0.8 },
      });
    }

    // 4) push_in on hero shots
    if (
      (shot as any).isHero &&
      !shot.effects.some((fx: any) => fx.type === "push_in")
    ) {
      shot.effects.push({
        id: `fx_${shot.id}_push`,
        type: "push_in",
        intensity: 0.5,
        params: { startScale: 1.0, endScale: 1.08 },
      });
    }

    // Deterministic budget: keep highest-intensity fx (NO randomness)
    const cap = Math.max(1, Math.round(2 + freq * 3));
    shot.effects.sort((a: any, b: any) => (b.intensity ?? 0) - (a.intensity ?? 0));
    shot.effects = shot.effects.slice(0, cap);
  }

  return edl;
}
