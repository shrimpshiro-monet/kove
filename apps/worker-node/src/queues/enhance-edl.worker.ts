import { createWorker } from "../../../api/src/services/queue";
import { runBetaOneEnhancers } from "@monet/edl-enhancers";
import { Job } from "bullmq";
import { JobPayload } from "@monet/job-contracts/src/queues";

createWorker("enhance.recipe", async (job: Job<JobPayload<"enhance.recipe">>) => {
  console.log("[enhance.recipe] Running");

  const { edl } = job.data;

  const result = runBetaOneEnhancers({
    edl: edl as any,
  });

  if (!result.success || !result.edl) {
    throw new Error(result.error?.message || "Enhancer failed");
  }

  console.log("[enhance.recipe] Done");

  // TODO → enqueue render.preview
});