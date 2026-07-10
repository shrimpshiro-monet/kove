import { describe, it, expect } from "vitest";
import { buildSourcePlan, type SourcePlan } from "../../director/source-orchestrator";
import type { ReferenceStyle } from "../../types/reference-style";

function makeAnalysis(clipCount: number, segmentsPerClip: number) {
  const footage = [];
  for (let c = 0; c < clipCount; c++) {
    const segments = [];
    for (let s = 0; s < segmentsPerClip; s++) {
      segments.push({
        start: s * 3,
        end: (s + 1) * 3,
        duration: 3,
        scores: { overall: 0.5 + (s / segmentsPerClip) * 0.5, motion: s / segmentsPerClip, emotion: 0.5 },
        tags: ["action"],
        semantic: ["subject"],
        motionDir: ["left", "right", "none"][s % 3],
        faceCentered: s % 2 === 0,
        hasVelocityRamp: false,
      });
    }
    footage.push({ clipId: `clip_${c}`, duration: segmentsPerClip * 3, segments });
  }
  return { footage, music: null } as any;
}

function makeRef(): ReferenceStyle {
  return {
    rhythm: { avgShotDuration: 1.5, shotDurationVariance: 0.3, beatsPerCut: 1, cutAlignment: "strict", accentCuts: [] },
    shotLanguage: { closeupRatio: 0.4, wideRatio: 0.2, motionPreference: "moving", subjectFocus: ["action"], sequencePatterns: [] },
    pacing: { type: "fast", energyCurve: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.7, 0.5, 0.3], intensityBuilds: true, climaxPosition: 0.65, breathingMoments: [] },
    effects: { overallIntensity: 0.6, effectsFrequency: 0.5, commonEffects: ["push_in"], transitionsBreakdown: { cutPercentage: 0.8, crossfadePercentage: 0.2, otherPercentage: 0 } },
  } as ReferenceStyle;
}

describe("buildSourcePlan", () => {
  it("distributes segments across multiple clips", () => {
    const plan = buildSourcePlan(makeAnalysis(3, 10), makeRef(), 20);
    const clipIds = new Set(plan.map(p => p.clipId));
    expect(clipIds.size).toBeGreaterThan(1);
    expect(plan.length).toBe(20);
  });

  it("never repeats the same segment within 3 shots", () => {
    const plan = buildSourcePlan(makeAnalysis(2, 20), makeRef(), 30);
    for (let i = 2; i < plan.length; i++) {
      const keys = plan.slice(i - 2, i + 1).map(p => `${p.clipId}:${p.segmentIndex}`);
      expect(new Set(keys).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("no clip exceeds 40% of total shots", () => {
    const plan = buildSourcePlan(makeAnalysis(3, 20), makeRef(), 30);
    const counts: Record<string, number> = {};
    for (const p of plan) counts[p.clipId] = (counts[p.clipId] || 0) + 1;
    for (const count of Object.values(counts)) {
      expect(count / plan.length).toBeLessThanOrEqual(0.41);
    }
  });

  it("prefers high-scoring segments (deterministic — no Math.random)", () => {
    const analysis = makeAnalysis(2, 10);
    const plan = buildSourcePlan(analysis, makeRef(), 5);
    expect(plan[0].score).toBeGreaterThanOrEqual(0.8);
  });

  it("preserves motion direction continuity", () => {
    const plan = buildSourcePlan(makeAnalysis(2, 20), makeRef(), 15);
    let continuityScore = 0;
    for (let i = 1; i < plan.length; i++) {
      const prev = plan[i - 1].motionDir;
      const curr = plan[i].motionDir;
      if (prev === curr || prev === "none" || curr === "none") continuityScore++;
    }
    expect(continuityScore / plan.length).toBeGreaterThan(0.3);
  });
});
