import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UspeedUrampCapability: Capability = {
  id: "speed-ramp",
  category: "edit",
  status: "beta",
  version: "1.0.0",
  description: "Beta edit: speed-ramp",
  triggerPhrases: ["speed-ramp"],
  params: {},
  compile: () => {
    throw new Error("capability speed-ramp is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UspeedUrampCapability);
