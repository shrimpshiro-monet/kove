import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  direction: z.enum(["undo", "redo"]).describe("Whether to undo or redo"),
});

type P = z.infer<typeof Params>;

export const UndoRedoCapability: Capability<P> = {
  id: "undo-redo",
  category: "edit",
  status: "alpha",
  version: "1.0.0",
  description: "Undo or redo the last edit action. The project store maintains a 50-entry history stack.",
  triggerPhrases: [
    "undo",
    "redo",
    "go back",
    "reverse that",
    "undo last change",
  ],
  params: Params,
  compile: (input) => [
    {
      type: input.direction === "undo" ? "history/undo" : "history/redo",
      id: `ur-${Date.now()}`,
      timestamp: Date.now(),
      params: {},
    },
  ],
  examples: [
    {
      input: { direction: "undo" },
      output: [
        {
          type: "history/undo",
          id: "ex-1",
          timestamp: 0,
          params: {},
        },
      ],
    },
  ],
};

registerCapability(UndoRedoCapability);
