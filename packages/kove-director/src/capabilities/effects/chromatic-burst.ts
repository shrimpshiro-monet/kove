import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UchromaticUburstCapability: Capability = {
  id: "chromatic-burst",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: chromatic-burst",
  triggerPhrases: ["chromatic-burst"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability chromatic-burst is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UchromaticUburstCapability);
