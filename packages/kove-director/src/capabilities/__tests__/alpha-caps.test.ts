/**
 * alpha-caps.test.ts — Smoke tests for all 38 alpha capabilities.
 *
 * For each alpha cap: builds plausible input + context, calls compile(),
 * asserts the returned actions are structurally valid.
 *
 * Run: npx tsx packages/kove-director/src/capabilities/__tests__/alpha-caps.test.ts
 */

import "../index";
import { lookupCapability, getStats, getLegacyIds } from "../registry";
import type { CapabilityContext } from "../types";

// ============================================================================
// TEST CONTEXT
// ============================================================================

const TEST_CONTEXT: CapabilityContext = {
  duration: 19.0,
  selectedClipIds: ["clip-1"],
  trackId: "video-main",
  currentClip: {
    id: "clip-1",
    mediaId: "footage-1",
    duration: 5.0,
    inPoint: 2.0,
    outPoint: 7.0,
    startTime: 0,
  },
};

// ============================================================================
// TEST HELPERS
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else { failed++; console.log(`  ✗ ${message}`); }
}

function assertActions(actions: unknown[], capId: string): void {
  assert(Array.isArray(actions), `${capId}: compile() returns array`);
  assert(actions.length > 0, `${capId}: returns at least 1 action`);
  for (const action of actions) {
    const a = action as Record<string, unknown>;
    assert(typeof a.type === "string", `${capId}: action has string type`);
    assert(typeof a.id === "string", `${capId}: action has string id`);
    assert(typeof a.timestamp === "number", `${capId}: action has number timestamp`);
    assert(a.params !== undefined, `${capId}: action has params`);
  }
}

// ============================================================================
// ALPHA CAPABILITY INPUTS
// ============================================================================

const ALPHA_INPUTS: Record<string, { input: Record<string, unknown>; context?: CapabilityContext }> = {
  // Edit
  "split-clip": { input: { clipId: "clip-1", splitTime: 2.5 }, context: TEST_CONTEXT },
  "trim-clip": { input: { clipId: "clip-1", edge: "start", newTime: 1.0 }, context: TEST_CONTEXT },
  "delete-clip": { input: { clipId: "clip-1" } },
  "move-clip": { input: { clipId: "clip-1", newStartTime: 5.0 } },
  "speed-static": { input: { clipId: "clip-1", speed: 0.5 } },
  "speed-ramp": { input: { clipId: "clip-1", fromSpeed: 1, toSpeed: 0.3, duration: 2 } },
  "beat-cut": { input: { clipId: "clip-1" } },

  // Effects
  "push-in": { input: { clipId: "clip-1", intensity: 0.7 } },
  "pull-out": { input: { clipId: "clip-1", intensity: 0.7 } },
  "shake": { input: { clipId: "clip-1", intensity: 0.4 } },
  "flash": { input: { clipId: "clip-1", intensity: 0.8 } },
  "whip-pan": { input: { clipId: "clip-1", intensity: 0.6 } },
  "color-grade": { input: { target: "timeline", preset: "warm" }, context: TEST_CONTEXT },

  // Audio
  "volume": { input: { clipId: "clip-1", volume: 0.5 } },
  "audio-fade": { input: { clipId: "clip-1", fadeIn: 1, fadeOut: 0 } },
  "beat-sync": { input: { clipId: "clip-1", mode: "cuts", sensitivity: 0.5 } },
  "ducking": { input: { musicTrackId: "audio-music", duckAmount: 0.3 } },

  // Camera
  "crop": { input: { clipId: "clip-1", x: 0, y: 0.1, width: 1, height: 0.9 } },

  // Composition
  "multi-track": { input: { trackType: "audio", name: "Audio" } },

  // Overlays
  "text-overlay": { input: { text: "Hello World" } },

  // Transitions (all 19)
  "crossfade": { input: { clipAId: "prev", clipBId: "next", duration: 0.5 } },
  "dip-to-black": { input: {} },
  "flash-transition": { input: {} },
  "slide": { input: {} },
  "glitch": { input: {} },
  "whip-pan": { input: {} },
  "zoom-blur": { input: {} },
  "radial-wipe": { input: {} },
  "linear-wipe": { input: {} },
  "gradient-wipe": { input: {} },
  "barn-doors": { input: {} },
  "morph": { input: {} },
  "iris": { input: {} },
  "pinwheel": { input: {} },
  "film-burn": { input: {} },
  "spin": { input: {} },
  "blur": { input: {} },
  "pixelate": { input: {} },
  "dissolve": { input: {} },
};

// ============================================================================
// RUN TESTS
// ============================================================================

console.log("\n=== Alpha Capability Smoke Tests ===\n");

const stats = getStats();
console.log(`Registry: ${stats.total} total, ${stats.alpha} alpha, ${stats.beta} beta, ${stats.planned} planned, ${stats.legacy} legacy\n`);

let testedCount = 0;

for (const [capId, { input, context }] of Object.entries(ALPHA_INPUTS)) {
  const cap = lookupCapability(capId);
  if (!cap) {
    console.log(`  ✗ ${capId}: NOT FOUND in registry`);
    failed++;
    continue;
  }

  if (cap.status !== "alpha") {
    console.log(`  ✗ ${capId}: status is ${cap.status}, expected alpha`);
    failed++;
    continue;
  }

  try {
    const actions = (cap as any).compile(input, context ?? TEST_CONTEXT);
    assertActions(actions, capId);
    testedCount++;
  } catch (err) {
    console.log(`  ✗ ${capId}: compile() threw — ${(err as Error).message}`);
    failed++;
  }
}

// ============================================================================
// BUG FIX VERIFICATION
// ============================================================================

console.log("\n=== Bug Fix Verification ===\n");

// Bug 1: split-clip returns valid duration/outPoint on both halves
const splitCap = lookupCapability("split-clip");
if (splitCap) {
  const actions = (splitCap as any).compile(
    { clipId: "clip-1", splitTime: 2.5 },
    TEST_CONTEXT,
  );
  const clipA = actions[0]?.params;
  const clipB = actions[1]?.params;
  assert(clipA?.duration === 2.5, "split-clip: clipA duration = splitTime");
  assert(clipA?.outPoint === 4.5, "split-clip: clipA outPoint = inPoint + splitTime");
  assert(clipB?.duration === 2.5, "split-clip: clipB duration = original - splitTime");
  assert(clipB?.outPoint === 7.0, "split-clip: clipB outPoint = original outPoint");
  assert(clipB?.startTime === 2.5, "split-clip: clipB startTime = splitTime");
  assert(clipA?.mediaId === "footage-1", "split-clip: clipA has real mediaId");
  assert(clipB?.mediaId === "footage-1", "split-clip: clipB has real mediaId");
}

// Bug 2: color-grade derives target from context
const cgCap = lookupCapability("color-grade");
if (cgCap) {
  const actionsNoSelection = (cgCap as any).compile(
    { target: "timeline", preset: "warm" },
    { ...TEST_CONTEXT, selectedClipIds: [] },
  );
  assert(actionsNoSelection[0]?.params?.target === "timeline", "color-grade: no selection → target=timeline");

  const actionsWithSelection = (cgCap as any).compile(
    { target: "timeline", preset: "warm" },
    { ...TEST_CONTEXT, selectedClipIds: ["clip-3"] },
  );
  assert(actionsWithSelection[0]?.params?.target === "clip", "color-grade: selection → target=clip");
  assert(actionsWithSelection[0]?.params?.targetId === "clip-3", "color-grade: selection → targetId=first selected");
}

// Bug 3: no cosmetic issues in transition exports
const crossCap = lookupCapability("crossfade");
assert(crossCap?.id === "crossfade", "crossfade: correct id (no U prefix)");

// ============================================================================
// BETA/PLANNED THROW ON COMPILE
// ============================================================================

console.log("\n=== Beta/Planned Throw on Compile ===\n");

const betaIds = ["freeze-frame", "posterize-time", "undo-redo", "background-blur", "player-glow"];
let throwCount = 0;
for (const id of betaIds) {
  const cap = lookupCapability(id);
  if (!cap) { console.log(`  ✗ ${id}: not found`); failed++; continue; }
  try {
    (cap as any).compile({}, TEST_CONTEXT);
    console.log(`  ✗ ${id}: should have thrown`);
    failed++;
  } catch {
    throwCount++;
  }
}
assert(throwCount === betaIds.length, `All ${betaIds.length} beta caps throw on compile()`);

// ============================================================================
// SUMMARY
// ============================================================================

console.log(`\n=== Results: ${passed} passed, ${failed} failed (${testedCount} alpha caps tested) ===\n`);
process.exit(failed > 0 ? 1 : 0);
