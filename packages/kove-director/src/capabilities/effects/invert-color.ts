import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  blend: z.number().min(0).max(1).default(1).describe("Inversion blend amount (0 = original, 1 = fully inverted)"),
  channel: z.enum(["all", "red", "green", "blue"]).default("all").describe("Which color channels to invert"),
});

type P = z.infer<typeof Params>;

export const InvertColorCapability: Capability<P> = {
  id: "invert-color",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Invert color channels of a clip. Can invert all channels or specific ones (R/G/B). Creates dramatic negative-film looks.",
  triggerPhrases: [
    "invert colors",
    "negative effect",
    "color inversion",
    "flip colors",
    "negative film",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `ic-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "invert_color",
        params: { blend: input.blend, channel: input.channel },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", blend: 1, channel: "all" },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "invert_color", params: { blend: 1, channel: "all" } },
        },
      ],
    },
  ],
};

registerCapability(InvertColorCapability);
