import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to apply color wheels to"),
  lift: z.number().min(-1).max(1).default(0).describe("Lift (shadows) adjustment"),
  gamma: z.number().min(-1).max(1).default(0).describe("Gamma (midtones) adjustment"),
  gain: z.number().min(-1).max(1).default(0).describe("Gain (highlights) adjustment"),
});

type P = z.infer<typeof Params>;

export const ColorWheelsCapability: Capability<P> = {
  id: "color-wheels",
  category: "effects",
  status: "alpha",
  version: "1.1.0",
  description: "Professional color wheels (lift/gamma/gain) for precise color correction. Mapped to OpenReel's native color-grading shadows/midtones/highlights.",
  triggerPhrases: [
    "color wheels",
    "lift gamma gain",
    "color correction",
    "primary correction",
    "balance colors",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `wheels-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "color-grading",
        adjustments: {
          shadows: input.lift,
          midtones: input.gamma,
          highlights: input.gain,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", lift: -0.1, gamma: 0.05, gain: 0.1 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: {
            target: "clip", targetId: "clip-1",
            kind: "color-grading",
            adjustments: { shadows: -0.1, midtones: 0.05, highlights: 0.1 },
          },
        },
      ],
    },
  ],
};

registerCapability(ColorWheelsCapability);
