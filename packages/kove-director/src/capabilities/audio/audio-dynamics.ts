import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UaudioUdynamicsCapability: Capability = {
  id: "audio-dynamics",
  category: "audio",
  status: "planned",
  version: "0.0.0",
  description: "Planned: audio-dynamics. Not yet implemented.",
  triggerPhrases: ["audio-dynamics"],
  params: {},
  compile: () => {
    throw new Error("capability audio-dynamics is status=planned, not yet callable");
  },
  examples: [],
};

registerCapability(UaudioUdynamicsCapability);
