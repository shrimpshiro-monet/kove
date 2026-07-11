import type { MonetEDL } from "../types/edl";

const DIR: Record<string, number> = {
  left: -1, none: 0, right: 1, up: 2, down: -2,
};

/**
 * Within montage/peak sections only, greedily reorder shots so outgoing
 * motion direction ≈ incoming motion, and energy transitions are smooth
 * (except at the drop). Hook/setup narrative order is preserved.
 */
export function enforceMotionContinuity(edl: MonetEDL): MonetEDL {
  if (!edl.shots?.length) return edl;

  const bySection: Record<string, typeof edl.shots> = {};
  for (const shot of edl.shots) {
    const r = shot.sectionRole ?? "montage";
    (bySection[r] ??= []).push(shot);
  }

  const cost = (a: any, b: any) => {
    const da = DIR[(a.source as any)?.motionDir] ?? 0;
    const db = DIR[(b.source as any)?.motionDir] ?? 0;
    const dirCost = Math.abs(da - db);
    const enCost = Math.abs(((a.source as any)?.motion ?? 0) - ((b.source as any)?.motion ?? 0));
    return dirCost + enCost * 0.5;
  };

  for (const role of ["montage", "peak"]) {
    const shots = bySection[role];
    if (!shots || shots.length < 3) continue;

    // preserve the time windows this section occupies
    const startTimes = shots.map((s) => s.timing.startTime).sort((a, b) => a - b);

    const ordered = [shots[0]];
    const pool = shots.slice(1);
    while (pool.length) {
      const last = ordered[ordered.length - 1];
      let bi = 0;
      let bc = Infinity;
      pool.forEach((s, i) => {
        const c = cost(last, s);
        if (c < bc) { bc = c; bi = i; }
      });
      ordered.push(pool.splice(bi, 1)[0]);
    }

    ordered.forEach((s, i) => { s.timing.startTime = startTimes[i]; });
  }

  edl.shots.sort((a, b) => a.timing.startTime - b.timing.startTime);
  return edl;
}
