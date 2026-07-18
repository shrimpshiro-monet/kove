import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to add lower third to"),
  text: z.string().describe("Lower third text content"),
  subtitle: z.string().optional().describe("Optional subtitle/secondary text"),
  style: z.enum(["modern", "minimal", "broadcast", "creative"]).default("modern").describe("Lower third style"),
  position: z.enum(["bottom-left", "bottom-right", "top-left", "top-right"]).default("bottom-left").describe("Screen position"),
});

type P = z.infer<typeof Params>;

export const LowerThirdCapability: Capability<P> = {
  id: "lower-third",
  category: "overlays",
  status: "alpha",
  version: "1.0.0",
  description: "Add professional lower-third graphics for name plates, titles, and location tags. Broadcast-quality overlays with animated entrance/exit.",
  triggerPhrases: [
    "lower third",
    "name plate",
    "name tag",
    "info bar",
    "subtitle bar",
    "chyron",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `lt-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "lower_third",
        params: {
          text: input.text,
          subtitle: input.subtitle,
          style: input.style,
          position: input.position,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", text: "John Doe", subtitle: "Director", style: "modern", position: "bottom-left" },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "lower_third", params: { text: "John Doe", subtitle: "Director", style: "modern", position: "bottom-left" } },
        },
      ],
    },
  ],
};

registerCapability(LowerThirdCapability);
