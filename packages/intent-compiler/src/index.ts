export { operationPlanz } from "./zod-schema.js";
export type { OperationPlan, Operation, SpeedCurve, GlobalEffect, TextOverlay, AudioMix, EffectParams, ColorParams } from "./types.js";
export type { OperationPlanInput } from "./zod-schema.js";

import { z } from "zod";
import { operationPlanz } from "./zod-schema.js";
import type { OperationPlan } from "./types.js";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function validateOperationPlan(data: unknown): Result<OperationPlan, z.ZodError> {
  const result = operationPlanz.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data as OperationPlan };
  }
  return { ok: false, error: result.error };
}
