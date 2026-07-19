import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to apply curves to"),
  shadows: z.number().min(-1).max(1).default(0).describe("Shadows adjustment (-1 = darken, 1 = lighten)"),
  midtones: z.number().min(-1).max(1).default(0).describe("Midtones adjustment"),
  highlights: z.number().min(-1).max(1).default(0).describe("Highlights adjustment"),
});

type P = z.infer<typeof Params>;

export const ColorCurvesCapability: Capability<P> = {
  id: "color-curves",
  category: "effects",
  status: "alpha",
  version: "1.1.0",
  description: "Adjust color curves for shadows, midtones, and highlights. Uses OpenReel's native color-grading action.",
  triggerPhrases: [
    "color curves",
    "adjust curves",
    "tonal adjustment",
    "shadows highlights",
    "lift gamma gain",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `curves-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "color-grading",
        adjustments: {
          shadows: input.shadows,
          midtones: input.midtones,
          highlights: input.highlights,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", shadows: -0.2, midtones: 0.1, highlights: 0.15 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: {
            target: "clip", targetId: "clip-1",
            kind: "color-grading",
            adjustments: { shadows: -0.2, midtones: 0.1, highlights: 0.15 },
          },
        },
      ],
    },
  ],
};

registerCapability(ColorCurvesCapability);
