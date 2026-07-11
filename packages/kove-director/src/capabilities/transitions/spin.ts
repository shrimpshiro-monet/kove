import { z } from "zod";
import { registerCapability } from "../registry";
import type { Capability } from "../types";

const Params = z.object({
  clipAId: z.string().default("prev"),
  clipBId: z.string().default("next"),
  duration: z.number().min(0.1).max(5).default(0.5),
});

type Params = z.infer<typeof Params>;

export const UspinCapability: Capability<Params> = {
  id: "spin",
  category: "transitions",
  status: "alpha",
  version: "1.0.0",
  description: "spin transition between two clips.",
  triggerPhrases: ["spin", "spin transition"],
  params: Params,
  compile: (input) => [{
    type: "transition/add",
    id: "spin-${Date.now()}",
    timestamp: Date.now(),
    params: { clipAId: input.clipAId, clipBId: input.clipBId, type: "spin", duration: input.duration },
  }],
  examples: [{
    input: { clipAId: "prev", clipBId: "next", duration: 0.5 },
    output: [{ type: "transition/add", id: "ex-1", timestamp: 0, params: { clipAId: "prev", clipBId: "next", type: "spin", duration: 0.5 } }],
  }],
};

registerCapability(UspinCapability);
