import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UsfxUsynthesisCapability: Capability = {
  id: "sfx-synthesis",
  category: "audio",
  status: "beta",
  version: "1.0.0",
  description: "Beta audio: sfx-synthesis",
  triggerPhrases: ["sfx-synthesis"],
  params: {},
  compile: () => {
    throw new Error("capability sfx-synthesis is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UsfxUsynthesisCapability);
