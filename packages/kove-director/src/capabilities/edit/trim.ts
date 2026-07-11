import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability, CapabilityContext } from "../types";

const TrimClipParams = z.object({
  clipId: z.string().describe("ID of the clip to trim"),
  edge: z.enum(["start", "end"]).describe("Which edge to trim"),
  newTime: z.number().describe("New time position for the trimmed edge"),
});

type TrimClipParams = z.infer<typeof TrimClipParams>;

export const TrimClipCapability: Capability<TrimClipParams> = {
  id: "trim-clip",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Trim a clip from its start or end edge to shorten or lengthen it.",
  triggerPhrases: ["trim this clip", "shorten this clip", "cut the beginning", "cut the end"],
  params: TrimClipParams,
  compile: (input, context) => {
    const { clipId, edge, newTime } = input;
    const clip = context.currentClip;
    if (!clip) throw new Error("trim-clip requires context.currentClip");

    return [
      {
        type: "clip/update",
        id: `trim-${Date.now()}`,
        timestamp: Date.now(),
        params: { clipId, ...(edge === "start" ? { startTime: newTime } : {}) },
      },
    ];
  },
  examples: [
    { input: { clipId: "clip-1", edge: "start", newTime: 1.0 }, output: [{ type: "clip/update", id: "ex-1", timestamp: 0, params: { clipId: "clip-1", startTime: 1.0 } }] },
  ],
};

registerCapability(TrimClipCapability);
