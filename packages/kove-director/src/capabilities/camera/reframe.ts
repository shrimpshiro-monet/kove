import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to reframe"),
  targetRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]).default("9:16").describe("Target aspect ratio"),
  lockSubject: z.enum(["center", "face", "motion"]).default("center").describe("How to lock onto the subject"),
});

type P = z.infer<typeof Params>;

export const ReframeCapability: Capability<P> = {
  id: "reframe",
  category: "camera",
  status: "alpha",
  version: "1.0.0",
  description: "Auto-reframe video to a different aspect ratio while keeping the subject in frame. Uses smart cropping with subject tracking.",
  triggerPhrases: [
    "reframe",
    "crop to vertical",
    "make it vertical",
    "9:16",
    "square crop",
    "vertical video",
    "horizontal to vertical",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "clip/update",
      id: `rf-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        reframe: {
          targetRatio: input.targetRatio,
          lockSubject: input.lockSubject,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", targetRatio: "9:16", lockSubject: "center" },
      output: [
        {
          type: "clip/update",
          id: "ex-1",
          timestamp: 0,
          params: { clipId: "clip-1", reframe: { targetRatio: "9:16", lockSubject: "center" } },
        },
      ],
    },
  ],
};

registerCapability(ReframeCapability);
