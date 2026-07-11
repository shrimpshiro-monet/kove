import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UvignetteUpunchCapability: Capability = {
  id: "vignette-punch",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: vignette-punch",
  triggerPhrases: ["vignette-punch"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability vignette-punch is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UvignetteUpunchCapability);
