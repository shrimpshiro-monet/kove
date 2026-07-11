import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UundoUredoCapability: Capability = {
  id: "undo-redo",
  category: "edit",
  status: "beta",
  version: "1.0.0",
  description: "Beta edit: undo-redo",
  triggerPhrases: ["undo-redo"],
  params: {},
  compile: () => {
    throw new Error("capability undo-redo is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UundoUredoCapability);
