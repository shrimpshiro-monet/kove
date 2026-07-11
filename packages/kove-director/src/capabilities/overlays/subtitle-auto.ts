import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UsubtitleUautoCapability: Capability = {
  id: "subtitle-auto",
  category: "overlays",
  status: "beta",
  version: "1.0.0",
  description: "Beta overlay: subtitle-auto",
  triggerPhrases: ["subtitle-auto"],
  params: {},
  compile: () => {
    throw new Error("capability subtitle-auto is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UsubtitleUautoCapability);
