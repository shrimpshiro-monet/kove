import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to add subtitles to"),
  style: z.enum(["default", "word-highlight", "word-by-word", "karaoke", "typewriter"]).default("default").describe("Subtitle rendering style"),
  language: z.string().default("en").describe("Language code for transcription"),
  maxCharsPerLine: z.number().min(10).max(80).default(40).describe("Maximum characters per subtitle line"),
});

type P = z.infer<typeof Params>;

export const SubtitleAutoCapability: Capability<P> = {
  id: "subtitle-auto",
  category: "overlays",
  status: "alpha",
  version: "1.0.0",
  description: "Auto-generate subtitles from audio transcription. Supports multiple rendering styles including plain text, word-highlight, karaoke, and typewriter animations.",
  triggerPhrases: [
    "auto subtitles",
    "generate subtitles",
    "add subtitles",
    "transcribe and subtitle",
    "auto captions",
    "speech to text",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "subtitle/add",
      id: `sa-${Date.now()}`,
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

registerCapability(SubtitleAutoCapability);
