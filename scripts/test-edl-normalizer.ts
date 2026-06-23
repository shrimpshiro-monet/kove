import { normalizeCreativeEDL } from "../src/server/lib/edl-normalizer";
import {
  CANVAS_PREVIEW_CAPABILITIES,
  FFMPEG_EXPORT_CAPABILITIES,
} from "../src/server/types/edl-capabilities";
import type { MonetEDL } from "../src/server/types/edl";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const edl: MonetEDL = {
  version: "1.0.0",
  metadata: {
    title: "Normalizer Test",
    createdAt: Date.now(),
    aiModel: "test",
    prompt: "test",
    intentId: "intent-test",
    analysisId: "analysis-test",
  },
  timeline: {
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    duration: 10,
  },
  shots: [
    {
      id: "shot-1",
      source: {
        clipId: "clip-a",
        inPoint: 0,
        outPoint: 3,
      },
      timing: {
        startTime: 0,
        duration: 3,
        speed: 1,
        speedRamp: {
          startSpeed: -1,
          endSpeed: 0,
          easing: "linear"
        },
      },
      transition: {
        type: "glitch",
        duration: 0.25,
      },
      effects: [
        {
          id: "fx-face",
          type: "facialBlur" as any,
          intensity: 1,
          params: {},
        },
        {
          id: "fx-custom",
          type: "particles" as any,
          intensity: 1,
          params: {},
        },
      ],
    },
  ],
  textOverlays: [
    {
      id: "text-1",
      text: "HELLO",
      startTime: 0,
      endTime: 2,
      style: {
        fontFamily: "Some Custom Font",
        fontSize: 48,
        color: "#ffffff",
      },
    },
  ],
};

const canvasResult = normalizeCreativeEDL(edl, CANVAS_PREVIEW_CAPABILITIES);

assert(canvasResult.ok, "Canvas normalization should succeed.");
assert(canvasResult.value.warnings.length > 0, "Canvas normalization should produce warnings.");
assert(
  canvasResult.value.edl.shots[0].transition?.type === "crossfade",
  "Unsupported glitch transition should downgrade to crossfade."
);
assert(
  canvasResult.value.edl.shots[0].timing.speedRamp?.startSpeed === 0.1,
  "Illegal speed ramp startSpeed should clamp to 0.1."
);
assert(
  canvasResult.value.edl.textOverlays?.[0]?.style?.fontFamily === "system-ui, sans-serif",
  "Unsupported custom font should fallback."
);

const ffmpegResult = normalizeCreativeEDL(edl, FFMPEG_EXPORT_CAPABILITIES, {
  hasFaceTrack: true,
});

assert(ffmpegResult.ok, "FFmpeg normalization should succeed.");
assert(
  ffmpegResult.value.edl.shots[0].transition?.type === "glitch",
  "FFmpeg should retain glitch transition."
);

console.log("EDL normalizer tests passed.", {
  canvasWarnings: canvasResult.value.warnings.map((w) => w.code),
  ffmpegWarnings: ffmpegResult.value.warnings.map((w) => w.code),
});
