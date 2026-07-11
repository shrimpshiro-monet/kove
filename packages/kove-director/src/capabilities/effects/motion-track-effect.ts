import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UmotionUtrackUeffectCapability: Capability = {
  id: "motion-track-effect",
  category: "effects",
  status: "planned",
  version: "0.0.0",
  description: "Planned: motion-track-effect. Not yet implemented.",
  triggerPhrases: ["motion-track-effect"],
  params: {},
  compile: () => {
    throw new Error("capability motion-track-effect is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UmotionUtrackUeffectCapability);
