import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UinvertUcolorCapability: Capability = {
  id: "invert-color",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: invert-color",
  triggerPhrases: ["invert-color"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability invert-color is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UinvertUcolorCapability);
