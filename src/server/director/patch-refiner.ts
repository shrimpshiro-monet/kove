/**
 * Patch Refiner
 *
 * Surgically fixes weak areas of an EDL based on multi-judge score breakdown.
 * Instead of regenerating, applies targeted patches.
 */

import type { MonetEDL, Shot } from "../types/edl";
import type { ReferenceGrammar } from "./reference-grammar";
import type { MultiJudgeScore } from "./multi-judge";

// ─── Types ────────────────────────────────────────────────────────

export type PatchOp =
  | { op: "split_shot"; shotId: string; splitAt: number; reason: string }
  | { op: "extend_shot"; shotId: string; additionalDuration: number; reason: string }
  | { op: "shorten_shot"; shotId: string; reduceDuration: number; reason: string }
  | { op: "add_effect"; shotId: string; effect: any; reason: string }
  | { op: "remove_effect"; shotId: string; effectType: string; reason: string }
  | { op: "move_cut_to_beat"; shotId: string; beatTime: number; reason: string }
  | { op: "replace_first_shot"; newRole: string; reason: string }
  | { op: "add_hero_shot"; insertAfter: string; reason: string };

export interface PatchPlan {
  reason: string;
  operations: PatchOp[];
}

// ─── Planner ──────────────────────────────────────────────────────

export function createPatchPlan(
  edl: MonetEDL,
  score: MultiJudgeScore,
  grammar: ReferenceGrammar,
  availableSegments?: any[],
): PatchPlan | null {
  const patches: PatchOp[] = [];
  const shots = edl.shots ?? [];
  if (shots.length === 0) return null;

  const { structural, editorial, style } = score;

  // ── Structural patches ──

  // Too few shots: split longest shots
  if (structural.shotCountTopology < 0.7) {
    const currentCount = shots.length;
    const targetMin = grammar.topology.minGeneratedShots;
    const needed = targetMin - currentCount;

    if (needed > 0) {
      // Find the longest shots and split them
      const sortedByDuration = [...shots].sort((a, b) => (b.timing?.duration ?? 0) - (a.timing?.duration ?? 0));
      for (let i = 0; i < Math.min(needed, sortedByDuration.length); i++) {
        const shot = sortedByDuration[i];
        const dur = shot.timing?.duration ?? 1;
        if (dur > 1.0) {
          patches.push({
            op: "split_shot",
            shotId: shot.id,
            splitAt: shot.timing.startTime + dur / 2,
            reason: "increase_shot_count_to_match_reference_topology",
          });
        }
      }
    }
  }

  // Too many shots: merge shortest consecutive shots
  if (structural.shotCountTopology < 0.7 && shots.length > grammar.topology.maxGeneratedShots) {
    const excess = shots.length - grammar.topology.maxGeneratedShots;
    // Find consecutive pairs with similar section roles
    for (let i = 0; i < excess && i < shots.length - 1; i++) {
      if (shots[i].sectionRole === shots[i + 1].sectionRole) {
        patches.push({
          op: "shorten_shot",
          shotId: shots[i + 1].id,
          reduceDuration: (shots[i + 1].timing?.duration ?? 1) * 0.5,
          reason: "reduce_shot_count_to_match_reference_topology",
        });
      }
    }
  }

  // ── Editorial patches ──

  // Weak hook
  if (editorial.hookStrength < 0.5 && shots.length > 0) {
    patches.push({
      op: "replace_first_shot",
      newRole: "hook",
      reason: "hook_is_weak_replace_with_better_segment",
    });
  }

  // Missing hero moment
  if (editorial.heroMomentPlacement < 0.5) {
    const heroGrammar = grammar.sections.find(s => s.role === "hero");
    if (heroGrammar) {
      // Find the shot closest to where hero should be
      const heroTargetTime = heroGrammar.start;
      const closestShot = shots.reduce((best, s) => {
        const dist = Math.abs((s.timing?.startTime ?? 0) - heroTargetTime);
        return dist < Math.abs((best.timing?.startTime ?? 0) - heroTargetTime) ? s : best;
      }, shots[0]);

      patches.push({
        op: "add_effect",
        shotId: closestShot.id,
        effect: { id: `fx_hero_${closestShot.id}`, type: "push_in", intensity: 0.7, params: { startScale: 1.0, endScale: 1.12 } },
        reason: "hero_moment_needs_emphasis",
      });
    }
  }

  // ── Style patches ──

  // Low effect density
  if (style.effectDensity < 0.5 && grammar.effects.length > 0) {
    // Add effects to hero shots that don't have them
    const heroShots = shots.filter(s => s.isHero && (!s.effects || s.effects.length === 0));
    for (const shot of heroShots.slice(0, 2)) {
      patches.push({
        op: "add_effect",
        shotId: shot.id,
        effect: { id: `fx_density_${shot.id}`, type: "push_in", intensity: 0.5, params: { startScale: 1.0, endScale: 1.08 } },
        reason: "increase_effect_density",
      });
    }
  }

  // Low transition faithfulness
  if (style.transitionFaithfulness < 0.5 && grammar.transitions.crossfadeRatio > 0.15) {
    // Add crossfade to a hook/setup shot
    const hookShots = shots.filter(s => s.sectionRole === "hook" || s.sectionRole === "setup");
    if (hookShots.length > 0) {
      hookShots[0].transition = { type: "crossfade", duration: 0.3 };
    }
  }

  if (patches.length === 0) return null;

  return {
    reason: `Structural: ${structural.shotCountTopology < 0.7 ? "topology mismatch" : "ok"}, Editorial: ${editorial.hookStrength < 0.5 ? "weak hook" : editorial.heroMomentPlacement < 0.5 ? "missing hero" : "ok"}, Style: ${style.effectDensity < 0.5 ? "low density" : style.transitionFaithfulness < 0.5 ? "transition mismatch" : "ok"}`,
    operations: patches,
  };
}

// ─── Applier ──────────────────────────────────────────────────────

export function applyPatchPlan(edl: MonetEDL, plan: PatchPlan): MonetEDL {
  const patched: MonetEDL = JSON.parse(JSON.stringify(edl));
  const shots = patched.shots ?? [];

  for (const op of plan.operations) {
    switch (op.op) {
      case "split_shot": {
        const shotIdx = shots.findIndex(s => s.id === op.shotId);
        if (shotIdx === -1) break;
        const shot = shots[shotIdx];
        const dur = shot.timing?.duration ?? 1;
        const splitPoint = op.splitAt - (shot.timing?.startTime ?? 0);

        if (splitPoint > 0.2 && splitPoint < dur - 0.2) {
          // Create new shot from the second half
          const newShot: Shot = {
            ...JSON.parse(JSON.stringify(shot)),
            id: `${shot.id}_split`,
            timing: {
              ...shot.timing,
              startTime: op.splitAt,
              duration: dur - splitPoint,
            },
            source: {
              ...shot.source,
              inPoint: (shot.source?.inPoint ?? 0) + splitPoint * (shot.source?.outPoint ?? 1 - shot.source?.inPoint ?? 0) / dur,
            },
          };
          // Shorten original
          shot.timing.duration = splitPoint;
          shots.splice(shotIdx + 1, 0, newShot);
        }
        break;
      }

      case "shorten_shot": {
        const shot = shots.find(s => s.id === op.shotId);
        if (shot) {
          shot.timing.duration = Math.max(0.3, (shot.timing?.duration ?? 1) - op.reduceDuration);
        }
        break;
      }

      case "extend_shot": {
        const shot = shots.find(s => s.id === op.shotId);
        if (shot) {
          shot.timing.duration = (shot.timing?.duration ?? 1) + op.additionalDuration;
        }
        break;
      }

      case "add_effect": {
        const shot = shots.find(s => s.id === op.shotId);
        if (shot) {
          if (!shot.effects) shot.effects = [];
          shot.effects.push(op.effect);
        }
        break;
      }

      case "remove_effect": {
        const shot = shots.find(s => s.id === op.shotId);
        if (shot?.effects) {
          shot.effects = shot.effects.filter(e => e.type !== op.effectType);
        }
        break;
      }

      case "replace_first_shot": {
        if (shots.length > 0) {
          shots[0].sectionRole = op.newRole;
          shots[0].isHero = false;
        }
        break;
      }
    }
  }

  // Re-flow after patches
  let t = 0;
  for (const shot of shots) {
    shot.timing.startTime = t;
    t += shot.timing.duration;
  }

  return patched;
}
