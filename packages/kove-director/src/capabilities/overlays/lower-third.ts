import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UlowerUthirdCapability: Capability = {
  id: "lower-third",
  category: "overlays",
  status: "beta",
  version: "1.0.0",
  description: "Beta overlay: lower-third",
  triggerPhrases: ["lower-third"],
  params: {},
  compile: () => {
    throw new Error("capability lower-third is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UlowerUthirdCapability);
