import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UposterizeUtimeCapability: Capability = {
  id: "posterize-time",
  category: "edit",
  status: "beta",
  version: "1.0.0",
  description: "Beta edit: posterize-time",
  triggerPhrases: ["posterize-time"],
  params: {},
  compile: () => {
    throw new Error("capability posterize-time is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UposterizeUtimeCapability);
