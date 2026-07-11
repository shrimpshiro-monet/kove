import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UcolorUwheelsCapability: Capability = {
  id: "color-wheels",
  category: "effects",
  status: "planned",
  version: "0.0.0",
  description: "Planned: color-wheels. Not yet implemented.",
  triggerPhrases: ["color-wheels"],
  params: {},
  compile: () => {
    throw new Error("capability color-wheels is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UcolorUwheelsCapability);
