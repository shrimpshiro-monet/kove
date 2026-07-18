import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  radius: z.number().min(0).max(10).default(2).describe("Blur radius for the mask"),
  amount: z.number().min(0).max(5).default(1.5).describe("Sharpening strength"),
});

type P = z.infer<typeof Params>;

export const UnsharpMaskCapability: Capability<P> = {
  id: "unsharp-mask",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Sharpen by subtracting a blurred copy (unsharp mask). More controlled than simple sharpen — radius controls the blur scale, amount controls edge contrast boost.",
  triggerPhrases: [
    "unsharp mask",
    "detail enhancement",
    "edge sharpening",
    "enhance details",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `usm-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "unsharp_mask",
        params: { radius: input.radius, amount: input.amount },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", radius: 3, amount: 2 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "unsharp_mask", params: { radius: 3, amount: 2 } },
        },
      ],
    },
  ],
};

registerCapability(UnsharpMaskCapability);
