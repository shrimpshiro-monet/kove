import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ clipId: z.string(), mode: z.enum(["cuts", "speed", "effects"]).default("cuts"), sensitivity: z.number().min(0).max(1).default(0.5) });
type P = z.infer<typeof Params>;

export const BeatSyncCapability: Capability<P> = {
  id: "beat-sync", category: "audio", status: "alpha", version: "1.0.0",
  description: "Sync clip edits to audio beats — cut on beats, ramp speed, or trigger effects.",
  triggerPhrases: ["sync to beat", "match the beat", "cut on beat", "beat sync"],
  params: Params,
  compile: (input) => [{ type: "audio/beat-sync", id: `bs-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, mode: input.mode, sensitivity: input.sensitivity } }],
  examples: [{ input: { clipId: "clip-1", mode: "cuts", sensitivity: 0.5 }, output: [{ type: "audio/beat-sync", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", mode: "cuts", sensitivity: 0.5 } }] }],
};
registerCapability(BeatSyncCapability);
