import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UsharpenCapability: Capability = {
  id: "sharpen",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: sharpen",
  triggerPhrases: ["sharpen"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability sharpen is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UsharpenCapability);
