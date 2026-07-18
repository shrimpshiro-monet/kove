import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  intensity: z.number().min(0).max(1).default(0.85).describe("Vignette intensity (0–1)"),
  duration: z.number().min(0.1).max(5).default(0.5).describe("Duration of the vignette effect in seconds"),
});

type P = z.infer<typeof Params>;

export const VignettePunchCapability: Capability<P> = {
  id: "vignette-punch",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Animated vignette that darkens edges for dramatic emphasis. Peaks at intensity then settles to a subtle vignette, great for focus-pulling moments.",
  triggerPhrases: [
    "vignette",
    "darken edges",
    "edge darkening",
    "vignette punch",
    "dramatic vignette",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `vp-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "vignette_punch",
        params: { intensity: input.intensity, duration: input.duration },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", intensity: 0.9, duration: 0.5 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "vignette_punch", params: { intensity: 0.9, duration: 0.5 } },
        },
      ],
    },
  ],
};

registerCapability(VignettePunchCapability);
