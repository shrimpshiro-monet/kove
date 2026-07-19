import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the audio clip"),
  compressor: z.number().min(0).max(1).default(0).describe("Compression amount (0 = off, 1 = heavy)"),
  limiter: z.number().min(0).max(1).default(0).describe("Brick-wall limiter amount"),
  noiseGate: z.number().min(0).max(1).default(0).describe("Noise gate threshold amount"),
});

type P = z.infer<typeof Params>;

export const AudioDynamicsCapability: Capability<P> = {
  id: "audio-dynamics",
  category: "audio",
  status: "alpha",
  version: "1.1.0",
  description: "Audio dynamics processing: compression, limiting, and noise gating. Emits effect/apply via kind:custom — wired through render pipeline's audio filter chain.",
  triggerPhrases: [
    "audio dynamics",
    "compress audio",
    "limit audio",
    "noise gate",
    "normalize audio",
    "even out volume",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `dyn-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "audio_dynamics",
        params: {
          compressor: input.compressor,
          limiter: input.limiter,
          noiseGate: input.noiseGate,
        },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "audio-1", compressor: 0.5, limiter: 0.3, noiseGate: 0.2 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "audio-1", kind: "custom", effectType: "audio_dynamics", params: { compressor: 0.5, limiter: 0.3, noiseGate: 0.2 } },
        },
      ],
    },
  ],
};

registerCapability(AudioDynamicsCapability);
