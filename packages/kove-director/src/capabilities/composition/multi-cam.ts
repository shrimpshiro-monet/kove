import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to use as an angle"),
  angleName: z.string().default("Angle 1").describe("Name for this camera angle"),
  syncMethod: z.enum(["audio-waveform", "timecode", "manual"]).default("audio-waveform").describe("How to sync angles"),
});

type P = z.infer<typeof Params>;

export const MultiCamCapability: Capability<P> = {
  id: "multi-cam",
  category: "composition",
  status: "alpha",
  version: "1.0.0",
  description: "Multi-camera editing: group clips as angles for synchronized switching. Supports audio waveform sync, timecode sync, or manual alignment.",
  triggerPhrases: [
    "multi cam",
    "multicam",
    "camera angles",
    "switch angles",
    "multi-camera",
    "angle switch",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `mc-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "multi_cam",
        params: { angleName: input.angleName, syncMethod: input.syncMethod },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", angleName: "Wide Shot", syncMethod: "audio-waveform" },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "multi_cam", params: { angleName: "Wide Shot", syncMethod: "audio-waveform" } },
        },
      ],
    },
  ],
};

registerCapability(MultiCamCapability);
