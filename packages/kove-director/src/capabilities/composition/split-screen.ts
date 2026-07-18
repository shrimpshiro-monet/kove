import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  layout: z.enum(["horizontal", "vertical", "quad"]).default("horizontal").describe("Split layout"),
  clipIndex: z.number().min(0).max(3).default(0).describe("Which panel this clip occupies (0-based)"),
  gap: z.number().min(0).max(20).default(2).describe("Gap between panels in pixels"),
});

type P = z.infer<typeof Params>;

export const SplitScreenCapability: Capability<P> = {
  id: "split-screen",
  category: "composition",
  status: "alpha",
  version: "1.0.0",
  description: "Display multiple clips simultaneously in a split-screen layout. Supports horizontal, vertical, and quad layouts with configurable gaps.",
  triggerPhrases: [
    "split screen",
    "side by side",
    "dual view",
    "multiview",
    "split view",
    "two panel",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `ss-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "split_screen",
        params: { layout: input.layout, clipIndex: input.clipIndex, gap: input.gap },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", layout: "horizontal", clipIndex: 0, gap: 4 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "split_screen", params: { layout: "horizontal", clipIndex: 0, gap: 4 } },
        },
      ],
    },
  ],
};

registerCapability(SplitScreenCapability);
