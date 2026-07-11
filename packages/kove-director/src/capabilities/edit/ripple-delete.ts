import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UrippleUdeleteCapability: Capability = {
  id: "ripple-delete",
  category: "edit",
  status: "planned",
  version: "0.0.0",
  description: "Planned: ripple-delete. Not yet implemented.",
  triggerPhrases: ["ripple-delete"],
  params: {},
  compile: () => {
    throw new Error("capability ripple-delete is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UrippleUdeleteCapability);
