import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UinterlaceUflickerCapability: Capability = {
  id: "interlace-flicker",
  category: "effects",
  status: "beta",
  version: "1.0.0",
  description: "Beta effect: interlace-flicker",
  triggerPhrases: ["interlace-flicker"],
  params: { clipId: "string" },
  compile: () => {
    throw new Error("capability interlace-flicker is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UinterlaceUflickerCapability);
