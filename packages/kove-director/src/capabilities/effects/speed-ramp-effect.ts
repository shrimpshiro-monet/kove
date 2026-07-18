import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  from: z.number().min(0.1).max(4).default(1).describe("Starting speed multiplier"),
  to: z.number().min(0.1).max(4).default(0.3).describe("Target speed multiplier at midpoint"),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("easeInOut").describe("Transition easing"),
});

type P = z.infer<typeof Params>;

export const SpeedRampEffectCapability: Capability<P> = {
  id: "speed-ramp-effect",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Speed ramp as an effect overlay (applied on top of existing speed). Creates dynamic speed changes with easing curves for dramatic slowdowns and speed-ups.",
  triggerPhrases: [
    "speed ramp effect",
    "dynamic speed",
    "speed change",
    "slow-mo effect",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `sre-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "speed_ramp",
        params: { from: input.from, to: input.to, easing: input.easing },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", from: 1, to: 0.3, easing: "easeInOut" },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "speed_ramp", params: { from: 1, to: 0.3, easing: "easeInOut" } },
        },
      ],
    },
  ],
};

registerCapability(SpeedRampEffectCapability);
