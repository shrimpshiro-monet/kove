import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const GlTransitionExperimentalCapability: Capability = {
  id: "gl-transition-experimental",
  category: "transitions",
  status: "beta",
  version: "1.0.0",
  description: "Experimental GL shader transitions (cube, mosaic, ripple, swirl, dreamy, etc).",
  triggerPhrases: ["cube transition", "mosaic transition", "ripple transition"],
  params: { type: "string", duration: "number" },
  compile: () => {
    throw new Error("capability gl-transition-experimental is status=beta, not yet callable");
  },
  examples: [],
};
registerCapability(GlTransitionExperimentalCapability);
