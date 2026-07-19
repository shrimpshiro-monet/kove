/**
 * round-trip.test.ts — Validates MonetEDL ↔ OpenReel round-trip fidelity
 *
 * Run: npx tsx packages/openreel-adapter/src/__tests__/round-trip.test.ts
 */

import type { ProjectEDL as MonetEDL } from "@monet/edl";
import { convertEDLToOpenReelProject } from "../edl-to-openreel";
import { openReelProjectToMonetEDL, validateRoundTrip } from "../openreel-to-edl";

// ============================================================================
// FIXTURES
// ============================================================================

function makeFixtureEDL(): MonetEDL {
  return {
    version: 1,
    id: "test-edl-001",
    meta: {
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      aspectRatio: "9:16",
      fps: 30,
      sampleRate: 48000,
    },
    assets: {
      media: {
        "footage-1": { id: "footage-1", path: "curry-highlight.mp4", duration: 12.5, width: 1920, height: 1080 },
        "footage-2": { id: "footage-2", path: "curry-three.mp4", duration: 8.0, width: 1920, height: 1080 },
      },
      audio: {
        "music-1": { id: "music-1", path: "beat.mp3", duration: 30.0 },
      },
      overlays: {},
    },
    timeline: {
      duration: 19.0,
      tracks: [
        {
          id: "video-main",
          type: "video",
          order: 0,
          locked: false,
          hidden: false,
          clips: [
            {
              id: "clip-001",
              mediaId: "footage-1",
              startTime: 0,
              duration: 5.0,
              inPoint: 2.0,
              outPoint: 7.0,
              speed: 1.0,
              transforms: {
                position: [{ time: 0, x: 0, y: 0 }],
                scale: [{ time: 0, value: 1.0 }],
                rotation: [{ time: 0, value: 0 }],
              },
              audio: { gain: 0.9 },
              effects: [
                { id: "fx-1", type: "color_grade", start: 0, duration: 5.0, params: { saturation: 1.2 } },
              ],
              meta: { semanticEvent: "highlight", shotType: "close_up", importance: 0.9 },
            },
            {
              id: "clip-002",
              mediaId: "footage-2",
              startTime: 5.0,
              duration: 4.0,
              inPoint: 1.0,
              outPoint: 5.0,
              speed: 0.5,
              transforms: {
                position: [{ time: 0, x: 0, y: 0 }],
                scale: [{ time: 0, value: 1.15 }],
                rotation: [{ time: 0, value: 0 }],
              },
              audio: { gain: 1.0 },
              effects: [],
              meta: { semanticEvent: "slow_motion", shotType: "medium" },
            },
          ],
        },
        {
          id: "audio-music",
          type: "audio",
          order: 1,
          locked: false,
          hidden: false,
          clips: [
            {
              id: "music-clip-001",
              mediaId: "music-1",
              startTime: 0,
              duration: 19.0,
              inPoint: 0,
              outPoint: 19.0,
              speed: 1.0,
              transforms: {
                position: [{ time: 0, x: 0, y: 0 }],
                scale: [{ time: 0, value: 1 }],
                rotation: [{ time: 0, value: 0 }],
              },
              audio: { gain: 0.7 },
              effects: [],
              meta: {},
            },
          ],
        },
      ],
      markers: [
        { id: "marker-1", time: 2.5, label: "beat_1", type: "beat" },
        { id: "marker-2", time: 7.0, label: "hook", type: "hook" },
      ],
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\n=== Test 1: Forward + Reverse round-trip ===");

const edl = makeFixtureEDL();
const openreelProject = convertEDLToOpenReelProject(edl, [
  { id: "footage-1", name: "curry-highlight.mp4", type: "video", duration: 12.5, width: 1920, height: 1080 },
  { id: "footage-2", name: "curry-three.mp4", type: "video", duration: 8.0, width: 1920, height: 1080 },
  { id: "music-1", name: "beat.mp3", type: "audio", duration: 30.0, width: 0, height: 0 },
]);

assertEq(openreelProject.id, "test-edl-001", "Forward: project ID preserved");
assertEq(openreelProject.settings.frameRate, 30, "Forward: fps preserved");
assertEq(openreelProject.timeline.tracks.length, 2, "Forward: 2 tracks created");

const { edl: reconstructed, debug: _debug } = openReelProjectToMonetEDL(openreelProject, { debug: true });

assertEq(reconstructed.version, 1, "Reverse: version is 1");
assertEq(reconstructed.id, "test-edl-001", "Reverse: ID preserved");
assertEq(reconstructed.meta.fps, 30, "Reverse: fps preserved");
assertEq(reconstructed.meta.sampleRate, 48000, "Reverse: sampleRate preserved");
assertEq(reconstructed.meta.aspectRatio, "9:16", "Reverse: aspectRatio computed correctly");
assertEq(reconstructed.timeline.duration, 19.0, "Reverse: duration preserved");
assertEq(reconstructed.timeline.tracks.length, 2, "Reverse: 2 tracks");

const videoTrack = reconstructed.timeline.tracks[0];
assertEq(videoTrack.type, "video", "Reverse: video track type");
assertEq(videoTrack.clips.length, 2, "Reverse: 2 video clips");

const clip1 = videoTrack.clips[0];
assertEq(clip1.id, "clip-001", "Reverse: clip 1 ID");
assertEq(clip1.mediaId, "footage-1", "Reverse: clip 1 mediaId");
assertEq(clip1.startTime, 0, "Reverse: clip 1 startTime");
assertEq(clip1.duration, 5.0, "Reverse: clip 1 duration");
assertEq(clip1.inPoint, 2.0, "Reverse: clip 1 inPoint");
assertEq(clip1.outPoint, 7.0, "Reverse: clip 1 outPoint");
assertEq(clip1.speed, 1.0, "Reverse: clip 1 speed");
assertEq(clip1.audio.gain, 0.9, "Reverse: clip 1 audio gain");
assertEq(clip1.effects.length, 1, "Reverse: clip 1 has 1 effect");
assertEq(clip1.effects[0].type, "color_grade", "Reverse: clip 1 effect type");
assertEq(clip1.meta?.semanticEvent, "highlight", "Reverse: clip 1 Kove metadata preserved");
assertEq(clip1.meta?.shotType, "close_up", "Reverse: clip 1 shotType preserved");

const clip2 = videoTrack.clips[1];
assertEq(clip2.speed, 0.5, "Reverse: clip 2 speed (slow-mo)");
assertEq(clip2.transforms.scale[0].value, 1.15, "Reverse: clip 2 scale preserved");
assertEq(clip2.meta?.semanticEvent, "slow_motion", "Reverse: clip 2 Kove metadata preserved");

const audioTrack = reconstructed.timeline.tracks[1];
assertEq(audioTrack.type, "audio", "Reverse: audio track type");
assertEq(audioTrack.clips.length, 1, "Reverse: 1 audio clip");
assertEq(audioTrack.clips[0].audio.gain, 0.7, "Reverse: audio clip gain");

assertEq(reconstructed.timeline.markers.length, 2, "Reverse: 2 markers");
assertEq(reconstructed.timeline.markers[0].label, "beat_1", "Reverse: marker 1 label");

assertEq(Object.keys(reconstructed.assets.media).length, 2, "Reverse: 2 media assets");
assertEq(Object.keys(reconstructed.assets.audio).length, 1, "Reverse: 1 audio asset");

console.log("\n=== Test 2: validateRoundTrip ===");

const roundTrip = validateRoundTrip(edl, reconstructed);
assert(roundTrip.success, `Round-trip validation ${roundTrip.success ? "passed" : "failed"}`);
if (!roundTrip.success) {
  console.log("  Mismatches:", roundTrip.mismatches);
}

console.log("\n=== Test 3: Debug mode logs unmapped fields ===");

// Create an OpenReel clip with unmapped keyframe properties
const customProject = {
  ...openreelProject,
  timeline: {
    ...openreelProject.timeline,
    tracks: [
      {
        ...openreelProject.timeline.tracks[0],
        clips: [
          {
            ...openreelProject.timeline.tracks[0].clips[0],
            keyframes: [
              { id: "kf-1", time: 0, property: "position.x", value: 10, easing: "linear" as const },
              { id: "kf-2", time: 0, property: "customEffect.amount", value: 0.5, easing: "linear" as const },
            ],
          },
          ...openreelProject.timeline.tracks[0].clips.slice(1),
        ],
      },
      ...openreelProject.timeline.tracks.slice(1),
    ],
  },
};

const { debug: debugOutput } = openReelProjectToMonetEDL(customProject, { debug: true });
const unmappedLogs = debugOutput.filter((l) => l.message.includes("Unmapped"));
assert(unmappedLogs.length > 0, "Debug mode logs unmapped keyframe properties");
assert(unmappedLogs[0].field === "customEffect.amount", "Debug: unmapped field identified correctly");

console.log("\n=== Test 4: Manual edit preservation (simulated) ===");

// Simulate user manually trimming clip 2 and adding an effect
const manualEditProject = {
  ...openreelProject,
  timeline: {
    ...openreelProject.timeline,
    tracks: [
      {
        ...openreelProject.timeline.tracks[0],
        clips: [
          openreelProject.timeline.tracks[0].clips[0],
          {
            ...openreelProject.timeline.tracks[0].clips[1],
            duration: 3.0,           // user trimmed from 4.0 → 3.0
            outPoint: 4.0,           // user adjusted out point
            speed: 0.75,             // user changed speed
            effects: [
              { id: "user-fx-1", type: "blur", params: { amount: 0.3 }, enabled: true },
            ],
            meta: {
              ...openreelProject.timeline.tracks[0].clips[1].meta,
              userEdited: true,      // user annotation
            },
          },
        ],
      },
      ...openreelProject.timeline.tracks.slice(1),
    ],
  },
};

const { edl: manualReconstructed } = openReelProjectToMonetEDL(manualEditProject);
const manualClip2 = manualReconstructed.timeline.tracks[0].clips[1];

assertEq(manualClip2.duration, 3.0, "Manual edit: trimmed duration preserved");
assertEq(manualClip2.outPoint, 4.0, "Manual edit: adjusted outPoint preserved");
assertEq(manualClip2.speed, 0.75, "Manual edit: changed speed preserved");
assertEq(manualClip2.effects.length, 1, "Manual edit: user effect preserved");
assertEq(manualClip2.effects[0].type, "blur", "Manual edit: user effect type preserved");
assertEq(manualClip2.meta?.userEdited, true, "Manual edit: user annotation preserved");

// ============================================================================
// SUMMARY
// ============================================================================

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
