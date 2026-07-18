import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to add captions to"),
  style: z.enum(["word-highlight", "word-by-word", "karaoke", "typewriter"]).default("word-highlight").describe("Caption animation style"),
  language: z.string().default("en").describe("Language code for transcription"),
  maxCharsPerLine: z.number().min(10).max(80).default(40).describe("Maximum characters per caption line"),
});

type P = z.infer<typeof Params>;

export const KineticCaptionCapability: Capability<P> = {
  id: "kinetic-caption",
  category: "overlays",
  status: "alpha",
  version: "1.0.0",
  description: "Word-by-word animated captions synced to audio. The #1 requested feature for short-form content. Highlights each word as it's spoken, with customizable animation styles.",
  triggerPhrases: [
    "kinetic captions",
    "word by word captions",
    "animated subtitles",
    "highlighted captions",
    "tiktok captions",
    "word highlight",
    "karaoke text",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "subtitle/add",
      id: `kc-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.clipId,
        style: input.style,
        language: input.language,
        maxCharsPerLine: input.maxCharsPerLine,
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", style: "word-highlight", language: "en", maxCharsPerLine: 40 },
      output: [
        {
          type: "subtitle/add",
          id: "ex-1",
          timestamp: 0,
          params: { clipId: "clip-1", style: "word-highlight", language: "en", maxCharsPerLine: 40 },
        },
      ],
    },
  ],
};

registerCapability(KineticCaptionCapability);
