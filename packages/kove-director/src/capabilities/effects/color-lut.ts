import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to apply LUT to"),
  preset: z.enum(["cinematic", "vintage", "warm", "cool", "noir", "vibrant", "desaturated"]).default("cinematic").describe("LUT preset style"),
  intensity: z.number().min(0).max(1).default(0.8).describe("LUT blend intensity (0–1)"),
});

type P = z.infer<typeof Params>;

export const ColorLutCapability: Capability<P> = {
  id: "color-lut",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Apply a color lookup table (LUT) to a clip for cinematic color grading. Maps through OpenReel's existing LUT engine with preset styles.",
  triggerPhrases: [
    "apply lut",
    "color lut",
    "cinematic grade",
    "film look",
    "color preset",
    "vintage look",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `lut-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "color_lut",
        params: { preset: input.preset, intensity: input.intensity },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", preset: "cinematic", intensity: 0.9 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "color_lut", params: { preset: "cinematic", intensity: 0.9 } },
        },
      ],
    },
  ],
};

registerCapability(ColorLutCapability);
