import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ clipId: z.string(), fadeIn: z.number().default(0), fadeOut: z.number().default(0) });
type P = z.infer<typeof Params>;

export const FadeCapability: Capability<P> = {
  id: "audio-fade", category: "audio", status: "alpha", version: "1.0.0",
  description: "Fade audio in or out over a specified duration.",
  triggerPhrases: ["fade in", "fade out", "fade the audio"],
  params: Params,
  compile: (input) => [{ type: "clip/update", id: `fade-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, fade: { fadeIn: input.fadeIn, fadeOut: input.fadeOut } } }],
  examples: [{ input: { clipId: "clip-1", fadeIn: 1, fadeOut: 0 }, output: [{ type: "clip/update", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", fade: { fadeIn: 1, fadeOut: 0 } } }] }],
};
registerCapability(FadeCapability);
