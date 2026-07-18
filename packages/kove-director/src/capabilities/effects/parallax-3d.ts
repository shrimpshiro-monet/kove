import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  intensity: z.number().min(0).max(1).default(0.5).describe("Parallax depth intensity (0–1)"),
});

type P = z.infer<typeof Params>;

export const Parallax3DCapability: Capability<P> = {
  id: "parallax-3d",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Fake 3D depth parallax effect. Creates the illusion of depth by shifting layers at different rates based on estimated depth. Adds cinematic dimensionality.",
  triggerPhrases: [
    "3d parallax",
    "depth effect",
    "parallax",
    "depth of field motion",
    "2.5d effect",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `p3d-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "parallax_3d",
        params: { intensity: input.intensity },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", intensity: 0.6 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "parallax_3d", params: { intensity: 0.6 } },
        },
      ],
    },
  ],
};

registerCapability(Parallax3DCapability);
