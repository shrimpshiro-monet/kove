import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ text: z.string(), startTime: z.number().default(0), duration: z.number().default(3) });
type P = z.infer<typeof Params>;

export const TextCapability: Capability<P> = {
  id: "text-overlay", category: "overlays", status: "alpha", version: "1.0.0",
  description: "Add text overlay with font, size, color, position, and animation.",
  triggerPhrases: ["add text", "text overlay", "title", "put text on screen"],
  params: Params,
  compile: (input) => [{ type: "subtitle/add", id: `text-${Date.now()}`, timestamp: Date.now(), params: { clipId: "video-main", style: "default", language: "en" } }],
  examples: [{ input: { text: "Hello World" }, output: [{ type: "subtitle/add", id: "ex-1", timestamp: 0, params: { clipId: "video-main", style: "default", language: "en" } }] }],
};
registerCapability(TextCapability);
