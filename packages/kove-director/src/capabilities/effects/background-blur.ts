import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UbackgroundUblurCapability: Capability = {
  id: "background-blur",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: background-blur",
  triggerPhrases: ["background-blur"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability background-blur is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UbackgroundUblurCapability);
