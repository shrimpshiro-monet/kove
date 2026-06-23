// src/lib/engines/router.ts
import { ENGINE_REGISTRY, getEnginesForTier } from "./registry";
import type { EngineId, RoutedShot } from "./types";

export interface RoutedEffect {
  effectKind: string;
  shotId: string;
  engineId: EngineId;
  isPreferred: boolean;     // engine's preferredFor hit
  fallbackUsed: boolean;
}

const MULTI_ENGINE_EFFECTS: Record<string, EngineId[]> = {
  push_in: ["openreel", "webgl-grade"],
  impact_flash: ["canvas2d", "webgl-grade"],
  color_pulse: ["webgl-grade"],
  chromatic_burst: ["shader-fx", "webgl-grade"],
  speed_ramp: ["openreel", "webgl-grade"],
};

export interface RoutingResult {
  perShot: Array<{
    shotId: string;
    primaryEngine: EngineId;       // engine handling most effects
    engineLoad: Partial<Record<EngineId, string[]>>; // engine → effects assigned
  }>;
  perEngine: Partial<Record<EngineId, RoutedEffect[]>>;
  unrouted: string[];              // effects no engine supports
  totalCost: number;
  totalQualityBonus: number;
  enginesUsed: EngineId[];
}

export function routeEDL(
  edl: any,
  options: {
    tier?: "free" | "creator" | "pro";
    forBrowser?: boolean;          // exclude serverSideOnly engines
    budgetLimit?: number;          // cap total cost
    explicitEngines?: EngineId[];  // user-forced engines
  } = {},
): RoutingResult {
  const tier = options.tier ?? "free";
  const availableEngines = getEnginesForTier(tier).filter(e => {
    if (options.forBrowser && e.serverSideOnly) return false;
    if (options.explicitEngines && !options.explicitEngines.includes(e.id)) return false;
    return true;
  });

  const perShot: RoutingResult["perShot"] = [];
  const perEngine: Partial<Record<EngineId, RoutedEffect[]>> = {};
  const unrouted: string[] = [];
  let totalCost = 0;
  let totalQualityBonus = 0;
  const engineUseCount: Record<string, number> = {};

  for (const shot of edl.shots ?? []) {
    const effects = (shot.effects ?? shot.features ?? []).map((e: any) =>
      e.type ?? e.kind ?? "unknown",
    );

    const engineLoad: Partial<Record<EngineId, string[]>> = {};

    for (const effect of effects) {
      const multiEngines = MULTI_ENGINE_EFFECTS[effect];

      if (multiEngines) {
        for (const engineId of multiEngines) {
          const engine = availableEngines.find(e => e.id === engineId);
          if (!engine) continue;

          const routed: RoutedEffect = {
            effectKind: effect,
            shotId: shot.id,
            engineId,
            isPreferred: engine.preferredFor.has(effect),
            fallbackUsed: false,
          };

          engineLoad[engineId] = engineLoad[engineId] ?? [];
          engineLoad[engineId]!.push(effect);
          perEngine[engineId] = perEngine[engineId] ?? [];
          perEngine[engineId]!.push(routed);

          totalCost += engine.cost;
          totalQualityBonus += engine.qualityBonus;
          engineUseCount[engineId] = (engineUseCount[engineId] ?? 0) + 1;
        }
        continue;
      }

      // Find engines that support this effect
      const candidates = availableEngines.filter(e => e.supports.has(effect));

      if (candidates.length === 0) {
        unrouted.push(`${shot.id}:${effect}`);
        continue;
      }

      // Prefer engines where this effect is in preferredFor
      const preferred = candidates.find(c => c.preferredFor.has(effect));
      const isPreferred = !!preferred;
      let chosen = preferred ?? candidates.slice().sort((a, b) =>
        // Prefer higher quality bonus, then lower cost
        (b.qualityBonus - a.qualityBonus) || (a.cost - b.cost)
      )[0];

      // Honor maxShotsPerEdit cap
      const usedSoFar = engineUseCount[chosen.id] ?? 0;
      if (chosen.maxShotsPerEdit && usedSoFar >= chosen.maxShotsPerEdit) {
        // Fall back to next-best engine
        const fallback = candidates
          .filter(c => c.id !== chosen.id)
          .sort((a, b) => b.qualityBonus - a.qualityBonus)[0];
        if (fallback) {
          chosen = fallback;
        }
      }

      // Honor budget
      if (options.budgetLimit && totalCost + chosen.cost > options.budgetLimit) {
        const cheaper = candidates
          .filter(c => totalCost + c.cost <= options.budgetLimit!)
          .sort((a, b) => a.cost - b.cost)[0];
        if (cheaper) chosen = cheaper;
      }

      const routed: RoutedEffect = {
        effectKind: effect,
        shotId: shot.id,
        engineId: chosen.id,
        isPreferred,
        fallbackUsed: !!preferred && chosen.id !== preferred.id,
      };

      engineLoad[chosen.id] = engineLoad[chosen.id] ?? [];
      engineLoad[chosen.id]!.push(effect);
      perEngine[chosen.id] = perEngine[chosen.id] ?? [];
      perEngine[chosen.id]!.push(routed);

      totalCost += chosen.cost;
      totalQualityBonus += chosen.qualityBonus;
      engineUseCount[chosen.id] = (engineUseCount[chosen.id] ?? 0) + 1;
    }

    // Primary engine = the one handling most effects on this shot
    const sorted = Object.entries(engineLoad).sort(
      (a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)
    );
    const primaryEngine = (sorted[0]?.[0] as EngineId) ?? "openreel";

    perShot.push({
      shotId: shot.id,
      primaryEngine,
      engineLoad,
    });
  }

  return {
    perShot,
    perEngine,
    unrouted,
    totalCost,
    totalQualityBonus,
    enginesUsed: Object.keys(perEngine) as EngineId[],
  };
}

/**
 * Summary stats for showing the user / Gemini what engines are doing
 */
export function summarizeRouting(result: RoutingResult): {
  engineLoadCounts: Record<string, number>;
  topEngine: string;
  avgQualityPerEffect: number;
  costEfficiency: number;
} {
  const counts: Record<string, number> = {};
  for (const [engineId, routed] of Object.entries(result.perEngine)) {
    counts[engineId] = routed ? routed.length : 0;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const totalEffects = result.totalCost > 0 ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  return {
    engineLoadCounts: counts,
    topEngine: top?.[0] ?? "openreel",
    avgQualityPerEffect: totalEffects > 0 ? result.totalQualityBonus / totalEffects : 0,
    costEfficiency: result.totalCost > 0 ? result.totalQualityBonus / result.totalCost : 0,
  };
}
