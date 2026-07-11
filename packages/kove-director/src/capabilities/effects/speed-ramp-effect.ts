import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UspeedUrampUeffectCapability: Capability = {
  id: "speed-ramp-effect",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: speed-ramp-effect",
  triggerPhrases: ["speed-ramp-effect"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability speed-ramp-effect is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UspeedUrampUeffectCapability);
