import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const SpeedRampParams = z.object({
  clipId: z.string().describe("ID of the clip"),
  fromSpeed: z.number().min(0.1).max(4).default(1).describe("Starting playback speed"),
  toSpeed: z.number().min(0.1).max(4).default(0.3).describe("Peak slow-mo speed (minimum during ramp)"),
  duration: z.number().min(0.1).max(30).default(2).describe("Duration of the speed ramp effect in seconds"),
});

type SpeedRampParams = z.infer<typeof SpeedRampParams>;

export const SpeedRampCapability: Capability<SpeedRampParams> = {
  id: "speed-ramp",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Create a speed ramp effect: start at fromSpeed, slow to toSpeed at the midpoint, then accelerate back to fromSpeed. Produces the classic V-shaped speed curve used in sports highlights and action edits.",
  triggerPhrases: [
    "speed ramp",
    "slow motion ramp",
    "variable speed",
    "slow then fast",
    "v shape speed",
    "speed up then slow down",
  ],
  params: SpeedRampParams,
  compile: (input) => {
    const midTime = input.duration * 0.5;
    return [
      { type: "clip/update", id: `sr-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, speed: input.fromSpeed } },
      { type: "keyframe/add", id: `sr-${Date.now()}-1`, timestamp: Date.now(), params: { clipId: input.clipId, property: "playbackSpeed", time: 0, value: input.fromSpeed, easing: "easeInQuad" } },
      { type: "keyframe/add", id: `sr-${Date.now()}-2`, timestamp: Date.now(), params: { clipId: input.clipId, property: "playbackSpeed", time: midTime, value: input.toSpeed, easing: "easeOutQuad" } },
      { type: "keyframe/add", id: `sr-${Date.now()}-3`, timestamp: Date.now(), params: { clipId: input.clipId, property: "playbackSpeed", time: input.duration, value: input.fromSpeed, easing: "easeInOutQuad" } },
    ];
  },
  examples: [
    {
      input: { clipId: "clip-1", fromSpeed: 1, toSpeed: 0.3, duration: 2 },
      output: [
        { type: "clip/update", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", speed: 1 } },
        { type: "keyframe/add", id: "ex-2", timestamp: 0, params: { clipId: "clip-1", property: "playbackSpeed", time: 0, value: 1, easing: "easeInQuad" } },
        { type: "keyframe/add", id: "ex-3", timestamp: 0, params: { clipId: "clip-1", property: "playbackSpeed", time: 1, value: 0.3, easing: "easeOutQuad" } },
        { type: "keyframe/add", id: "ex-4", timestamp: 0, params: { clipId: "clip-1", property: "playbackSpeed", time: 2, value: 1, easing: "easeInOutQuad" } },
      ],
    },
  ],
};

registerCapability(SpeedRampCapability);
