import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ clipId: z.string(), volume: z.number().min(0).max(1) });
type P = z.infer<typeof Params>;

export const VolumeCapability: Capability<P> = {
  id: "volume", category: "audio", status: "alpha", version: "1.0.0",
  description: "Set clip audio volume (0.0 = silent, 1.0 = normal).",
  triggerPhrases: ["volume", "make it louder", "make it quieter", "mute this"],
  params: Params,
  compile: (input) => [{ type: "clip/update", id: `vol-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, volume: input.volume } }],
  examples: [{ input: { clipId: "clip-1", volume: 0.5 }, output: [{ type: "clip/update", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", volume: 0.5 } }] }],
};
registerCapability(VolumeCapability);
