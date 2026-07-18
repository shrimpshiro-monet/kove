import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  targetFps: z.number().min(1).max(60).default(12).describe("Target frame rate for the posterized effect"),
});

type P = z.infer<typeof Params>;

export const PosterizeTimeCapability: Capability<P> = {
  id: "posterize-time",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Lock clip to a specific frame rate for a choppy/stop-motion look. Reduces temporal resolution while keeping playback speed constant.",
  triggerPhrases: [
    "posterize time",
    "lock fps",
    "stop motion look",
    "choppy frame rate",
    "lower frame rate",
    "12 fps",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "clip/update",
      id: `pt-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        posterizeTime: input.targetFps,
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", targetFps: 12 },
      output: [
        {
          type: "clip/update",
          id: "ex-1",
          timestamp: 0,
          params: { clipId: "clip-1", posterizeTime: 12 },
        },
      ],
    },
  ],
};

registerCapability(PosterizeTimeCapability);
