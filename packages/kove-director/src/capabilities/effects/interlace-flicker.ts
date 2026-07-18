import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  softness: z.number().min(0).max(1).default(0.5).describe("Flicker reduction softness (0–1)"),
});

type P = z.infer<typeof Params>;

export const InterlaceFlickerCapability: Capability<P> = {
  id: "interlace-flicker",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Reduce interlace flicker artifacts in footage. Softens horizontal detail that causes flickering on progressive displays.",
  triggerPhrases: [
    "reduce flicker",
    "interlace fix",
    "deinterlace",
    "flicker reduction",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `if-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "reduce_interlace_flicker",
        params: { softness: input.softness },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", softness: 0.6 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "reduce_interlace_flicker", params: { softness: 0.6 } },
        },
      ],
    },
  ],
};

registerCapability(InterlaceFlickerCapability);
