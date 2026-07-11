import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ trackType: z.enum(["video", "audio", "text"]).default("video"), name: z.string().default("New Track") });
type P = z.infer<typeof Params>;

export const MultiTrackCapability: Capability<P> = {
  id: "multi-track", category: "composition", status: "alpha", version: "1.0.0",
  description: "Multi-track timeline with video, audio, text, and effects tracks.",
  triggerPhrases: ["add track", "new track", "multi-track"],
  params: Params,
  compile: (input) => [{ type: "track/create", id: `track-${Date.now()}`, timestamp: Date.now(), params: { trackId: `track-${Date.now()}`, trackType: input.trackType, name: input.name } }],
  examples: [{ input: { trackType: "audio", name: "Audio" }, output: [{ type: "track/create", id: "ex-1", timestamp: 0, params: { trackId: "track-1", trackType: "audio", name: "Audio" } }] }],
};
registerCapability(MultiTrackCapability);
