import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  musicTrackId: z.string().describe("ID of the music track"),
  voiceTrackId: z.string().optional().describe("ID of the voice/dialogue track"),
  musicVolume: z.number().min(0).max(1).default(0.8).describe("Music volume (0–1)"),
  voiceVolume: z.number().min(0).max(1).default(1).describe("Voice volume (0–1)"),
  balance: z.number().min(-1).max(1).default(0).describe("Stereo balance (-1 = left, 1 = right)"),
});

type P = z.infer<typeof Params>;

export const AudioMixingCapability: Capability<P> = {
  id: "audio-mixing",
  category: "audio",
  status: "alpha",
  version: "1.0.0",
  description: "Mix multiple audio tracks with volume balancing and stereo positioning. Controls relative levels between music, voice, and SFX tracks.",
  triggerPhrases: [
    "mix audio",
    "balance audio",
    "audio levels",
    "mix music and voice",
    "adjust audio balance",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "clip/update",
      id: `mix-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        clipId: input.musicTrackId,
        volume: input.musicVolume,
      },
    },
    ...(input.voiceTrackId
      ? [
          {
            type: "clip/update" as const,
            id: `mix-v-${Date.now()}`,
            timestamp: Date.now(),
            params: {
              clipId: input.voiceTrackId,
              volume: input.voiceVolume,
            },
          },
        ]
      : []),
  ],
  examples: [
    {
      input: { musicTrackId: "music-1", voiceTrackId: "voice-1", musicVolume: 0.6, voiceVolume: 1, balance: 0 },
      output: [
        { type: "clip/update", id: "ex-1", timestamp: 0, params: { clipId: "music-1", volume: 0.6 } },
        { type: "clip/update", id: "ex-2", timestamp: 0, params: { clipId: "voice-1", volume: 1 } },
      ],
    },
  ],
};

registerCapability(AudioMixingCapability);
