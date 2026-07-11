import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UunsharpUmaskCapability: Capability = {
  id: "unsharp-mask",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: unsharp-mask",
  triggerPhrases: ["unsharp-mask"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability unsharp-mask is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UunsharpUmaskCapability);
