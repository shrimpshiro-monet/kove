import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability, CapabilityContext } from "../types";

const ColorGradeParams = z.object({
  target: z.enum(["clip", "track", "timeline"]).default("timeline"),
  targetId: z.string().optional(),
  preset: z.string().optional().describe("Preset name: warm, cool, cinematic, vintage, etc."),
  adjustments: z.object({
    brightness: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
    temperature: z.number().optional(),
    tint: z.number().optional(),
    shadows: z.number().optional(),
    midtones: z.number().optional(),
    highlights: z.number().optional(),
  }).optional(),
});

type ColorGradeParams = z.infer<typeof ColorGradeParams>;

export const ColorGradeCapability: Capability<ColorGradeParams> = {
  id: "color-grade",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Apply color grading — adjust saturation, contrast, brightness, temperature, tint, shadows, midtones, highlights.",
  triggerPhrases: ["color grade", "adjust colors", "make it warmer", "desaturate", "more contrast"],
  params: ColorGradeParams,
  compile: (input, context) => {
    let target = input.target;
    let targetId = input.targetId;

    // Derive target from selection if not explicitly set
    if (target === "timeline" && context.selectedClipIds && context.selectedClipIds.length > 0) {
      target = "clip";
      targetId = context.selectedClipIds[0];
    }

    return [
      {
        type: "effect/apply",
        id: `cg-${Date.now()}`,
        timestamp: Date.now(),
        params: { target, targetId, kind: "color-grading", preset: input.preset, adjustments: input.adjustments },
      },
    ];
  },
  examples: [
    { input: { target: "timeline", preset: "warm" }, output: [{ type: "effect/apply", id: "ex-1", timestamp: 0, params: { target: "timeline", kind: "color-grading", preset: "warm" } }] },
  ],
};

registerCapability(ColorGradeCapability);
