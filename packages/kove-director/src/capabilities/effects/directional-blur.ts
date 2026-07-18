import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  angle: z.number().min(0).max(360).default(0).describe("Direction of blur in degrees (0 = horizontal)"),
  length: z.number().min(0).max(30).default(10).describe("Blur length/strength (0–30)"),
});

type P = z.infer<typeof Params>;

export const DirectionalBlurCapability: Capability<P> = {
  id: "directional-blur",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Apply blur along a specific angle. Creates motion-sweep or directional softness effects, useful for speed感 and transitions.",
  triggerPhrases: [
    "directional blur",
    "motion blur",
    "sweep blur",
    "angle blur",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `dblur-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "directional_blur",
        params: { angle: input.angle, length: input.length },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", angle: 45, length: 12 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "directional_blur", params: { angle: 45, length: 12 } },
        },
      ],
    },
  ],
};

registerCapability(DirectionalBlurCapability);
