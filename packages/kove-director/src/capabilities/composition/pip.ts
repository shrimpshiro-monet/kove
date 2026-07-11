import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UpipCapability: Capability = {
  id: "pip",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: pip. Not yet implemented.",
  triggerPhrases: ["pip"],
  params: {},
  compile: () => {
    throw new Error("capability pip is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UpipCapability);
