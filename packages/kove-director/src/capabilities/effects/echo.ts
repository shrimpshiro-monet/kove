import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  decay: z.number().min(0).max(1).default(0.5).describe("Echo decay factor (0 = instant fade, 1 = persistent trail)"),
  duration: z.number().min(0.1).max(5).default(1).describe("Duration of the echo effect in seconds"),
});

type P = z.infer<typeof Params>;

export const EchoCapability: Capability<P> = {
  id: "echo",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Motion trails / echo effect that creates ghosted copies of movement fading over time. Great for dance sequences and fast motion.",
  triggerPhrases: [
    "echo",
    "motion trails",
    "ghost trail",
    "afterimage",
    "trail effect",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `echo-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "echo",
        params: { decay: input.decay, duration: input.duration },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", decay: 0.6, duration: 1 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "echo", params: { decay: 0.6, duration: 1 } },
        },
      ],
    },
  ],
};

registerCapability(EchoCapability);
