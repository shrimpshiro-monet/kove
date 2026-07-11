import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UkineticUcaptionCapability: Capability = {
  id: "kinetic-caption",
  category: "overlays",
  status: "beta",
  version: "1.0.0",
  description: "Beta overlay: kinetic-caption",
  triggerPhrases: ["kinetic-caption"],
  params: {},
  compile: () => {
    throw new Error("capability kinetic-caption is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UkineticUcaptionCapability);
