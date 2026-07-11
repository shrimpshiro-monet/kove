import { registerCapability } from "../registry";
import type { Capability } from "../types";

export const UaudioUmixingCapability: Capability = {
  id: "audio-mixing",
  category: "audio",
  status: "beta",
  version: "1.0.0",
  description: "Beta audio: audio-mixing",
  triggerPhrases: ["audio-mixing"],
  params: {},
  compile: () => {
    throw new Error("capability audio-mixing is status=beta, not yet callable");
  },
  examples: [],
};

registerCapability(UaudioUmixingCapability);
