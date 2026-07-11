import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UfreezeUframeCapability: Capability = {
  id: "freeze-frame",
  category: "edit",
  status: "beta",
  version: "1.0.0",
  description: "Beta edit: freeze-frame",
  triggerPhrases: ["freeze-frame"],
  params: {},
  compile: () => {
    throw new Error("capability freeze-frame is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UfreezeUframeCapability);
