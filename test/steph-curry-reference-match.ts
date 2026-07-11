/**
 * Steph Curry Reference Match Test
 *
 * Validates that a generated EDL matches the Steph Curry reference edit 1:1.
 * Reference: reference-edits-2/steph curry.MP4 (19.16s, 27 cuts, 0.71s avg shot)
 *
 * Run: bun test/steph-curry-reference-match.ts
 */

import type { MonetEDL, Shot } from "../src/server/types/edl";

// ─── Reference Constants (from reference-catalog.json) ──────────────────

const REFERENCE = {
  duration: 19.16,
  resolution: { width: 576, height: 576 },
  fps: 30,
  totalCuts: 27,
  avgShotDuration: 0.71,
  cutRate: 1.41, // cuts per second
  effects: ["impact_flash", "speed_ramp", "context_shake", "chromatic_burst"],
  transitions: ["cut", "whip_pan"],
  colorGrade: "cool_dark",
  vfxIntensity: "high",
  // Pacing targets
  minShotDuration: 0.3,  // no shot shorter than 0.3s
  maxShotDuration: 3.5,  // no shot longer than 3.5s
  // Effect density
  minEffectsPerShot: 0.4, // 40% of shots should have effects
  maxEffectsPerShot: 3,
  // Beat sync
  beatSyncTarget: 0.8,   // 80% of cuts on beat
};

// ─── Validation Functions ──────────────────────────────────────────────

interface ValidationResult {
  pass: boolean;
  score: number; // 0-100
  checks: CheckResult[];
}

interface CheckResult {
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
  weight: number; // 0-1, how much this affects the score
}

function validateEDL(edl: MonetEDL): ValidationResult {
  const checks: CheckResult[] = [];

  // 1. Duration match (weight: 0.15)
  const durationDiff = Math.abs(edl.timeline.duration - REFERENCE.duration);
  const durationPass = durationDiff < 2.0; // within 2s
  checks.push({
    name: "Duration match",
    pass: durationPass,
    expected: `${REFERENCE.duration}s (±2s)`,
    actual: `${edl.timeline.duration.toFixed(2)}s`,
    weight: 0.15,
  });

  // 2. Shot count (weight: 0.15)
  const shotCountDiff = Math.abs(edl.shots.length - REFERENCE.totalCuts);
  const shotCountPass = shotCountDiff <= 5; // within 5 shots
  checks.push({
    name: "Shot count",
    pass: shotCountPass,
    expected: `${REFERENCE.totalCuts} shots (±5)`,
    actual: `${edl.shots.length} shots`,
    weight: 0.15,
  });

  // 3. Average shot duration (weight: 0.15)
  const avgDuration = edl.shots.reduce((sum, s) => sum + s.timing.duration, 0) / edl.shots.length;
  const avgDiff = Math.abs(avgDuration - REFERENCE.avgShotDuration);
  const avgPass = avgDiff < 0.3; // within 0.3s
  checks.push({
    name: "Avg shot duration",
    pass: avgPass,
    expected: `${REFERENCE.avgShotDuration}s (±0.3s)`,
    actual: `${avgDuration.toFixed(3)}s`,
    weight: 0.15,
  });

  // 4. Resolution match (weight: 0.1)
  const resPass =
    edl.timeline.resolution.width === REFERENCE.resolution.width &&
    edl.timeline.resolution.height === REFERENCE.resolution.height;
  checks.push({
    name: "Resolution",
    pass: resPass,
    expected: `${REFERENCE.resolution.width}x${REFERENCE.resolution.height}`,
    actual: `${edl.timeline.resolution.width}x${edl.timeline.resolution.height}`,
    weight: 0.1,
  });

  // 5. Shot duration bounds (weight: 0.1)
  const allDurationsInBounds = edl.shots.every(
    (s) => s.timing.duration >= REFERENCE.minShotDuration && s.timing.duration <= REFERENCE.maxShotDuration
  );
  checks.push({
    name: "Shot duration bounds",
    pass: allDurationsInBounds,
    expected: `${REFERENCE.minShotDuration}-${REFERENCE.maxShotDuration}s`,
    actual: `${Math.min(...edl.shots.map(s => s.timing.duration)).toFixed(2)}-${Math.max(...edl.shots.map(s => s.timing.duration)).toFixed(2)}s`,
    weight: 0.1,
  });

  // 6. Effect coverage (weight: 0.15)
  const shotsWithEffects = edl.shots.filter((s) => s.effects && s.effects.length > 0).length;
  const effectCoverage = shotsWithEffects / edl.shots.length;
  const effectPass = effectCoverage >= REFERENCE.minEffectsPerShot;
  checks.push({
    name: "Effect coverage",
    pass: effectPass,
    expected: `≥${REFERENCE.minEffectsPerShot * 100}% shots with effects`,
    actual: `${(effectCoverage * 100).toFixed(0)}% (${shotsWithEffects}/${edl.shots.length})`,
    weight: 0.15,
  });

  // 7. Effect types present (weight: 0.1)
  const usedEffects = new Set<string>();
  for (const shot of edl.shots) {
    for (const fx of shot.effects ?? []) {
      usedEffects.add(fx.type);
    }
  }
  const requiredEffects = REFERENCE.effects.filter((e) => ["impact_flash", "speed_ramp"].includes(e));
  const missingEffects = requiredEffects.filter((e) => !usedEffects.has(e));
  const effectTypesPass = missingEffects.length === 0;
  checks.push({
    name: "Required effect types",
    pass: effectTypesPass,
    expected: `Must include: ${requiredEffects.join(", ")}`,
    actual: `Found: ${Array.from(usedEffects).join(", ")}`,
    weight: 0.1,
  });

  // 8. Beat lock coverage (weight: 0.1)
  const beatLockedShots = edl.shots.filter((s) => s.beatLock).length;
  const beatLockRatio = beatLockedShots / edl.shots.length;
  const beatPass = beatLockRatio >= 0.5;
  checks.push({
    name: "Beat lock coverage",
    pass: beatPass,
    expected: "≥50% shots beat-locked",
    actual: `${(beatLockRatio * 100).toFixed(0)}% (${beatLockedShots}/${edl.shots.length})`,
    weight: 0.1,
  });

  // 9. No overlapping shots (weight: 0.1)
  let hasOverlap = false;
  for (let i = 0; i < edl.shots.length - 1; i++) {
    const end = edl.shots[i].timing.startTime + edl.shots[i].timing.duration;
    const nextStart = edl.shots[i + 1].timing.startTime;
    if (end > nextStart + 0.01) {
      hasOverlap = true;
      break;
    }
  }
  checks.push({
    name: "No overlapping shots",
    pass: !hasOverlap,
    expected: "No temporal overlaps",
    actual: hasOverlap ? "OVERLAP DETECTED" : "Clean timeline",
    weight: 0.1,
  });

  // Calculate score
  let totalWeight = 0;
  let weightedScore = 0;
  for (const check of checks) {
    totalWeight += check.weight;
    if (check.pass) weightedScore += check.weight;
  }
  const score = Math.round((weightedScore / totalWeight) * 100);

  return {
    pass: score >= 80,
    score,
    checks,
  };
}

// ─── Runner ────────────────────────────────────────────────────────────

async function main() {
  const edlPath = process.argv[2] || "test/steph-curry-expected-edl.json";

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Steph Curry Reference Match Test               ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();
  console.log(`Reference: steph curry.MP4 (19.16s, 27 cuts, 0.71s avg)`);
  console.log(`EDL file:  ${edlPath}`);
  console.log();

  const edl: MonetEDL = JSON.parse(await Bun.file(edlPath).text());
  const result = validateEDL(edl);

  // Print results
  console.log("─".repeat(55));
  console.log("CHECK                              EXPECTED          ACTUAL");
  console.log("─".repeat(55));

  for (const check of result.checks) {
    const icon = check.pass ? "✅" : "❌";
    const name = check.name.padEnd(34);
    const expected = check.expected.padEnd(17);
    console.log(`${icon} ${name} ${expected} ${check.actual}`);
  }

  console.log("─".repeat(55));
  console.log();

  // Effect usage summary
  const effectCounts: Record<string, number> = {};
  for (const shot of edl.shots) {
    for (const fx of shot.effects ?? []) {
      effectCounts[fx.type] = (effectCounts[fx.type] || 0) + 1;
    }
  }

  console.log("Effect Usage:");
  for (const [type, count] of Object.entries(effectCounts).sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(Math.min(count, 30));
    console.log(`  ${type.padEnd(22)} ${String(count).padStart(3)} ${bar}`);
  }
  console.log();

  // Transition usage
  const transitionCounts: Record<string, number> = {};
  for (const shot of edl.shots) {
    const t = shot.transition?.type || "cut";
    transitionCounts[t] = (transitionCounts[t] || 0) + 1;
  }

  console.log("Transition Usage:");
  for (const [type, count] of Object.entries(transitionCounts).sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(Math.min(count, 30));
    console.log(`  ${type.padEnd(22)} ${String(count).padStart(3)} ${bar}`);
  }
  console.log();

  // Timing analysis
  const durations = edl.shots.map((s) => s.timing.duration);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)];
  const p90 = sortedDurations[Math.floor(sortedDurations.length * 0.9)];

  console.log("Timing Analysis:");
  console.log(`  Total duration:    ${edl.timeline.duration.toFixed(2)}s`);
  console.log(`  Shot count:        ${edl.shots.length}`);
  console.log(`  Avg shot duration: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3)}s`);
  console.log(`  Median (P50):      ${p50.toFixed(3)}s`);
  console.log(`  P90:               ${p90.toFixed(3)}s`);
  console.log(`  Min:               ${sortedDurations[0].toFixed(3)}s`);
  console.log(`  Max:               ${sortedDurations[sortedDurations.length - 1].toFixed(3)}s`);

  // Pacing variance (coefficient of variation)
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const cv = Math.sqrt(variance) / mean;
  console.log(`  Pacing CV:         ${cv.toFixed(3)} (target: 0.3-0.5)`);
  console.log();

  // Score
  const scoreColor = result.score >= 80 ? "\x1b[32m" : result.score >= 60 ? "\x1b[33m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log("═".repeat(55));
  console.log(`${scoreColor}  SCORE: ${result.score}/100${reset}  ${result.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═".repeat(55));

  process.exit(result.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
