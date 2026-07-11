import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UkenUburnsUpanCapability: Capability = {
  id: "ken-burns-pan",
  category: "camera",
  status: "planned",
  version: "0.0.0",
  description: "Planned: ken-burns-pan. Not yet implemented.",
  triggerPhrases: ["ken-burns-pan"],
  params: {},
  compile: () => {
    throw new Error("capability ken-burns-pan is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UkenUburnsUpanCapability);
