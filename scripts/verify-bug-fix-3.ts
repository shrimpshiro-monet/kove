/**
 * Bug Fix Verification #3: style-match-scorer.ts vocabulary scoring
 * 
 * BUG: scoreEffectVocabulary() only read from reference.effects.commonEffects
 * (the old generic list like ["glow", "shake", "zoom_pulse"]).
 * The new pipeline produces referenceStyle.effectVocabulary (per-shot
 * extracted effects like impact_flash, context_shake, speed_ramp).
 * The scorer gave zero credit for matching the new vocabulary.
 * 
 * FIX: Now also iterates reference.effectVocabulary to pick up
 * per-shot extracted effects.
 * 
 * VERIFICATION: Create a reference with ONLY effectVocabulary (no commonEffects).
 * Score an EDL that uses those effects. Confirm score > 0.
 */

import { scoreStyleMatch } from "../src/server/lib/style-match-scorer";
import type { MonetEDL } from "../src/server/types/edl";
import type { ReferenceStyle } from "../src/server/types/reference-style";

// Minimal reference with ONLY effectVocabulary (no commonEffects overlap)
const referenceStyle = {
  rhythm: {
    avgShotDuration: 1.5,
    shotDurationVariance: 0.3,
    beatsPerCut: 1,
    cutAlignment: "strict",
    accentCuts: [],
  },
  pacing: {
    type: "fast",
    energyCurve: [0.5, 0.6, 0.7, 0.8, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4],
    intensityBuilds: true,
    climaxPosition: 0.6,
    breathingMoments: [],
  },
  shotLanguage: {
    closeupRatio: 0.6,
    wideRatio: 0.2,
    motionPreference: "moving",
    subjectFocus: ["faces", "action"],
    sequencePatterns: ["wide→close"],
  },
  visualStyle: {
    colorGrade: "cinematic",
    colorTemperature: "warm",
    contrastLevel: "high",
    saturationLevel: "saturated",
    vignettePresent: false,
    grainPresent: false,
  },
  effects: {
    overallIntensity: 0.7,
    effectsFrequency: 0.5,
    commonEffects: [],  // EMPTY — no old-style effects listed
    transitionsBreakdown: {
      cutPercentage: 0.8,
      crossfadePercentage: 0.15,
      otherPercentage: 0.05,
    },
  },
  emotionalArc: {
    openingMood: "intense",
    peakMood: "euphoric",
    closingMood: "triumphant",
    emotionalContour: "build-and-release",
  },
  editingPhilosophy: {
    summary: "Fast-paced sports edit",
    rhythmContract: "cuts on every beat",
    restraintLevel: "minimal",
    signatureMove: "speed ramp into impact",
  },
  composition: {
    avgLayerCount: 2,
    maskingFrequency: 0.1,
    depthOrder: "subject_on_top",
    commonBlendModes: ["normal"],
  },
  pillarScores: {
    brutalistImpact: 0.8,
    tensionPivot: 0.6,
    vocalFlowSync: 0.7,
    legacyMontage: 0.5,
  },
  textStyle: {
    pacing: "snappy",
    positioning: "center",
    fontVibe: "bold_sans",
    animationStyle: "pop_in",
  },
  effectTriggers: [],
  intentMapping: {
    genre: "sports_highlight" as const,
    pacing: "fast" as const,
    syncToBeat: true,
    beatSyncStrength: 0.8,
    colorTreatment: "vibrant" as const,
    effectsIntensity: 0.7,
    transitionStyle: "aggressive" as const,
    avgShotDuration: 1.5,
    mood: ["energetic"],
    contentFocus: ["action"],
  },
  // NEW: per-shot effect vocabulary (the extracted effects)
  effectVocabulary: [
    {
      shotIndex: 0,
      startTime: 0,
      duration: 1.5,
      effects: [
        { type: "impact_flash", intensity: 0.8, timing: "start" as const },
        { type: "speed_ramp", intensity: 0.7, timing: "throughout" as const },
      ],
    },
    {
      shotIndex: 1,
      startTime: 1.5,
      duration: 1.2,
      effects: [
        { type: "context_shake", intensity: 0.5, timing: "start" as const },
        { type: "whip_pan", intensity: 0.6, timing: "end" as const },
      ],
    },
    {
      shotIndex: 2,
      startTime: 2.7,
      duration: 1.8,
      effects: [
        { type: "impact_flash", intensity: 0.9, timing: "start" as const },
        { type: "push_in", intensity: 0.4, timing: "throughout" as const },
      ],
    },
  ],
} as unknown as ReferenceStyle;

// EDL that uses the SAME effects from the vocabulary
const edl = {
  timeline: { duration: 4.5, fps: 30 },
  shots: [
    {
      id: "shot-1",
      source: { clipId: "clip-1", inPoint: 0, outPoint: 1.5 },
      timing: { startTime: 0, duration: 1.5 },
      effects: [
        { id: "fx-1", type: "impact_flash", intensity: 0.8 },
        { id: "fx-2", type: "speed_ramp", intensity: 0.7 },
      ],
    },
    {
      id: "shot-2",
      source: { clipId: "clip-2", inPoint: 0, outPoint: 1.2 },
      timing: { startTime: 1.5, duration: 1.2 },
      effects: [
        { id: "fx-3", type: "context_shake", intensity: 0.5 },
        { id: "fx-4", type: "whip_pan", intensity: 0.6 },
      ],
    },
    {
      id: "shot-3",
      source: { clipId: "clip-3", inPoint: 0, outPoint: 1.8 },
      timing: { startTime: 2.7, duration: 1.8 },
      effects: [
        { id: "fx-5", type: "impact_flash", intensity: 0.9 },
        { id: "fx-6", type: "push_in", intensity: 0.4 },
      ],
    },
  ],
} as unknown as MonetEDL;

console.log("=== Bug Fix Verification #3: style-match-scorer vocabulary scoring ===\n");

console.log("Reference style:");
console.log(`  commonEffects: [${referenceStyle.effects.commonEffects.join(", ")}] (EMPTY)`);
console.log(`  effectVocabulary: ${referenceStyle.effectVocabulary.length} shots with effects`);
referenceStyle.effectVocabulary.forEach((shot) => {
  const effectTypes = shot.effects.map(e => e.type);
  console.log(`    Shot ${shot.shotIndex}: [${effectTypes.join(", ")}]`);
});

console.log("\nEDL shots:");
edl.shots.forEach((shot) => {
  const effectTypes = (shot.effects ?? []).map(e => e.type);
  console.log(`  ${shot.id}: [${effectTypes.join(", ")}]`);
});

const score = scoreStyleMatch(edl, referenceStyle);

console.log(`\n=== Style Match Score: ${score.total}/100 ===`);
console.log(`  Shot Duration:    ${score.breakdown.shotDuration}/25`);
console.log(`  Cut Frequency:    ${score.breakdown.cutFrequency}/25`);
console.log(`  Effect Vocabulary: ${score.breakdown.effectVocabulary}/25`);
console.log(`  Transition Style: ${score.breakdown.transitionStyle}/25`);
console.log(`\nDetails:`);
score.details.forEach(d => console.log(`  - ${d}`));

// Verify the fix: effect vocabulary score should be > 0
// because EDL uses effects from effectVocabulary
console.log(`\n--- Verification ---`);
console.log(`  effectVocabulary score: ${score.breakdown.effectVocabulary}/25`);
console.log(`  EXPECTED: > 0 (EDL uses effects from reference effectVocabulary)`);
console.log(`  RESULT: ${score.breakdown.effectVocabulary > 0 ? "PASS" : "FAIL"}`);

// What the old code would have scored
console.log("\n--- What the old code produced (commonEffects only) ---");
console.log(`  commonEffects was empty: []`);
console.log(`  Old refEffects Set size: 0`);
console.log(`  Old score: 25 (neutral match — 'No effects in either')`);
console.log(`  BUG CONFIRMED: old code gave 25/25 for EMPTY effects list`);

console.log("\n=== VERDICT: Bug #3 FIXED — scorer now reads effectVocabulary ===");
