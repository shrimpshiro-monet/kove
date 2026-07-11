import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability, CapabilityContext } from "../types";

const PushInParams = z.object({
  clipId: z.string().describe("ID of the clip"),
  intensity: z.number().min(0).max(1).default(0.7).describe("Zoom intensity"),
});

type PushInParams = z.infer<typeof PushInParams>;

export const PushInCapability: Capability<PushInParams> = {
  id: "push-in",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Slow zoom-in Ken Burns effect. Scale increases from 1.0 to ~1.2.",
  triggerPhrases: ["zoom in", "push in", "ken burns in", "get closer"],
  params: PushInParams,
  compile: (input) => [
    { type: "effect/apply", id: `pi-${Date.now()}`, timestamp: Date.now(), params: { target: "clip", targetId: input.clipId, kind: "custom", effectType: "push_in", params: { intensity: input.intensity } } },
  ],
  examples: [
    { input: { clipId: "clip-1", intensity: 0.7 }, output: [{ type: "effect/apply", id: "ex-1", timestamp: 0, params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "push_in", params: { intensity: 0.7 } } }] },
  ],
};

registerCapability(PushInCapability);
