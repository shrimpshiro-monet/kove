import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UtitleUcardCapability: Capability = {
  id: "title-card",
  category: "overlays",
  status: "beta",
  version: "1.0.0",
  description: "Beta overlay: title-card",
  triggerPhrases: ["title-card"],
  params: {},
  compile: () => {
    throw new Error("capability title-card is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UtitleUcardCapability);
