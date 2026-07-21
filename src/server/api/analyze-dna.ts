import { z } from "zod";
import type { Env } from "../types/env";
import { analyzeVideo } from "../lib/analysis-engine.js";

const AnalyzeDNASchema = z.object({
  filePath: z.string().min(1),
  fps: z.number().min(0.5).max(30).default(3),
  type: z.enum(["reference", "footage"]).default("reference"),
});

export async function handleAnalyzeDNA(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = AnalyzeDNASchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await analyzeVideo(env, parsed.data);

    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    return Response.json({ success: true, data: result.value });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
