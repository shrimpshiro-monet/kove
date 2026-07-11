import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UgaussianUblurCapability: Capability = {
  id: "gaussian-blur",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: gaussian-blur",
  triggerPhrases: ["gaussian-blur"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability gaussian-blur is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UgaussianUblurCapability);
