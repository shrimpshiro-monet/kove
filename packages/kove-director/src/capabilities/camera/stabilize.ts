import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to stabilize"),
  strength: z.number().min(0).max(1).default(0.5).describe("Stabilization strength (0 = light, 1 = maximum)"),
  cropMode: z.enum(["auto", "leave-black", "keep-size"]).default("auto").describe("How to handle edges after stabilization"),
});

type P = z.infer<typeof Params>;

export const StabilizeCapability: Capability<P> = {
  id: "stabilize",
  category: "camera",
  status: "alpha",
  version: "1.0.0",
  description: "Stabilize shaky footage using motion analysis. Smooths camera movement while preserving intentional motion.",
  triggerPhrases: [
    "stabilize",
    "steady the footage",
    "smooth shake",
    "remove camera shake",
    "stabilize video",
    "smooth motion",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "clip/update",
      id: `stab-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        stabilization: {
          enabled: true,
          strength: input.strength,
          cropMode: input.cropMode,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", strength: 0.6, cropMode: "auto" },
      output: [
        {
          type: "clip/update",
          id: "ex-1",
          timestamp: 0,
          params: { clipId: "clip-1", stabilization: { enabled: true, strength: 0.6, cropMode: "auto" } },
        },
      ],
    },
  ],
};

registerCapability(StabilizeCapability);
