// packages/engine-freecut/src/planner/parsePlan.ts
import { Action } from "../executor/types";

export function parsePlan(raw: string): Action[] {
  // strip markdown fences if Gemini ignores instructions
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  // strip JS-style // comments that Gemini loves to add
  const noComments = cleaned.replace(/^\s*\/\/.*$/gm, "");
  const parsed = JSON.parse(noComments);
  if (!Array.isArray(parsed)) throw new Error("Plan must be a JSON array");
  return parsed as Action[];
}
