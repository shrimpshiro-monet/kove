import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  blurriness: z.number().min(0).max(20).default(5).describe("Blur amount (0–20)"),
  dimensions: z.enum(["horizontal", "vertical", "both"]).default("both").describe("Blur direction"),
});

type P = z.infer<typeof Params>;

export const GaussianBlurCapability: Capability<P> = {
  id: "gaussian-blur",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Apply Gaussian blur to a clip. Can be directional (horizontal/vertical) or uniform. Useful for dream sequences, transitions, and focus effects.",
  triggerPhrases: [
    "gaussian blur",
    "blur the clip",
    "soft focus",
    "defocus",
    "blur effect",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `gb-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "gaussian_blur",
        params: { blurriness: input.blurriness, dimensions: input.dimensions },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", blurriness: 8, dimensions: "both" },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "gaussian_blur", params: { blurriness: 8, dimensions: "both" } },
        },
      ],
    },
  ],
};

registerCapability(GaussianBlurCapability);
