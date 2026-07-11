import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

type Mode = "strict_replication" | "inspired";

interface SectionSpec {
  role: string;
  startPct: number;
  endPct: number;
  minDur: number;
  maxDur: number;
}

function deriveSections(ref: ReferenceStyle): SectionSpec[] {
  const climax = ref.pacing?.climaxPosition ?? 0.25;
  const avg = ref.rhythm?.avgShotDuration ?? 0.9;
  const structure = ref.intentMapping?.structure;

  if (structure === "setup_to_montage" || structure === "dialogue_drama") {
    return [
      { role: "hook",    startPct: 0,             endPct: climax * 0.6,   minDur: avg * 1.6, maxDur: avg * 4.5 },
      { role: "setup",   startPct: climax * 0.6,  endPct: climax,         minDur: avg * 1.0, maxDur: avg * 2.5 },
      { role: "drop",    startPct: climax,        endPct: climax + 0.05,  minDur: 0.25,      maxDur: avg * 1.2 },
      { role: "montage", startPct: climax + 0.05, endPct: 0.95,           minDur: 0.30,      maxDur: avg * 1.3 },
      { role: "ending",  startPct: 0.95,          endPct: 1.0,            minDur: 0.35,      maxDur: avg * 1.5 },
    ];
  }
  return [
    { role: "build",  startPct: 0,   endPct: 0.5, minDur: avg * 0.9, maxDur: avg * 1.6 },
    { role: "peak",   startPct: 0.5, endPct: 0.9, minDur: avg * 0.6, maxDur: avg * 1.2 },
    { role: "ending", startPct: 0.9, endPct: 1.0, minDur: avg * 0.8, maxDur: avg * 1.5 },
  ];
}

export function enforceReferenceStyleOnEDL(
  edl: MonetEDL,
  ref: ReferenceStyle,
  mode: Mode,
): MonetEDL {
  if (!edl.shots?.length) return edl;

  const dur = edl.timeline?.duration ?? 30;
  const sections = deriveSections(ref);
  const tol = mode === "strict_replication" ? 1.0 : 1.3;

  // 1) tag section + clamp per-section (never global)
  for (const shot of edl.shots) {
    const startPct = shot.timing.startTime / dur;
    const sec =
      sections.find((x) => startPct >= x.startPct && startPct < x.endPct) ??
      sections[sections.length - 1];
    shot.sectionRole = sec.role;

    // preserve intentional outliers (a deliberate hold or hero moment)
    if ((shot as any).isHero || (shot as any).holdForImpact) continue;

    const min = sec.minDur;
    const max = sec.maxDur * tol;
    if (shot.timing.duration < min) shot.timing.duration = min;
    else if (shot.timing.duration > max) shot.timing.duration = max;
  }

  // 2) reflow sequentially, then normalize to target WITHOUT killing contrast
  reflowToTarget(edl, dur);

  // 3) transition mix (section-aware): montage/drop never crossfades
  enforceTransitionMix(edl, ref);

  return edl;
}

function reflowToTarget(edl: MonetEDL, target: number) {
  let t = 0;
  for (const s of edl.shots) {
    s.timing.startTime = t;
    t += s.timing.duration;
  }
  const scale = target / (t || target);
  if (Math.abs(scale - 1) > 0.02) {
    let acc = 0;
    for (const s of edl.shots) {
      s.timing.duration *= scale;
      s.timing.startTime = acc;
      acc += s.timing.duration;
    }
  }
  if (edl.timeline) edl.timeline.duration = target;
}

function enforceTransitionMix(edl: MonetEDL, ref: ReferenceStyle) {
  const tb = ref.effects.transitionsBreakdown;

  for (const shot of edl.shots) {
    if (!shot.transition) shot.transition = { type: "cut", duration: 0 };
    const t = shot.transition.type;
    // HARD RULE: high-energy sections stay on hard cuts
    if (
      (shot.sectionRole === "montage" || shot.sectionRole === "drop") &&
      (t === "crossfade" || t === "dissolve")
    ) {
      shot.transition = { type: "cut", duration: 0 };
    }
  }

  // Allocate crossfade budget deterministically to hook/setup only
  const cfBudget = Math.round((tb.crossfadePercentage ?? 0) * edl.shots.length);
  if (cfBudget > 0) {
    const eligible = edl.shots.filter(
      (s) => s.sectionRole === "hook" || s.sectionRole === "setup",
    );
    eligible.slice(0, cfBudget).forEach((s) => {
      s.transition = { type: "crossfade", duration: 0.3 };
    });
  }
}
