import { describe, it, expect } from "vitest";
import { replicateStyle, type ReplicateStyleInput, applyDeterministicHumanization } from "../../director/style-replicator";
import type { ReferenceStyle } from "../../types/reference-style";

function makeRef(overrides: any = {}): ReferenceStyle {
  return {
    rhythm: { avgShotDuration: 1.2, shotDurationVariance: 0.25, beatsPerCut: 1, cutAlignment: "strict", accentCuts: [2, 5, 8] },
    pacing: { type: "fast", energyCurve: [0.3, 0.4, 0.5, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.3], intensityBuilds: true, climaxPosition: 0.6, breathingMoments: [3] },
    effects: { overallIntensity: 0.6, effectsFrequency: 0.5, commonEffects: ["push_in", "impact_flash", "speed_ramp"], transitionsBreakdown: { cutPercentage: 0.8, crossfadePercentage: 0.2, otherPercentage: 0 } },
    shotLanguage: { closeupRatio: 0.4, wideRatio: 0.2, motionPreference: "moving", subjectFocus: ["action"], sequencePatterns: [] },
    visualStyle: { colorGrade: "cinematic", colorTemperature: "warm", contrastLevel: "high", saturationLevel: "saturated", vignettePresent: false, grainPresent: false },
    emotionalArc: { openingMood: "building", peakMood: "euphoric", closingMood: "reflective", emotionalContour: "build-and-release" },
    editingPhilosophy: { summary: "Fast cuts, high energy", rhythmContract: "beat-locked", restraintLevel: "moderate", signatureMove: "impact_flash on drops" },
    intentMapping: { genre: "sports_highlight", pacing: "fast", syncToBeat: true, beatSyncStrength: 0.8, colorTreatment: "vibrant", effectsIntensity: 0.6, transitionStyle: "aggressive", avgShotDuration: 1.2, mood: ["energetic"], contentFocus: ["action"] },
    composition: { avgLayerCount: 1, maskingFrequency: 0, depthOrder: "subject_on_top", commonBlendModes: ["normal"] },
    pillarScores: { brutalistImpact: 0.7, tensionPivot: 0.2, vocalFlowSync: 0.1, legacyMontage: 0.0 },
    textStyle: { pacing: "snappy", positioning: "center", fontVibe: "bold_sans", animationStyle: "pop_in" },
    effectTriggers: [{ type: "impact_flash", triggerEvent: "beat", intensity: 0.8 }],
    ...overrides,
  } as ReferenceStyle;
}

function makeAnalysis(): any {
  return {
    footage: [{
      clipId: "clip_1",
      duration: 30,
      segments: Array.from({ length: 20 }, (_, i) => ({
        start: i * 1.5, end: (i + 1) * 1.5, duration: 1.5,
        scores: { overall: 0.5 + (i / 20) * 0.5, motion: i / 20, emotion: 0.5 },
        tags: ["action"], semantic: ["subject"],
        motionDir: ["left", "right", "none"][i % 3],
        faceCentered: i % 3 === 0, hasVelocityRamp: i >= 10,
      })),
    }],
    music: { musicId: "music_1", duration: 20, bpm: 140, beatGrid: Array.from({ length: 40 }, (_, i) => i * (60 / 140)), characteristics: { energy: "high" } },
  };
}

function makeSourcePlan(): ReplicateStyleInput["sourcePlan"] {
  return Array.from({ length: 15 }, (_, i) => ({
    clipId: "clip_1", segmentIndex: i, startTime: i * 1.5, duration: 1.5,
    motionDir: ["left", "right", "none"][i % 3], semanticTags: ["subject"],
    faceCentered: i % 3 === 0, hasVelocityRamp: i >= 10, score: 0.5 + (i / 15) * 0.5,
  }));
}

function makeBeats() {
  return Array.from({ length: 40 }, (_, i) => i * (60 / 140));
}

describe("replicateStyle", () => {
  it("generates a complete EDL matching the MonetEDL schema", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [5, 10], downbeats: [] },
      fps: 30, createdAt: 0,
    });

    expect(edl.version).toBe("1.0.0");
    expect(edl.metadata).toBeDefined();
    expect(edl.timeline.duration).toBeCloseTo(20, 0);
    expect(edl.shots.length).toBeGreaterThanOrEqual(8);
    expect(edl.music).toBeDefined();
    expect(edl.music!.id).toBeDefined();
    expect(edl.music!.sourceId).toBeDefined();

    for (const shot of edl.shots) {
      expect(typeof shot.id).toBe("string");
      expect(shot.source.clipId).toBeDefined();
      expect(typeof shot.source.inPoint).toBe("number");
      expect(typeof shot.source.outPoint).toBe("number");
      expect(typeof shot.timing.startTime).toBe("number");
      expect(typeof shot.timing.duration).toBe("number");
      expect(shot.timing.duration).toBeGreaterThan(0);
    }
  });

  it("shot durations match reference avgShotDuration ±30%", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });
    const avgDur = edl.shots.reduce((s, sh) => s + sh.timing.duration, 0) / edl.shots.length;
    expect(avgDur).toBeGreaterThan(1.2 * 0.7);
    expect(avgDur).toBeLessThan(1.2 * 1.3);
  });

  it("pre-climax detection uses absolute timestamp, not relative", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef({ pacing: { ...makeRef().pacing, climaxPosition: 0.6 } }),
      analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });

    const climaxTs = 0.6 * 20;
    const preClimax = edl.shots.filter(s => (s.timing.startTime + s.timing.duration) <= climaxTs);
    const postClimax = edl.shots.filter(s => s.timing.startTime >= climaxTs);

    const heavy = ["impact_flash", "speed_ramp", "color_pulse", "context_shake"];
    const preHeavy = preClimax.reduce((c, s) => c + (s.effects?.filter(e => heavy.includes(e.type))?.length ?? 0), 0);
    const postHeavy = postClimax.reduce((c, s) => c + (s.effects?.filter(e => heavy.includes(e.type))?.length ?? 0), 0);
    expect(preHeavy).toBeLessThanOrEqual(postHeavy + 1);
  });

  it("cuts land near beat grid when beat-aligned", () => {
    const beats = makeBeats();
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats, onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });
    const beatInterval = 60 / 140;
    // Allow wider tolerance due to smooth constraints (minClipDuration)
    for (const shot of edl.shots) {
      if (shot.beatLock) {
        const nearest = beats.reduce((best, b) => Math.abs(b - shot.timing.startTime) < Math.abs(best - shot.timing.startTime) ? b : best, beats[0]);
        expect(Math.abs(shot.timing.startTime - nearest)).toBeLessThan(beatInterval * 0.6);
      }
    }
  });

  it("shot timings fill the target duration", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });
    const last = edl.shots[edl.shots.length - 1];
    const end = last.timing.startTime + last.timing.duration;
    expect(end).toBeCloseTo(20, 1);
  });

  it("applies effects near reference frequency", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });
    const withEffects = edl.shots.filter(s => (s.effects?.length ?? 0) > 0).length;
    const rate = withEffects / edl.shots.length;
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.85);
  });

  it("applyDeterministicHumanization is exported and applies micro-variations", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });

    const origDurations = edl.shots.map(s => s.timing.duration);
    const humanized = applyDeterministicHumanization(edl, makeRef());
    const newDurations = humanized.shots.map(s => s.timing.duration);

    const hasChanges = origDurations.some((d, i) => Math.abs(d - newDurations[i]) > 0.01);
    expect(hasChanges).toBe(true);

    // Original unmodified (deep clone)
    expect(edl.shots.map(s => s.timing.duration)).toEqual(origDurations);

    // Total duration approximately preserved
    const origTotal = origDurations.reduce((a, b) => a + b, 0);
    const newTotal = newDurations.reduce((a, b) => a + b, 0);
    expect(Math.abs(origTotal - newTotal)).toBeLessThan(1.0);
  });

  it("generates text overlays from reference textOverlayTrace", () => {
    const ref = makeRef();
    (ref as any).duration = 15;
    (ref as any).textOverlayTrace = [
      {
        startTime: 1.0, endTime: 4.0, text: "LOCKED IN",
        bbox: { x: 0.2, y: 0.35, w: 0.6, h: 0.12 },
        position: "center", animation: "pop_scale", fontVibe: "bold_sans", confidence: 0.85,
      },
      {
        startTime: 8.0, endTime: 12.0, text: "GAME TIME",
        bbox: { x: 0.1, y: 0.7, w: 0.8, h: 0.1 },
        position: "lower_third", animation: "slide_up", fontVibe: "bold_sans", confidence: 0.78,
      },
    ];

    const edl = replicateStyle({
      referenceStyle: ref, analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });

    expect(edl.textOverlays).toBeDefined();
    expect(edl.textOverlays!.length).toBe(2);

    // Timestamps should be scaled (reference 15s → target 20s, scale = 1.33x)
    const overlay1 = edl.textOverlays![0];
    expect(overlay1.text).toBe("LOCKED IN");
    expect(overlay1.startTime).toBeCloseTo(1.0 * (20 / 15), 1);
    expect(overlay1.endTime).toBeCloseTo(4.0 * (20 / 15), 1);
    expect(overlay1.style?.shadow).toBe(true);
    expect(overlay1.animation?.inType).toBe("pop");

    const overlay2 = edl.textOverlays![1];
    expect(overlay2.text).toBe("GAME TIME");
    expect(overlay2.animation?.inType).toBe("slide");
  });

  it("does not generate text overlays when reference has none", () => {
    const edl = replicateStyle({
      referenceStyle: makeRef(), analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });
    expect(edl.textOverlays).toBeUndefined();
  });

  it("uses strict beat-locking when audioVisualSync.cutOnBeatRatio > 0.7", () => {
    const ref = makeRef();
    (ref as any).audioVisualSync = { cutOnBeatRatio: 0.85, syncConfidence: 0.9 };
    ref.rhythm.cutAlignment = "loose"; // Would normally be loose

    const edl = replicateStyle({
      referenceStyle: ref, analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });

    // Should have beat-locked shots because cutOnBeatRatio > 0.7
    const beatLockedShots = edl.shots.filter(s => s.timing.beatLocked);
    expect(beatLockedShots.length).toBeGreaterThan(0);
  });

  it("snaps cuts to scene boundaries when available", () => {
    const ref = makeRef();
    // Add scene boundaries at specific positions (scaled to 20s target)
    (ref as any).duration = 15;
    (ref as any).sceneBoundaryTrace = [
      { timestamp: 2.0, confidence: 0.9 },
      { timestamp: 4.5, confidence: 0.85 },
      { timestamp: 7.0, confidence: 0.8 },
      { timestamp: 10.0, confidence: 0.9 },
      { timestamp: 13.0, confidence: 0.7 },
    ];

    const edl = replicateStyle({
      referenceStyle: ref, analysis: makeAnalysis(), sourcePlan: makeSourcePlan(),
      targetDuration: 20,
      rhythmMap: { bpm: 140, beats: makeBeats(), onsets: [], drop_candidates: [], downbeats: [] },
      fps: 30, createdAt: 0,
    });

    // Some shots should start near mapped boundary positions
    const scaledBoundaries = [2.0 * (20/15), 4.5 * (20/15), 7.0 * (20/15), 10.0 * (20/15), 13.0 * (20/15)];
    let snappedCount = 0;
    for (const shot of edl.shots) {
      for (const bt of scaledBoundaries) {
        if (Math.abs(shot.timing.startTime - bt) < 0.5) {
          snappedCount++;
          break;
        }
      }
    }
    expect(snappedCount).toBeGreaterThanOrEqual(2);
  });
});
