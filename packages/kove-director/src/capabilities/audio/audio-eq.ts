import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UaudioUeqCapability: Capability = {
  id: "audio-eq",
  category: "audio",
  status: "planned",
  version: "0.0.0",
  description: "Planned: audio-eq. Not yet implemented.",
  triggerPhrases: ["audio-eq"],
  params: {},
  compile: () => {
    throw new Error("capability audio-eq is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UaudioUeqCapability);
