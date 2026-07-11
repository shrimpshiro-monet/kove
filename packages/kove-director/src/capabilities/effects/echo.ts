import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UechoCapability: Capability = {
  id: "echo",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: echo",
  triggerPhrases: ["echo"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability echo is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UechoCapability);
