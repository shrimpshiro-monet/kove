import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipId: z.string().describe("ID of the clip"),
  color: z.string().default("#00ffff").describe("Neon glow color (hex)"),
  blur: z.number().min(0).max(20).default(8).describe("Glow blur radius"),
});

type P = z.infer<typeof Params>;

export const PlayerGlowCapability: Capability<P> = {
  id: "player-glow",
  category: "effects",
  status: "alpha",
  version: "1.0.0",
  description: "Neon glow effect around subjects. Adds a colored luminous halo, popular for sports highlights and gaming content.",
  triggerPhrases: [
    "neon glow",
    "player glow",
    "subject glow",
    "highlight glow",
    "glowing outline",
  ],
  params: Params,
  compile: (input) => [
    {
      type: "effect/apply",
      id: `pg-${Date.now()}`,
      timestamp: Date.now(),
      params: {
        target: "clip",
        targetId: input.clipId,
        kind: "custom",
        effectType: "player_glow",
        params: { color: input.color, blur: input.blur },
      },
    },
  ],
  examples: [
    {
      input: { clipId: "clip-1", color: "#ff00ff", blur: 10 },
      output: [
        {
          type: "effect/apply",
          id: "ex-1",
          timestamp: 0,
          params: { target: "clip", targetId: "clip-1", kind: "custom", effectType: "player_glow", params: { color: "#ff00ff", blur: 10 } },
        },
      ],
    },
  ],
};

registerCapability(PlayerGlowCapability);
