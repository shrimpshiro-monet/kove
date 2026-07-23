/**
 * V3 API Handlers — the HTTP endpoints for the new pipeline.
 *
 * POST /api/v3/analyze      — analyze uploaded clips
 * POST /api/v3/generate     — generate ShotEDL from prompt + clips
 * POST /api/v3/refine       — refine ShotEDL based on feedback
 * POST /api/v3/render       — render ShotEDL (delegates to kove-advanced)
 */
import type { Env } from "../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { analyzeClip, analyzeMultipleClips, type ClipAnalysis } from "../lib/clip-analyzer";
import { compileScript, type ScriptLine } from "../lib/script-compiler";
import { selectBestMoments } from "../lib/moment-selector";
import { translateReference } from "../lib/reference-translator";
import { validateShotEDL } from "@monet/edl-v3";
import { createEmptyShotEDL, createShot, registerAsset, renormalizeTimeline, toJSON } from "@monet/edl-v3";
import type { ShotEDL } from "@monet/edl-v3";

// ── POST /api/v3/analyze ────────────────────────────────────────────────────

export async function handleV3Analyze(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      clips: Array<{ clipId: string; filePath: string; duration?: number }>;
    };

    if (!body.clips || body.clips.length === 0) {
      return apiError(ApiErrorCode.InvalidRequest, "At least one clip is required", 400);
    }

    console.log(`[v3/analyze] Analyzing ${body.clips.length} clips`);

    const analyses = await analyzeMultipleClips({
      env,
      clips: body.clips,
    });

    // Store analyses in D1
    if (env.DB) {
      for (const analysis of analyses) {
        try {
          await env.DB.prepare(
            `INSERT INTO analysis_results (id, project_id, analysis_data, created_at) VALUES (?, ?, ?, ?)`
          )
            .bind(
              `v3-${analysis.clipId}`,
              body.projectId,
              JSON.stringify(analysis),
              Date.now(),
            )
            .run();
        } catch (e) {
          console.warn(`[v3/analyze] D1 insert failed for ${analysis.clipId}: ${(e as Error).message}`);
        }
      }
    }

    return jsonResponse({
      success: true,
      analyses: analyses.map((a) => ({
        clipId: a.clipId,
        duration: a.duration,
        hasSpeech: a.hasSpeech,
        summary: a.summary,
        cutPointCount: a.cutPoints.length,
        semanticSegments: a.semantic.segments.length,
      })),
    });
  } catch (error: any) {
    console.error("[v3/analyze] Error:", error);
    return apiError(ApiErrorCode.InternalError, error.message || "Analysis failed", 500);
  }
}

// ── POST /api/v3/generate ───────────────────────────────────────────────────

export async function handleV3Generate(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      prompt: string;
      clips: Array<{ clipId: string; filePath: string; duration?: number }>;
      script?: ScriptLine[];
      referenceStyle?: Record<string, unknown>;
      referenceMode?: "strict" | "inspired";
      musicId?: string;
      musicBpm?: number;
      targetDuration?: number;
    };

    if (!body.prompt && !body.script) {
      return apiError(ApiErrorCode.InvalidRequest, "prompt or script is required", 400);
    }

    if (!body.clips || body.clips.length === 0) {
      return apiError(ApiErrorCode.InvalidRequest, "At least one clip is required", 400);
    }

    console.log(`[v3/generate] Generating EDL for project ${body.projectId}`);

    // Step 1: Analyze clips (or use cached analysis)
    const analyses = await analyzeMultipleClips({
      env,
      clips: body.clips,
    });

    // Step 2: Determine scenario and generate shots
    let edl: ShotEDL;

    if (body.script && body.script.length > 0) {
      // SCENARIO 1: Scripted
      console.log(`[v3/generate] Scripted mode — ${body.script.length} lines`);
      edl = await generateFromScript(env, body.script, analyses, body.musicBpm);
    } else if (body.referenceStyle) {
      // SCENARIO 3: Reference translation
      console.log(`[v3/generate] Reference mode — ${body.referenceMode ?? "inspired"}`);
      edl = await generateFromReference(
        env,
        body.prompt,
        analyses,
        body.referenceStyle,
        body.referenceMode ?? "inspired",
        body.musicBpm,
        body.targetDuration,
      );
    } else {
      // SCENARIO 2: Montage (no script, no reference)
      console.log(`[v3/generate] Montage mode — "create something amazing"`);
      edl = await generateMontage(
        env,
        body.prompt,
        analyses,
        body.musicBpm,
        body.targetDuration,
      );
    }

    // Step 3: Validate
    const validation = await validateShotEDL(edl);
    if (!validation.valid) {
      console.warn(`[v3/generate] Validation warnings:`, validation.warnings);
    }

    // Step 4: Store EDL
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            edl.id,
            body.projectId,
            toJSON(edl),
            0, // beat sync score (computed later)
            0, // pacing variance
            validation.valid ? 1 : 0.5,
            0,
            body.prompt,
            Date.now(),
          )
          .run();
      } catch (e) {
        console.warn(`[v3/generate] D1 insert failed: ${(e as Error).message}`);
      }
    }

    return jsonResponse({
      success: true,
      edlId: edl.id,
      edl,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      scenario: body.script ? "scripted" : body.referenceStyle ? "reference" : "montage",
    });
  } catch (error: any) {
    console.error("[v3/generate] Error:", error);
    return apiError(ApiErrorCode.EDLGenerationFailed, error.message || "EDL generation failed", 500);
  }
}

// ── POST /api/v3/refine ─────────────────────────────────────────────────────

export async function handleV3Refine(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      projectId: string;
      edl: ShotEDL;
      feedback: string;
    };

    if (!body.edl || !body.feedback) {
      return apiError(ApiErrorCode.InvalidRequest, "edl and feedback are required", 400);
    }

    console.log(`[v3/refine] Refining EDL with feedback: "${body.feedback}"`);

    const ai = (await import("../services/ai-service")).getAIService(env);

    // Ask AI to modify the EDL based on feedback
    const result = await ai.run("v3-refine", {
      systemPrompt:
        "You refine a ShotEDL based on user feedback. " +
        "Return the COMPLETE updated ShotEDL as JSON. " +
        "Preserve shot IDs when possible. " +
        "If feedback is vague, ask a clarifying question by returning {\"clarification\":\"...\"} instead of an EDL.",
      prompt:
        `Current EDL:\n${JSON.stringify(body.edl, null, 2)}\n\n` +
        `User feedback: "${body.feedback}"\n\n` +
        `Return updated ShotEDL JSON.`,
      maxTokens: 6144,
    });

    let parsed: any;
    try {
      parsed = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
    } catch {
      return apiError(ApiErrorCode.EDLGenerationFailed, "AI returned invalid JSON", 500);
    }

    if (parsed.clarification) {
      return jsonResponse({ success: true, clarification: parsed.clarification });
    }

    // Validate refined EDL
    const validation = await validateShotEDL(parsed);
    if (!validation.valid) {
      return apiError(
        ApiErrorCode.EDLGenerationFailed,
        `Refined EDL is invalid: ${validation.errors.join("; ")}`,
        400,
      );
    }

    // Store refined EDL
    const edlId = `refined-${Date.now()}`;
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(edlId, body.projectId, toJSON(parsed), 0, 0, 1, 0, body.feedback, Date.now())
          .run();
      } catch (e) {
        console.warn(`[v3/refine] D1 insert failed: ${(e as Error).message}`);
      }
    }

    return jsonResponse({
      success: true,
      edlId,
      edl: parsed,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    });
  } catch (error: any) {
    console.error("[v3/refine] Error:", error);
    return apiError(ApiErrorCode.EDLGenerationFailed, error.message || "Refine failed", 500);
  }
}

// ── POST /api/v3/render ─────────────────────────────────────────────────────

export async function handleV3Render(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      edl: ShotEDL;
      mode?: "preview" | "final";
      outputWidth?: number;
      outputHeight?: number;
    };

    if (!body.edl) {
      return apiError(ApiErrorCode.InvalidRequest, "edl is required", 400);
    }

    const mode = body.mode ?? "preview";
    console.log(`[v3/render] Rendering ${mode} — ${body.edl.shots.length} shots`);

    // Delegate to existing render infrastructure
    // For preview: use the existing render-preview endpoint
    // For final: use the existing export endpoint
    const apiBase = (env as any).MONET_API_URL || "http://localhost:3000";

    const renderPayload = {
      edl: body.edl,
      width: body.outputWidth ?? 1080,
      height: body.outputHeight ?? 1920,
      fps: body.edl.meta.fps,
      mode,
    };

    const resp = await fetch(`${apiBase}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renderPayload),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return apiError(
        ApiErrorCode.InternalError,
        `Render delegation failed: ${resp.status} ${errorText}`,
        502,
      );
    }

    const result = await resp.json() as any;
    return jsonResponse({
      success: true,
      jobId: result.data?.jobId,
      queue: result.data?.queue,
      pollUrl: result.data?.jobId ? `/api/render-status/${result.data.jobId}` : undefined,
    });
  } catch (error: any) {
    console.error("[v3/render] Error:", error);
    return apiError(ApiErrorCode.InternalError, error.message || "Render failed", 500);
  }
}

// ── Generation Helpers ──────────────────────────────────────────────────────

async function generateFromScript(
  env: Env,
  script: ScriptLine[],
  analyses: ClipAnalysis[],
  musicBpm?: number,
): Promise<ShotEDL> {
  // Compile script to shots
  const compiled = compileScript({ script, clipAnalyses: analyses, musicBpm });

  // Build EDL
  const edl = createEmptyShotEDL({ prompt: script.map((s) => s.text).join(" ") });

  // Register all assets
  for (const analysis of analyses) {
    registerAsset(edl, {
      id: analysis.clipId,
      path: analysis.clipId, // path will be resolved at render time
      duration: analysis.duration,
      width: 1920,
      height: 1080,
    });
  }

  // Add compiled shots
  let currentTime = 0;
  for (const cs of compiled) {
    if (!cs.clipId) continue; // skip motion-graphics (handled as overlays)
    const shot = createShot({
      clipId: cs.clipId,
      inPoint: cs.inPoint,
      outPoint: cs.outPoint,
      startTime: currentTime,
      effects: cs.effect ? [{ id: `fx-${Date.now()}`, type: cs.effect, intensity: 0.7 }] : [],
      transition: cs.transition ? { type: cs.transition as any, duration: 0 } : undefined,
    });
    edl.shots.push(shot);
    currentTime += shot.timing.duration;
  }

  edl.meta.duration = currentTime;
  edl.meta.generationMode = "scripted";

  return edl;
}

async function generateFromReference(
  env: Env,
  prompt: string,
  analyses: ClipAnalysis[],
  referenceStyle: Record<string, unknown>,
  mode: "strict" | "inspired",
  musicBpm?: number,
  targetDuration?: number,
): Promise<ShotEDL> {
  // Translate reference to constraints
  const constraints = translateReference({
    referenceStyle,
    clipAnalyses: analyses,
    mode,
  });

  // Select best moments
  const moments = selectBestMoments({
    clipAnalyses: analyses,
    targetDuration: targetDuration ?? 30,
    musicBpm,
  });

  // Build EDL from selected moments
  const edl = createEmptyShotEDL({ prompt, referenceStyleId: "ref" });

  for (const analysis of analyses) {
    registerAsset(edl, {
      id: analysis.clipId,
      path: analysis.clipId,
      duration: analysis.duration,
      width: 1920,
      height: 1080,
    });
  }

  // Add moments as shots
  let currentTime = 0;
  const allMoments = [
    moments.hook,
    ...moments.body,
    moments.reveal,
    moments.cta,
  ].filter(Boolean);

  for (const moment of allMoments) {
    if (!moment) continue;

    // Apply constraints to effects
    const effects = constraints.effects.intensity > 0.3
      ? [{
          id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: constraints.effects.allowedTypes[0] ?? "speed_ramp",
          intensity: constraints.effects.intensity,
        }]
      : [];

    const shot = createShot({
      clipId: moment.shot.source.clipId,
      inPoint: moment.shot.source.inPoint,
      outPoint: moment.shot.source.outPoint,
      startTime: currentTime,
      effects,
      transition: {
        type: constraints.transitions.defaultType as any,
        duration: constraints.transitions.avgDuration,
      },
      meta: {
        narrativeRole: moment.shot.meta.narrativeRole,
        importance: moment.shot.meta.importance,
        aiRationale: moment.reason,
      },
    });
    edl.shots.push(shot);
    currentTime += shot.timing.duration;
  }

  edl.meta.duration = currentTime;
  edl.meta.generationMode = "reference";

  return edl;
}

async function generateMontage(
  env: Env,
  prompt: string,
  analyses: ClipAnalysis[],
  musicBpm?: number,
  targetDuration?: number,
): Promise<ShotEDL> {
  // Select best moments
  const moments = selectBestMoments({
    clipAnalyses: analyses,
    targetDuration: targetDuration ?? 30,
    musicBpm,
  });

  // Build EDL
  const edl = createEmptyShotEDL({ prompt });

  for (const analysis of analyses) {
    registerAsset(edl, {
      id: analysis.clipId,
      path: analysis.clipId,
      duration: analysis.duration,
      width: 1920,
      height: 1080,
    });
  }

  // Add moments as shots
  let currentTime = 0;
  const allMoments = [
    moments.hook,
    ...moments.body,
    moments.reveal,
    moments.cta,
  ].filter(Boolean);

  for (const moment of allMoments) {
    if (!moment) continue;

    const shot = createShot({
      clipId: moment.shot.source.clipId,
      inPoint: moment.shot.source.inPoint,
      outPoint: moment.shot.source.outPoint,
      startTime: currentTime,
      meta: {
        narrativeRole: moment.shot.meta.narrativeRole,
        importance: moment.shot.meta.importance,
        aiRationale: moment.reason,
      },
    });
    edl.shots.push(shot);
    currentTime += shot.timing.duration;
  }

  edl.meta.duration = currentTime;
  edl.meta.generationMode = "montage";

  return edl;
}
