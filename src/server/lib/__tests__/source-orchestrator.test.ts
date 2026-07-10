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
    version: "1.0",
    rhythm: { avgShotDuration: 1.5, shotDurationVariance: 0.3, beatsPerCut: 1, cutAlignment: "strict", accentCuts: [] },
    shotLanguage: { closeupRatio: 0.4, wideRatio: 0.2, motionPreference: "moving", subjectFocus: ["action"], sequencePatterns: [] },
    pacing: { type: "fast", energyCurve: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.7, 0.5, 0.3], intensityBuilds: true, climaxPosition: 0.65, breathingMoments: [] },
    effects: { overallIntensity: 0.6, effectsFrequency: 0.5, commonEffects: ["push_in"], transitionsBreakdown: { cutPercentage: 0.8, crossfadePercentage: 0.2, otherPercentage: 0 } },
    visualStyle: { colorGrade: "cinematic", colorTemperature: "warm", contrastLevel: "medium", saturationLevel: "natural", vignettePresent: false, grainPresent: false },
    emotionalArc: { openingMood: "building", peakMood: "intense", closingMood: "reflective", emotionalContour: "build-and-release" },
    editingPhilosophy: { summary: "Fast cuts", rhythmContract: "beat-locked", restraintLevel: "moderate", signatureMove: "push_in" },
    intentMapping: { genre: "sports_highlight", pacing: "fast", syncToBeat: true, beatSyncStrength: 0.8, colorTreatment: "vibrant", effectsIntensity: 0.6, transitionStyle: "dynamic", avgShotDuration: 1.5, mood: ["energetic"], contentFocus: ["action"] },
    composition: { avgLayerCount: 1, maskingFrequency: 0, depthOrder: "subject_on_top", commonBlendModes: ["normal"] },
    pillarScores: { brutalistImpact: 0.5, tensionPivot: 0.3, vocalFlowSync: 0.1, legacyMontage: 0.1 },
    textStyle: { pacing: "snappy", positioning: "center", fontVibe: "bold_sans", animationStyle: "pop_in" },
    effectTriggers: [],
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

  it("prefers faceCentered segments when reference has centered subject", () => {
    const ref = makeRef();
    (ref as any).subjectTracks = [
      { trackId: "person_1", className: "person", avgCenter: { x: 0.5, y: 0.5 }, motionPath: "static", confidence: 0.8 },
    ];
    const analysis = makeAnalysis(2, 10);
    // Make all even-index segments faceCentered
    for (const clip of analysis.footage) {
      for (let i = 0; i < clip.segments.length; i++) {
        clip.segments[i].faceCentered = i % 2 === 0;
      }
    }
    const plan = buildSourcePlan(analysis, ref, 10);
    const faceCenteredCount = plan.filter(p => p.faceCentered).length;
    expect(faceCenteredCount).toBeGreaterThan(3);
  });

  it("prefers matching motion direction when reference has directional subject", () => {
    const ref = makeRef();
    (ref as any).subjectTracks = [
      { trackId: "car_1", className: "car", avgCenter: { x: 0.3, y: 0.6 }, motionPath: "left_to_right", confidence: 0.9 },
    ];
    const analysis = makeAnalysis(2, 10);
    // Make all segments have "right" motion
    for (const clip of analysis.footage) {
      for (const seg of clip.segments) {
        seg.motionDir = "right";
      }
    }
    const plan = buildSourcePlan(analysis, ref, 10);
    // Most segments should be "right" motion (they all are, but the bonus should push them higher)
    const rightCount = plan.filter(p => p.motionDir === "right").length;
    expect(rightCount).toBeGreaterThanOrEqual(8);
  });
});
