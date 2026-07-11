import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const FlashParams = z.object({
  clipId: z.string(),
  intensity: z.number().min(0).max(1).default(0.8),
});

type FlashParams = z.infer<typeof FlashParams>;

export const FlashCapability: Capability<FlashParams> = {
  id: "flash",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Impact flash — white frame overlay with opacity fade-out.",
  triggerPhrases: ["flash", "white flash", "impact flash", "flash frame"],
  params: FlashParams,
  compile: (input) => [
    { type: "effect/apply", id: `fl-${Date.now()}`, timestamp: Date.now(), params: { target: "clip", targetId: input.clipId, kind: "custom", effectType: "impact_flash", params: { intensity: input.intensity } } },
  ],
  examples: [{ input: { clipId: "clip-1", intensity: 0.8 }, output: [{ type: "effect/apply", id: "ex-1", timestamp: 0, params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "impact_flash", params: { intensity: 0.8 } } }] }],
};

registerCapability(FlashCapability);
