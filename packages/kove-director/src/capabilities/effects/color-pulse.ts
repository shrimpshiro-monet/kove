import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  intensity: z.number().min(0).max(1).default(0.7).describe("Pulse intensity (0–1)"),
  duration: z.number().min(0.1).max(5).default(0.25).describe("Duration of the pulse in seconds"),
});

type P = z.infer<typeof Params>;

export const ColorPulseCapability: Capability<P> = {
  id: "color-pulse",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Brief saturation and brightness pump for impact moments. Creates a quick flash of color intensity that peaks and fades, ideal for beat drops and emphasis.",
  triggerPhrases: [
    "color pulse",
    "saturation burst",
    "brightness flash",
    "color pump",
    "energy pulse",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `cp-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "color_pulse",
        params: { intensity: input.intensity, duration: input.duration },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", intensity: 0.8, duration: 0.3 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "color_pulse", params: { intensity: 0.8, duration: 0.3 } },
        },
      ],
    },
  ],
};

registerCapability(ColorPulseCapability);
