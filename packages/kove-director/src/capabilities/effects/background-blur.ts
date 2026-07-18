import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const BackgroundBlurParams = z.object({
  clipId: z.string().describe("ID of the clip"),
  blur: z.number().min(2).max(30).default(12).describe("Blur radius (2–30)"),
});

type BackgroundBlurParams = z.infer<typeof BackgroundBlurParams>;

export const BackgroundBlurCapability: Capability<BackgroundBlurParams> = {
  id: "background-blur",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Apply a background blur effect to a clip. Blurs everything in the frame using a configurable radius.",
  triggerPhrases: [
    "blur background",
    "background blur",
    "soften background",
    "defocus background",
    "blur the background",
  ],
  params: BackgroundBlurParams,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `bg-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "background_blur",
        params: { blur: input.blur },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", blur: 15 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "background_blur", params: { blur: 15 } },
        },
      ],
    },
  ],
};

registerCapability(BackgroundBlurCapability);
