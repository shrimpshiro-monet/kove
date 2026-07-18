import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip to trigger SFX on"),
  sfxType: z.enum(["whoosh", "hit", "bass_drop"]).describe("SFX type to trigger"),
  volume: z.number().min(0).max(1).default(0.9).describe("SFX volume (0–1)"),
});

type P = z.infer<typeof Params>;

export const SfxSynthesisCapability: Capability<P> = {
  id: "sfx-synthesis",
  category: "audio",
  status: "alpha",
  version: "1.0.0",
  description: "Trigger synthesized sound effects (whoosh, hit, bass drop) at specific moments. Web Audio API generated, no external files needed.",
  triggerPhrases: [
    "add whoosh",
    "add hit sound",
    "bass drop",
    "sound effect",
    "sfx",
    "add impact sound",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `sfx-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "sfx_synthesis",
        params: { sfxType: input.sfxType, volume: input.volume },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", sfxType: "whoosh", volume: 0.8 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "sfx_synthesis", params: { sfxType: "whoosh", volume: 0.8 } },
        },
      ],
    },
  ],
};

registerCapability(SfxSynthesisCapability);
