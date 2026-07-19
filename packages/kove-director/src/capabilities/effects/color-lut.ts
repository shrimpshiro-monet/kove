import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to apply LUT to"),
  preset: z.enum(["cinematic", "vintage", "warm", "cool", "noir", "vibrant", "desaturated"]).default("cinematic").describe("LUT preset style"),
  intensity: z.number().min(0).max(1).default(0.8).describe("LUT blend intensity (0–1); scales contrast/saturation/brightness toward neutral"),
});

type P = z.infer<typeof Params>;

const PRESET_MAP: Record<string, { contrast: number; saturation: number; brightness: number }> = {
  cinematic: { contrast: 1.15, saturation: 0.85, brightness: -0.05 },
  vintage: { contrast: 0.9, saturation: 0.7, brightness: 0.05 },
  warm: { contrast: 1.05, saturation: 1.1, brightness: 0.0 },
  cool: { contrast: 1.05, saturation: 1.0, brightness: 0.0 },
  noir: { contrast: 1.3, saturation: 0.0, brightness: -0.05 },
  vibrant: { contrast: 1.1, saturation: 1.4, brightness: 0.05 },
  desaturated: { contrast: 1.1, saturation: 0.4, brightness: 0.0 },
};

function scaleAdjustments(adj: typeof PRESET_MAP[string], intensity: number) {
  return {
    contrast: adj.contrast * intensity + 1.0 * (1 - intensity),
    saturation: adj.saturation * intensity + 1.0 * (1 - intensity),
    brightness: adj.brightness * intensity,
  };
}

export const ColorLutCapability: Capability<P> = {
  id: "color-lut",
  category: "effects",
  status: "alpha",
  version: "1.1.0",
  description: "Apply a color lookup table (LUT) preset to a clip. Uses OpenReel's native ColorGradingEngine via kind:color-grading action.",
  triggerPhrases: [
    "apply lut",
    "color lut",
    "cinematic grade",
    "film look",
    "color preset",
    "vintage look",
  ],
  params: Params,
  compile: (input) => {
    const base = PRESET_MAP[input.preset] || PRESET_MAP.cinematic;
    const adjustments = scaleAdjustments(base, input.intensity);
    return [
      {
        type: "effect/apply",
        id: `lut-${Date.now()}`,
        timestamp: Date.now(),
        params: {
          target: "clip",
          targetId: input.clipId,
          kind: "color-grading",
          preset: input.preset,
          adjustments,
        },
      },
    ];
  },
  examples: [
    {
      input: { clipId: "clip-1", preset: "cinematic", intensity: 0.8 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: {
            target: "clip", targetId: "clip-1",
            kind: "color-grading", preset: "cinematic",
            adjustments: { contrast: 1.12, saturation: 0.88, brightness: -0.04 },
          },
        },
      ],
    },
  ],
};

registerCapability(ColorLutCapability);
