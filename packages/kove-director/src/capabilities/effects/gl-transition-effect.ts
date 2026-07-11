import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UglUtransitionUeffectCapability: Capability = {
  id: "gl-transition-effect",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: gl-transition-effect",
  triggerPhrases: ["gl-transition-effect"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability gl-transition-effect is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UglUtransitionUeffectCapability);
