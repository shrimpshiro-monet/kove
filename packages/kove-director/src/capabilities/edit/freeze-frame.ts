import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const FreezeFrameParams = z.object({
  clipId: z.string().describe("ID of the clip to freeze"),
  atTime: z.number().min(0).default(0).describe("Time offset within the clip to freeze at"),
  holdDuration: z.number().min(0.1).max(30).default(0.5).describe("Duration of the freeze in seconds"),
});

type FreezeFrameParams = z.infer<typeof FreezeFrameParams>;

export const FreezeFrameCapability: Capability<FreezeFrameParams> = {
  id: "freeze-frame",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Hold a frame still for a specified duration. Creates a pause effect where the video freezes on a single frame, then resumes.",
  triggerPhrases: [
    "freeze frame",
    "hold that moment",
    "pause frame",
    "still frame",
    "freeze this shot",
  ],
  params: FreezeFrameParams,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `ff-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "freeze_frame",
        params: { atTime: input.atTime, holdDuration: input.holdDuration },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", atTime: 2, holdDuration: 1 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "freeze_frame", params: { atTime: 2, holdDuration: 1 } },
        },
      ],
    },
  ],
};

registerCapability(FreezeFrameCapability);
