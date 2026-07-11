import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UcolorUcurvesCapability: Capability = {
  id: "color-curves",
  category: "effects",
  status: "planned",
  version: "0.0.0",
  description: "Planned: color-curves. Not yet implemented.",
  triggerPhrases: ["color-curves"],
  params: {},
  compile: () => {
    throw new Error("capability color-curves is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UcolorUcurvesCapability);
