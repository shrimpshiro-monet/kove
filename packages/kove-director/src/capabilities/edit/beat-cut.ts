import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const BeatCutParams = z.object({
  clipId: z.string().describe("ID of the clip to align"),
  beatIndex: z.number().optional().describe("Which beat to align to"),
});

type BeatCutParams = z.infer<typeof BeatCutParams>;

export const BeatCutCapability: Capability<BeatCutParams> = {
  id: "beat-cut",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Hard cut at a beat boundary. Used when shots should align with music beats.",
  triggerPhrases: ["cut on the beat", "match the beat", "sync to the rhythm"],
  params: BeatCutParams,
  compile: (input) => [
    { type: "keyframe/add", id: `bc-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, property: "speed", time: 0, value: 1, easing: "linear" } },
  ],
  examples: [
    { input: { clipId: "clip-1" }, output: [{ type: "keyframe/add", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", property: "speed", time: 0, value: 1, easing: "linear" } }] },
  ],
};

registerCapability(BeatCutCapability);
