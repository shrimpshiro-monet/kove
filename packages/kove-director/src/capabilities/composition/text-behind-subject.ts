import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UtextUbehindUsubjectCapability: Capability = {
  id: "text-behind-subject",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: text-behind-subject. Not yet implemented.",
  triggerPhrases: ["text-behind-subject"],
  params: {},
  compile: () => {
    throw new Error("capability text-behind-subject is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UtextUbehindUsubjectCapability);
