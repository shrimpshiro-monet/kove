import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({ clipId: z.string(), x: z.number().default(0), y: z.number().default(0), width: z.number().default(1), height: z.number().default(1) });
type P = z.infer<typeof Params>;

export const CropCapability: Capability<P> = {
  id: "crop", category: "camera", status: "alpha", version: "1.0.0",
  description: "Crop a clip to a specific region.",
  triggerPhrases: ["crop", "crop this", "cut the edges"],
  params: Params,
  compile: (input) => [{ type: "transform/update", id: `crop-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId, crop: { x: input.x, y: input.y, width: input.width, height: input.height } } }],
  examples: [{ input: { clipId: "clip-1", x: 0, y: 0.1, width: 1, height: 0.9 }, output: [{ type: "transform/update", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", crop: { x: 0, y: 0.1, width: 1, height: 0.9 } } }] }],
};
registerCapability(CropCapability);
