import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  radius: z.number().min(0).max(20).default(5).describe("Blur radius (0–20)"),
});

type P = z.infer<typeof Params>;

export const CameraBlurCapability: Capability<P> = {
  id: "camera-blur",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Simulate camera defocus blur. Creates a lens-like blur effect that softens the entire frame, useful for transitions and dreamy aesthetics.",
  triggerPhrases: [
    "camera blur",
    "lens blur",
    "defocus",
    "soft focus",
    "out of focus",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `cblur-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "camera_blur",
        params: { radius: input.radius },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", radius: 8 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "camera_blur", params: { radius: 8 } },
        },
      ],
    },
  ],
};

registerCapability(CameraBlurCapability);
