import type { MonetEDL } from "../types/edl";
import type { EditIntensity, StyleDirectives } from "./style-directives";

function makeEffect(id: string, params: Record<string, unknown> = {}) {
  return {
    id,
    type: id,
    ...params,
    params,
  };
}

function shouldApplyEvery(index: number, frequency: EditIntensity): boolean {
  if (frequency === "extreme") return true;
  if (frequency === "high") return index % 2 === 0;
  if (frequency === "medium") return index % 3 === 0;
  return index % 5 === 0;
}

function normalizeEffects(effects: unknown): any[] {
  return Array.isArray(effects) ? [...effects] : [];
}

export function enhanceEDLWithStyleDirectives(
  edl: MonetEDL,
  directives: StyleDirectives
): MonetEDL {
  // Global intensity scales all enhanced effects
  const intensity = Math.max(0, Math.min(1, (edl as any).intensity ?? 0.5));

  const shots = (edl.shots ?? []).map((shot: any, index: number) => {
    const effects = normalizeEffects(shot.effects);

    const shouldBeatLock =
      directives.rhythm.beatAlignment === "beat_locked" ||
      directives.rhythm.beatAlignment === "transient_locked";

    effects.push(
      makeEffect("beat_cut", {
        strength: directives.rhythm.beatAlignment,
      })
    );

    if (shouldApplyEvery(index, directives.motion.pushInFrequency)) {
      effects.push(
        makeEffect("push_in", {
          scaleFrom: 1,
          scaleTo: directives.mode === "strict_replication" ? 1.14 : 1.07,
          intensity: 0.4 * intensity,
          easing: "easeOutCubic",
        })
      );
    }

    if (shouldApplyEvery(index, directives.effects.flashFrequency)) {
      effects.push(
        makeEffect("impact_flash", {
          intensity: (directives.mode === "strict_replication" ? 0.85 : 0.5) * intensity,
          durationSec: 0.08,
        })
      );
      effects.push(
        makeEffect("color_pulse", {
          intensity: (directives.mode === "strict_replication" ? 0.42 : 0.25) * intensity,
          durationSec: 0.16,
        })
      );
    }

    if (shouldApplyEvery(index, directives.motion.cameraShakeFrequency)) {
      effects.push(
        makeEffect("context_shake", {
          intensity: (directives.mode === "strict_replication" ? 0.7 : 0.35) * intensity,
          decay: 0.65,
          durationSec: 0.18,
        })
      );
    }

    const speedRampEffect = shouldApplyEvery(index, directives.motion.speedRampFrequency)
      ? makeEffect("speed_ramp", {
          curve: directives.motion.velocityCurveStyle,
          points: [
            { t: 0, speed: 1.0 },
            { t: 0.35, speed: 0.72 },
            { t: 0.72, speed: 1.38 },
            { t: 1.0, speed: 1.0 },
          ],
        })
      : null;

    if (speedRampEffect) {
      effects.push(speedRampEffect);
    }

    if (shouldApplyEvery(index, directives.effects.transitionFrequency)) {
      effects.push(
        makeEffect("whip_transition", {
          direction: index % 2 === 0 ? "right" : "left",
          blur: 0.45,
          durationSec: 0.12,
        })
      );
    }

    // ===== GPU EFFECTS — add variety beyond baseline =====
    // Cycle through GPU effects to ensure visual diversity
    const gpuEffectPool = [
      { type: "hologram", params: { intensity: 0.6 } },
      { type: "thermal", params: { intensity: 0.5 } },
      { type: "plasma", params: { intensity: 0.4 } },
      { type: "bloom_highlights", params: { intensity: 0.5 } },
      { type: "crt_monitor", params: { intensity: 0.6 } },
      { type: "duotone", params: {} },
      { type: "film_scratches", params: { intensity: 0.3 } },
      { type: "vignette_punch", params: { intensity: 0.4 } },
      { type: "lens_blur", params: { intensity: 0.5 } },
      { type: "sepia", params: { intensity: 0.4 } },
    ];

    // Add GPU effect to every other shot for variety
    if (index % 2 === 0 && directives.mode === "strict_replication") {
      const gpuEffect = gpuEffectPool[index % gpuEffectPool.length];
      effects.push(makeEffect(gpuEffect.type, {
        ...gpuEffect.params,
        intensity: (gpuEffect.params.intensity ?? 0.4) * intensity,
      }));
    }

    // Add color grade effects based on frequency
    if (shouldApplyEvery(index, directives.effects.glowFrequency ?? "medium")) {
      effects.push(makeEffect("bloom_highlights", { intensity: 0.4 * intensity }));
    }

    return {
      ...shot,
      timing: {
        ...shot.timing,
        speedRamp:
          shot.timing?.speedRamp ??
          (speedRampEffect
            ? {
                startSpeed: 0.8,
                endSpeed: 1.35,
              }
            : undefined),
      },
      beatLock:
        shot.beatLock ??
        (shouldBeatLock
          ? {
              beatIndex: index,
              lockMode: "start" as const,
            }
          : undefined),
      effects,
      meta: {
        ...(shot.meta ?? {}),
        styleEnhanced: true,
        styleMode: directives.mode,
      },
    };
  });

  return {
    ...edl,
    shots,
    meta: {
      ...((edl as any).meta ?? {}),
      enhancedByStyleDirectives: true,
      styleDirectives: directives,
    },
  } as MonetEDL;
}