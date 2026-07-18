import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to add title to"),
  text: z.string().describe("Title text content"),
  style: z.enum(["fade-in", "typewriter", "slide-up", "scale-in"]).default("fade-in").describe("Title animation style"),
  fontSize: z.string().default("48px").describe("Font size"),
  color: z.string().default("#ffffff").describe("Text color (hex)"),
  position: z.enum(["center", "top", "bottom"]).default("center").describe("Vertical position"),
});

type P = z.infer<typeof Params>;

export const TitleCardCapability: Capability<P> = {
  id: "title-card",
  category: "overlays",
  status: "alpha",
  version: "1.0.0",
  description: "Add animated title cards to clips. Supports multiple animation styles and positioning for chapter headings, intros, and text overlays.",
  triggerPhrases: [
    "title card",
    "add title",
    "text overlay",
    "chapter title",
    "intro text",
    "opening title",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `tc-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "title_card",
        params: {
          text: input.text,
          style: input.style,
          fontSize: input.fontSize,
          color: input.color,
          position: input.position,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", text: "My Video", style: "fade-in", fontSize: "48px", color: "#ffffff", position: "center" },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "title_card", params: { text: "My Video", style: "fade-in", fontSize: "48px", color: "#ffffff", position: "center" } },
        },
      ],
    },
  ],
};

registerCapability(TitleCardCapability);
