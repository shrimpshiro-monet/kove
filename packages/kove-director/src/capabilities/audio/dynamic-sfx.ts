import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UdynamicUsfxCapability: Capability = {
  id: "dynamic-sfx",
  category: "audio",
  status: "planned",
  version: "0.0.0",
  description: "Planned: dynamic-sfx. Not yet implemented.",
  triggerPhrases: ["dynamic-sfx"],
  params: {},
  compile: () => {
    throw new Error("capability dynamic-sfx is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UdynamicUsfxCapability);
