import { validateEDL } from "../src/server/lib/edl-validator";
import { generateDeterministicEDL } from "../src/server/lib/deterministic-edl";
import type { MonetEDL } from "../src/server/types/edl";
import type { AnalysisResult } from "../src/server/types/analysis";
import type { NormalizedIntent } from "../src/server/lib/intent-normalization";

console.log("=== STARTING EDL QUALITY VALIDATION ENGINE TEST ===\n");

// 1. Setup Mock Analysis and Mock Intent Data
const mockAnalysis: AnalysisResult = {
  projectId: "project-1",
  footage: [
    {
      clipId: "clip-a",
      duration: 60.0,
      format: { width: 1920, height: 1080, fps: 30, duration: 60 },
      characteristics: { motionIntensity: 0.5, emotionVibe: "intense" },
      segments: [
        {
          id: "clip-a:0:10",
          start: 0,
          end: 10,
          duration: 10,
          scores: { overall: 0.8, motion: 0.6, emotion: 0.7 },
          tags: ["action", "closeups"],
          description: "Close up action shot",
        },
        {
          id: "clip-a:10:20",
          start: 10,
          end: 20,
          duration: 10,
          scores: { overall: 0.9, motion: 0.8, emotion: 0.8 },
          tags: ["action"],
          description: "High speed drift",
        },
      ],
    },
  ],
  music: {
    musicId: "music-1",
    bpm: 120,
    beatGrid: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0],
    overallVibe: "hype",
    confidence: 0.95,
  },
};

const mockIntent: NormalizedIntent = {
  version: "1.0.0",
  goal: { primary: "Make an awesome hype AMV" },
  style: { genre: "anime_amv", pacing: "fast", mood: ["intense"] },
  structure: { duration: 10.0, energyCurve: [0.5, 0.8, 0.9, 0.5] },
  technical: {
    syncToBeat: true,
    beatSyncStrength: 0.8,
    transitionStyle: "cut",
    colorTreatment: "vibrant",
    effectsIntensity: 0.6,
  },
  contentPreferences: { focusOn: ["action"] },
  prompt: "Make a 10s hype edit",
  durationSeconds: 10.0,
  styleName: "anime_amv",
  constraints: [],
};

// 2. Test Case 1: Perfectly Valid EDL
console.log("--- TEST 1: PERFECTLY VALID EDL ---");
const validEdl: MonetEDL = {
  version: "1.0.0",
  metadata: {
    title: "Test Edit",
    createdAt: Date.now(),
    aiModel: "test-model",
    prompt: "Make a 10s hype edit",
    intentId: "intent-1",
    analysisId: "analysis-1",
  },
  timeline: {
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    duration: 10.0,
  },
  shots: [
    {
      id: "shot-1",
      source: { clipId: "clip-a", inPoint: 0.0, outPoint: 2.0 },
      timing: { startTime: 0.0, duration: 2.0 },
      beatLock: { beatIndex: 0, lockMode: "start" },
    },
    {
      id: "shot-2",
      source: { clipId: "clip-a", inPoint: 2.0, outPoint: 4.5 },
      timing: { startTime: 2.0, duration: 2.5 },
      beatLock: { beatIndex: 4, lockMode: "start" },
    },
    {
      id: "shot-3",
      source: { clipId: "clip-a", inPoint: 4.5, outPoint: 7.0 },
      timing: { startTime: 4.5, duration: 2.5 },
      beatLock: { beatIndex: 9, lockMode: "start" },
    },
    {
      id: "shot-4",
      source: { clipId: "clip-a", inPoint: 10.0, outPoint: 13.0 },
      timing: { startTime: 7.0, duration: 3.0 },
      beatLock: { beatIndex: 14, lockMode: "start" },
    },
  ],
};

const result1 = validateEDL({ edl: validEdl, intent: mockIntent, analysis: mockAnalysis });
console.log(`IsValid: ${result1.isValid}`);
console.log(`Errors (expected none): ${JSON.stringify(result1.errors)}\n`);
if (!result1.isValid) {
  console.error("FAILED: Valid EDL marked as invalid!");
  process.exit(1);
}

// 3. Test Case 2: Duration Deviations (More than ±2s)
console.log("--- TEST 2: DURATION DEVIATION DETECTION ---");
const invalidDurationEdl: MonetEDL = {
  ...validEdl,
  timeline: { ...validEdl.timeline, duration: 15.0 }, // 15s instead of 10s
};
const result2 = validateEDL({ edl: invalidDurationEdl, intent: mockIntent, analysis: mockAnalysis });
console.log(`IsValid (expected false): ${result2.isValid}`);
console.log(`Errors caught:\n${result2.errors.join("\n")}\n`);
if (result2.isValid || result2.errors.length === 0) {
  console.error("FAILED: Did not detect timeline duration deviation!");
  process.exit(1);
}

// 4. Test Case 3: Shot > 30% of total duration (ceiling clamp violation)
console.log("--- TEST 3: SHOT EXCEEDING 30% DURATION DETECTION ---");
const invalidShotCeilingEdl: MonetEDL = {
  ...validEdl,
  shots: [
    {
      id: "shot-1",
      source: { clipId: "clip-a", inPoint: 0.0, outPoint: 4.0 },
      timing: { startTime: 0.0, duration: 4.0 }, // 4s exceeds 30% of 10s (3s)
      beatLock: { beatIndex: 0, lockMode: "start" },
    },
    {
      id: "shot-2",
      source: { clipId: "clip-a", inPoint: 4.0, outPoint: 10.0 },
      timing: { startTime: 4.0, duration: 6.0 }, // 6s also exceeds
      beatLock: { beatIndex: 8, lockMode: "start" },
    },
  ],
};
const result3 = validateEDL({ edl: invalidShotCeilingEdl, intent: mockIntent, analysis: mockAnalysis });
console.log(`IsValid (expected false): ${result3.isValid}`);
console.log(`Errors caught:\n${result3.errors.join("\n")}\n`);
if (result3.isValid || result3.errors.length === 0) {
  console.error("FAILED: Did not detect shot exceeding 30% duration limit!");
  process.exit(1);
}

// 5. Test Case 4: Overlapping timeline shots
console.log("--- TEST 4: TIMELINE OVERLAP DETECTION ---");
const overlappingEdl: MonetEDL = {
  ...validEdl,
  shots: [
    {
      id: "shot-1",
      source: { clipId: "clip-a", inPoint: 0.0, outPoint: 2.0 },
      timing: { startTime: 0.0, duration: 2.0 },
      beatLock: { beatIndex: 0, lockMode: "start" },
    },
    {
      id: "shot-2",
      source: { clipId: "clip-a", inPoint: 2.0, outPoint: 5.0 },
      timing: { startTime: 1.5, duration: 3.5 }, // Starts before shot-1 ends (1.5 < 2.0)
      beatLock: { beatIndex: 3, lockMode: "start" },
    },
    {
      id: "shot-3",
      source: { clipId: "clip-a", inPoint: 5.0, outPoint: 10.0 },
      timing: { startTime: 5.0, duration: 5.0 },
      beatLock: { beatIndex: 10, lockMode: "start" },
    },
  ],
};
const result4 = validateEDL({ edl: overlappingEdl, intent: mockIntent, analysis: mockAnalysis });
console.log(`IsValid (expected false): ${result4.isValid}`);
console.log(`Errors caught:\n${result4.errors.join("\n")}\n`);
if (result4.isValid || result4.errors.length === 0) {
  console.error("FAILED: Did not detect timeline overlap!");
  process.exit(1);
}

// 6. Test Case 5: Referential clip integrity violation
console.log("--- TEST 5: CLIP REFERENTIAL INTEGRITY VIOLATION DETECTION ---");
const badClipRefEdl: MonetEDL = {
  ...validEdl,
  shots: [
    {
      id: "shot-1",
      source: { clipId: "non-existent-clip", inPoint: 0.0, outPoint: 2.0 },
      timing: { startTime: 0.0, duration: 2.0 },
      beatLock: { beatIndex: 0, lockMode: "start" },
    },
    {
      id: "shot-2",
      source: { clipId: "clip-a", inPoint: 2.0, outPoint: 10.0 },
      timing: { startTime: 2.0, duration: 8.0 },
      beatLock: { beatIndex: 4, lockMode: "start" },
    },
  ],
};
const result5 = validateEDL({ edl: badClipRefEdl, intent: mockIntent, analysis: mockAnalysis });
console.log(`IsValid (expected false): ${result5.isValid}`);
console.log(`Errors caught:\n${result5.errors.join("\n")}\n`);
if (result5.isValid || result5.errors.length === 0) {
  console.error("FAILED: Did not detect invalid clip ID references!");
  process.exit(1);
}

// 7. Test Case 6: Deterministic generator compliance test
console.log("--- TEST 6: DETERMINISTIC EDL FALLBACK TIMELINE COMPLIANCE ---");
const generatedEdl = generateDeterministicEDL({
  intent: mockIntent,
  analysis: mockAnalysis,
  intentId: "intent-1",
  analysisId: "analysis-1",
  projectId: "project-1",
  prompt: "Make a 10s hype edit",
  durationSeconds: 10.0,
});

console.log("Generated EDL Timeline duration:", generatedEdl.timeline.duration);
console.log("Generated Shots:", JSON.stringify(generatedEdl.shots.map(s => ({ id: s.id, clipId: s.source.clipId, startTime: s.timing.startTime, duration: s.timing.duration })), null, 2));

const result6 = validateEDL({ edl: generatedEdl, intent: mockIntent, analysis: mockAnalysis });
console.log(`Generated EDL IsValid: ${result6.isValid}`);
if (!result6.isValid) {
  console.error(`FAILED: The deterministic EDL generator fallback output is invalid! Errors:\n${result6.errors.join("\n")}`);
  process.exit(1);
}

console.log("\n=== ALL EDL QUALITY TESTS PASSED TRIUMPHANTLY! ===");
