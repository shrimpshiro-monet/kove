import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UmotionUgraphicsCapability: Capability = {
  id: "motion-graphics",
  category: "overlays",
  status: "planned",
  version: "0.0.0",
  description: "Planned: motion-graphics. Not yet implemented.",
  triggerPhrases: ["motion-graphics"],
  params: {},
  compile: () => {
    throw new Error("capability motion-graphics is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UmotionUgraphicsCapability);
