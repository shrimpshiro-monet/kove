import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  amount: z.number().min(0).max(5).default(1).describe("Sharpening amount (0–5)"),
});

type P = z.infer<typeof Params>;

export const SharpenCapability: Capability<P> = {
  id: "sharpen",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Sharpen clip details using unsharp mask technique. Enhances edge contrast for crisper image quality.",
  triggerPhrases: [
    "sharpen",
    "increase sharpness",
    "make it crisper",
    "sharper",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `sh-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "sharpen",
        params: { amount: input.amount },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", amount: 1.5 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "sharpen", params: { amount: 1.5 } },
        },
      ],
    },
  ],
};

registerCapability(SharpenCapability);
