import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UcolorUpulseCapability: Capability = {
  id: "color-pulse",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: color-pulse",
  triggerPhrases: ["color-pulse"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability color-pulse is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UcolorUpulseCapability);
