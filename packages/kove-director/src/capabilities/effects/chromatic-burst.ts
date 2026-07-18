import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  intensity: z.number().min(0).max(1).default(0.7).describe("RGB split intensity (0–1)"),
  duration: z.number().min(0.05).max(3).default(0.15).describe("Duration of the chromatic burst in seconds"),
});

type P = z.infer<typeof Params>;

export const ChromaticBurstCapability: Capability<P> = {
  id: "chromatic-burst",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Brief RGB channel split (chromatic aberration) for glitch-energy moments. Separates color channels horizontally then snaps back, ideal for impact beats.",
  triggerPhrases: [
    "chromatic aberration",
    "rgb split",
    "color split",
    "chromatic burst",
    "rgb shift",
    "color glitch",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `cb-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "chromatic_burst",
        params: { intensity: input.intensity, duration: input.duration },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", intensity: 0.8, duration: 0.1 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "chromatic_burst", params: { intensity: 0.8, duration: 0.1 } },
        },
      ],
    },
  ],
};

registerCapability(ChromaticBurstCapability);
