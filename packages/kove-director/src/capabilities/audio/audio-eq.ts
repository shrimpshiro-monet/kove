import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the audio clip"),
  lowGain: z.number().min(-12).max(12).default(0).describe("Low shelf gain in dB (-12 to +12)"),
  midGain: z.number().min(-12).max(12).default(0).describe("Mid peak gain in dB"),
  highGain: z.number().min(-12).max(12).default(0).describe("High shelf gain in dB"),
  midFrequency: z.number().min(200).max(8000).default(1000).describe("Mid frequency center in Hz"),
});

type P = z.infer<typeof Params>;

export const AudioEqCapability: Capability<P> = {
  id: "audio-eq",
  category: "audio",
  status: "alpha",
  version: "1.1.0",
  description: "3-band parametric EQ (low/mid/high) for audio tonal shaping. Emits effect/apply via kind:custom — wired through render pipeline's audio filter chain.",
  triggerPhrases: [
    "audio eq",
    "equalizer",
    "eq the audio",
    "bass boost",
    "treble boost",
    "tone control",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `eq-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "audio_eq",
        params: {
          lowGain: input.lowGain,
          midGain: input.midGain,
          highGain: input.highGain,
          midFrequency: input.midFrequency,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "audio-1", lowGain: 3, midGain: -2, highGain: 1 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "audio-1", kind: "custom", effectType: "audio_eq", params: { lowGain: 3, midGain: -2, highGain: 1, midFrequency: 1000 } },
        },
      ],
    },
  ],
};

registerCapability(AudioEqCapability);
