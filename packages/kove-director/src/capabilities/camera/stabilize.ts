import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UstabilizeCapability: Capability = {
  id: "stabilize",
  category: "camera",
  status: "planned",
  version: "0.0.0",
  description: "Planned: stabilize. Not yet implemented.",
  triggerPhrases: ["stabilize"],
  params: {},
  compile: () => {
    throw new Error("capability stabilize is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UstabilizeCapability);
