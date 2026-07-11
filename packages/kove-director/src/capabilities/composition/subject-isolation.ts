import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UsubjectUisolationCapability: Capability = {
  id: "subject-isolation",
  category: "composition",
  status: "planned",
  version: "0.0.0",
  description: "Planned: subject-isolation. Not yet implemented.",
  triggerPhrases: ["subject-isolation"],
  params: {},
  compile: () => {
    throw new Error("capability subject-isolation is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UsubjectUisolationCapability);
