import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const DeleteClipParams = z.object({
  clipId: z.string().describe("ID of the clip to delete"),
});

type DeleteClipParams = z.infer<typeof DeleteClipParams>;

export const DeleteClipCapability: Capability<DeleteClipParams> = {
  id: "delete-clip",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Remove a clip from the timeline. Leaves a gap.",
  triggerPhrases: ["delete this clip", "remove this clip", "get rid of this"],
  params: DeleteClipParams,
  compile: (input) => [
    { type: "clip/remove", id: `del-${Date.now()}`, timestamp: Date.now(), params: { clipId: input.clipId } },
  ],
  examples: [
    { input: { clipId: "clip-5" }, output: [{ type: "clip/remove", id: "ex-1", timestamp: 0, params: { clipId: "clip-5" } }] },
  ],
};

registerCapability(DeleteClipCapability);
