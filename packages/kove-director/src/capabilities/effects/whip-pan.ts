import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const WhipPanParams = z.object({
  clipId: z.string(),
  intensity: z.number().min(0).max(1).default(0.6),
});

type WhipPanParams = z.infer<typeof WhipPanParams>;

export const WhipPanCapability: Capability<WhipPanParams> = {
  id: "whip-pan",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Motion blur + horizontal translation simulating a whip pan.",
  triggerPhrases: ["whip pan", "swish pan", "fast pan", "whip"],
  params: WhipPanParams,
  compile: (input) => [
    { type: "effect/apply", id: `wp-${Date.now()}`, timestamp: Date.now(), params: { target: "clip", targetId: input.clipId, kind: "custom", effectType: "whip_pan", params: { intensity: input.intensity } } },
  ],
  examples: [{ input: { clipId: "clip-1", intensity: 0.6 }, output: [{ type: "effect/apply", id: "ex-1", timestamp: 0, params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "whip_pan", params: { intensity: 0.6 } } }] }],
};

registerCapability(WhipPanCapability);
