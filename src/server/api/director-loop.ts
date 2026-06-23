import { MonetEDL, PreviewFrame } from "../types/edl.js";
import { generatePatch } from "./generate-patch.js";
import { applyPatch } from "./apply-patch.js";
import { EDLVersionStack } from "../../lib/edl-version.js";
import { Env } from "../types/env.js";

interface PatchRequest {
  currentEDL: MonetEDL;
  feedback: string;
  keyframes: PreviewFrame[];
}

interface PatchResponse {
  newEDL: MonetEDL;
  patch: any;
  versionId: string;
}

/**
 * Main entry point for the Interactive Director feedback loop.
 * This function takes the current state and user feedback, 
 * generates a patch, applies it, and returns the new EDL.
 */
export async function handleDirectorFeedback(
  req: PatchRequest,
  versionStack: EDLVersionStack,
  env?: Env
): Promise<PatchResponse> {
  console.log(`Director receiving feedback: "${req.feedback}"`);

  // 1. Generate patch from feedback + visual context
  const patch = await generatePatch(
    req.currentEDL,
    req.feedback,
    req.keyframes,
    env
  );

  console.log(`Generated patch with ${patch.operations.length} operations.`);

  // 2. Apply patch to get new EDL
  const newEDL = applyPatch(req.currentEDL, patch);

  // 3. Save to version history
  const version = versionStack.push(newEDL, `Feedback: ${req.feedback}`);

  return {
    newEDL,
    patch,
    versionId: version.id
  };
}
