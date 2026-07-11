import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const ShakeParams = z.object({
  clipId: z.string(),
  intensity: z.number().min(0).max(1).default(0.4),
});

type ShakeParams = z.infer<typeof ShakeParams>;

export const ShakeCapability: Capability<ShakeParams> = {
  id: "shake",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Impact camera shake. 18Hz procedural jitter with exponential decay.",
  triggerPhrases: ["shake", "camera shake", "impact shake", "make it hit harder"],
  params: ShakeParams,
  compile: (input) => [
    { type: "effect/apply", id: `sk-${Date.now()}`, timestamp: Date.now(), params: { target: "clip", targetId: input.clipId, kind: "custom", effectType: "context_shake", params: { intensity: input.intensity } } },
  ],
  examples: [{ input: { clipId: "clip-1", intensity: 0.4 }, output: [{ type: "effect/apply", id: "ex-1", timestamp: 0, params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "context_shake", params: { intensity: 0.4 } } }] }],
};

registerCapability(ShakeCapability);
