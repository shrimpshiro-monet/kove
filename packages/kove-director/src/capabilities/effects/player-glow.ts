import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UplayerUglowCapability: Capability = {
  id: "player-glow",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: player-glow",
  triggerPhrases: ["player-glow"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability player-glow is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UplayerUglowCapability);
