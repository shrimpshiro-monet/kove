import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  startX: z.number().min(0).max(100).default(50).describe("Starting X position (% of frame)"),
  startY: z.number().min(0).max(100).default(50).describe("Starting Y position (% of frame)"),
  endX: z.number().min(0).max(100).default(50).describe("Ending X position (% of frame)"),
  endY: z.number().min(0).max(100).default(50).describe("Ending Y position (% of frame)"),
  zoomStart: z.number().min(0.5).max(3).default(1).describe("Starting zoom level"),
  zoomEnd: z.number().min(0.5).max(3).default(1.2).describe("Ending zoom level"),
});

type P = z.infer<typeof Params>;

export const KenBurnsPanCapability: Capability<P> = {
  id: "ken-burns-pan",
  category: "camera",
  status: "alpha",
  version: "1.0.0",
  description: "Ken Burns pan and zoom effect: smoothly animate position and scale from start to end points. Creates cinematic movement on static shots.",
  triggerPhrases: [
    "ken burns",
    "pan and zoom",
    "slow zoom",
    "cinematic pan",
    "drift across frame",
    "zoom across image",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `kb-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "ken_burns_pan",
        params: {
          startX: input.startX,
          startY: input.startY,
          endX: input.endX,
          endY: input.endY,
          zoomStart: input.zoomStart,
          zoomEnd: input.zoomEnd,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", startX: 30, startY: 40, endX: 60, endY: 50, zoomStart: 1, zoomEnd: 1.3 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "ken_burns_pan", params: { startX: 30, startY: 40, endX: 60, endY: 50, zoomStart: 1, zoomEnd: 1.3 } },
        },
      ],
    },
  ],
};

registerCapability(KenBurnsPanCapability);
