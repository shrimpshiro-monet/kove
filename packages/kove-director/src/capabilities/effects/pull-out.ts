import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const PullOutParams = z.object({
  clipId: z.string(),
  intensity: z.number().min(0).max(1).default(0.7),
});

type PullOutParams = z.infer<typeof PullOutParams>;

export const PullOutCapability: Capability<PullOutParams> = {
  id: "pull-out",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Slow zoom-out Ken Burns effect. Scale decreases from ~1.15 to 1.0.",
  triggerPhrases: ["zoom out", "pull out", "ken burns out", "widen"],
  params: PullOutParams,
  compile: (input) => [
    { type: "effect/apply", id: `po-${Date.now()}`, timestamp: Date.now(), params: { target: "clip", targetId: input.clipId, kind: "custom", effectType: "pull_out", params: { intensity: input.intensity } } },
  ],
  examples: [{ input: { clipId: "clip-1", intensity: 0.7 }, output: [{ type: "effect/apply", id: "ex-1", timestamp: 0, params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "pull_out", params: { intensity: 0.7 } } }] }],
};

registerCapability(PullOutCapability);
