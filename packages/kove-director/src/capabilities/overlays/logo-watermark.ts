import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to add logo to"),
  logoUrl: z.string().describe("URL or path to the logo image"),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).default("bottom-right").describe("Logo position"),
  size: z.number().min(5).max(30).default(10).describe("Logo size as percentage of frame width"),
  opacity: z.number().min(0).max(1).default(0.8).describe("Logo opacity"),
});

type P = z.infer<typeof Params>;

export const LogoWatermarkCapability: Capability<P> = {
  id: "logo-watermark",
  category: "overlays",
  status: "alpha",
  version: "1.0.0",
  description: "Add a logo or watermark overlay to video. Supports positioning, sizing, and opacity control.",
  triggerPhrases: [
    "add logo",
    "watermark",
    "brand overlay",
    "logo overlay",
    "put logo on video",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `logo-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "logo_watermark",
        params: {
          logoUrl: input.logoUrl,
          position: input.position,
          size: input.size,
          opacity: input.opacity,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", logoUrl: "/logo.png", position: "bottom-right", size: 10, opacity: 0.8 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "logo_watermark", params: { logoUrl: "/logo.png", position: "bottom-right", size: 10, opacity: 0.8 } },
        },
      ],
    },
  ],
};

registerCapability(LogoWatermarkCapability);
