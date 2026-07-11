import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ musicTrackId: z.string(), voiceTrackId: z.string().optional(), duckAmount: z.number().min(0).max(1).default(0.3) });
type P = z.infer<typeof Params>;

export const DuckingCapability: Capability<P> = {
  id: "ducking", category: "audio", status: "alpha", version: "1.0.0",
  description: "Auto-duck music volume when voice/dialogue is present.",
  triggerPhrases: ["duck the music", "lower music under voice", "audio ducking"],
  params: Params,
  compile: (input) => [{ type: "audio/ducking", id: `duck-${Date.now()}`, timestamp: Date.now(), params: { musicTrackId: input.musicTrackId, voiceTrackId: input.voiceTrackId, duckAmount: input.duckAmount } }],
  examples: [{ input: { musicTrackId: "audio-music", duckAmount: 0.3 }, output: [{ type: "audio/ducking", id: "ex-1", timestamp: 0, params: { musicTrackId: "audio-music", duckAmount: 0.3 } }] }],
};
registerCapability(DuckingCapability);
