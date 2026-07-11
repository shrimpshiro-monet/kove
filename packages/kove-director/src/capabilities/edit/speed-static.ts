import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const SpeedStaticParams = z.object({
  clipId: z.string().describe("ID of the clip"),
  speed: z.number().min(0.25).max(4).describe("Playback speed multiplier"),
});

type SpeedStaticParams = z.infer<typeof SpeedStaticParams>;

export const SpeedStaticCapability: Capability<SpeedStaticParams> = {
  id: "speed-static",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Set a clip's playback speed to a fixed value (0.25x to 4x).",
  triggerPhrases: ["slow this down", "speed this up", "half speed", "double speed", "slow motion"],
  params: SpeedStaticParams,
  compile: (input) => [
    { type: "clip/update", id: `spd-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, speed: input.speed } },
  ],
  examples: [
    { input: { clipId: "clip-1", speed: 0.5 }, output: [{ type: "clip/update", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", speed: 0.5 } }] },
  ],
};

registerCapability(SpeedStaticCapability);
