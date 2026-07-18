import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the overlay clip"),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).default("bottom-right").describe("PiP position"),
  width: z.number().min(10).max(50).default(25).describe("PiP width as percentage of frame"),
  height: z.number().min(10).max(50).default(25).describe("PiP height as percentage of frame"),
  borderWidth: z.number().min(0).max(10).default(2).describe("Border width in pixels"),
  borderColor: z.string().default("#ffffff").describe("Border color (hex)"),
});

type P = z.infer<typeof Params>;

export const PipCapability: Capability<P> = {
  id: "pip",
  category: "composition",
  status: "alpha",
  version: "1.0.0",
  description: "Picture-in-picture: overlay a smaller clip on top of the main video. Configurable position, size, and border styling.",
  triggerPhrases: [
    "picture in picture",
    "pip",
    "overlay clip",
    "small window",
    "floating window",
    "corner video",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `pip-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "pip",
        params: {
          position: input.position,
          width: input.width,
          height: input.height,
          borderWidth: input.borderWidth,
          borderColor: input.borderColor,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-2", position: "bottom-right", width: 25, height: 25 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-2", kind: "custom", effectType: "pip", params: { position: "bottom-right", width: 25, height: 25, borderWidth: 2, borderColor: "#ffffff" } },
        },
      ],
    },
  ],
};

registerCapability(PipCapability);
