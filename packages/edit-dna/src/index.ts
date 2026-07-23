export { editDNAz } from "./zod-schema.js";
export type { EditDNA, Shot, ColorProfile, AudioProfile, TextEvent, PacingProfile } from "./schema.js";
export type { EditDNAInput } from "./zod-schema.js";

import { z } from "zod";
import { editDNAz } from "./zod-schema.js";
import type { EditDNA } from "./schema.js";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function validateEditDNA(data: unknown): Result<EditDNA, z.ZodError> {
  const result = editDNAz.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data as EditDNA };
  }
  return { ok: false, error: result.error };
}
