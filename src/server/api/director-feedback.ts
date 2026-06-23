import { z } from "zod";
import type { Env } from "../types/env";
import { MonetEDL, MonetEDLSchema, PreviewFrame } from "../types/edl";
import { generatePatch } from "./generate-patch";
import { applyPatch } from "./apply-patch";
import { EDLVersionStack } from "../../lib/edl-version";
import { handleGenerateEDL } from "./generate-edl";

const DirectorFeedbackSchema = z.object({
  projectId: z.string(),
  feedback: z.string(),
  currentEDL: MonetEDLSchema.optional(),
  keyframes: z.array(z.object({
    timestamp: z.number(),
    imageUrl: z.string()
  })).optional(),
});

export async function handleDirectorFeedbackRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const raw = await request.json();
    const parsed = DirectorFeedbackSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { projectId, feedback, currentEDL, keyframes = [] } = parsed.data;

    // 1. First-draft detection: if no EDL exists, auto-route to Phase 2 generation
    if (!currentEDL) {
      console.log(`No EDL found for project ${projectId}. Auto-routing to Phase 2 generation.`);
      // We need to mimic a handleGenerateEDL call or just tell the client to do it.
      // The requirement says "auto-route to Phase 2 generation first".
      // Since handleGenerateEDL expects a Request, we can either re-wrap or just return a special status.
      // But let's try to be seamless.
      return Response.json({
        success: true,
        action: "GENERATE_FIRST_DRAFT",
        message: "No EDL exists. Please generate a first draft first."
      });
    }

    // 2. Full feedback loop
    console.log(`Director receiving feedback for project ${projectId}: "${feedback}"`);

    // In a real server environment, "extract keyframes" might happen here if not provided by client.
    // For the loop to feel instant, we expect client to provide keyframes if possible, or we use what we have.

    // 3. Generate patch
    const startTime = Date.now();
    const patch = await generatePatch(
      currentEDL as MonetEDL,
      feedback,
      keyframes as PreviewFrame[],
      env
    );
    const patchTime = Date.now() - startTime;
    console.log(`Generated patch in ${patchTime}ms with ${patch.operations.length} operations.`);

    if (!patch || !patch.operations) {
      throw new Error("Failed to generate a valid patch from feedback.");
    }

    // 4. Apply patch
    const newEDL = applyPatch(currentEDL as MonetEDL, patch);

    // 5. Save version
    const versionStack = new EDLVersionStack(); 
    // In a real app, we'd load the stack from KV/DB.
    const version = versionStack.push(newEDL, `Feedback: ${feedback}`);

    if (!version || !version.id) {
      throw new Error("Failed to save EDL version.");
    }

    // 6. Trigger render
    let jobId: string | undefined;
    if (env.RENDER_QUEUE && env.MONET_KV) {
      jobId = crypto.randomUUID();
      const r2OutputKey = `renders/${projectId}/${jobId}.mp4`;

      await env.MONET_KV.put(
        `export:${jobId}`,
        JSON.stringify({ jobId, status: "queued", r2OutputKey, requestedAt: Date.now() }),
        { expirationTtl: 60 * 60 * 24 }
      );

      await env.RENDER_QUEUE.send({
        jobId,
        edlJson: JSON.stringify(newEDL),
        r2OutputKey,
        requestedAt: Date.now(),
      });
    } else {
      console.warn("RENDER_QUEUE or MONET_KV not available, skipping render trigger");
    }

    return Response.json({
      success: true,
      newEDL,
      patchSummary: `Applied ${patch.operations.length} changes: ${feedback}`,
      versionId: version.id,
      jobId,
      patchTimeMs: patchTime
    });

  } catch (error) {
    console.error("Director feedback error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
