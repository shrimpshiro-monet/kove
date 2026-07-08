// POST /api/generate-edl - Two-pass EDL generation
// Fix 5: Pass 1 = LLM creative skeleton, Pass 2 = deterministic timing
// Fix 4: prompt is primary input, intentId is optional cache key
// Audio intelligence: song structure analysis + speech detection + ducking
// V3: When reference style exists, routes through full v3 pipeline with reference director

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { alignToOnsets } from "../lib/onset-alignment";
import { fastPlanner } from "../lib/fast-planner";
import { scoreNewPipelineEDL, type EDLScores } from "../lib/edl-scoring";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";
import { generateDuckingEnvelope, duckingEnvelopeToFFmpegFilter } from "../lib/monet-audio-adapter";
import { effectMapper } from "../lib/effect-mapper";
import { enhanceEDLWithStyleDirectives } from "../director/enhance-edl-with-style";
import { compileReferenceStyleToDirectives } from "../director/style-directives";
import { generateEDL as generateEDLV3 } from "../lib/edl-generation";

const CREATIVE_SYSTEM =
  "You are a video director. Given footage analysis, music analysis, and intent, " +
  "produce an EDLCreativeSkeleton: an ordered list of shots with emotional roles and effect INTENTS.\n\n" +
  "CRITICAL RULES:\n" +
  "- Do NOT specify exact times or durations. Pass 2 handles timing math.\n" +
  "- Each shot references source.clipId and source.segmentIndex from the analysis.\n" +
  "- effectIntents describe creative intent (energy_boost, tension_build, etc.), NOT concrete effects.\n" +
  "- The emotional arc should escalate, peak, and resolve.\n" +
  "- Return ONLY valid JSON matching the EDLCreativeSkeleton schema.";

export async function handleGenerateEDL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    console.log("[generate-edl] REQUEST RECEIVED");
    const body = (await request.json()) as {
      projectId: string;
      intentId?: string;
      analysisId: string;
      prompt: string;
      referenceStyleId?: string;
      analysisData?: any;
      targetDuration?: number;
      style?: string;
      referenceStyle?: any;
      referenceTrace?: any;
      referenceMode?: "strict_replication" | "inspired";
      styleDNA?: any;
      intensity?: number;
      tempoMode?: string;
    };

    const {
      projectId, intentId, analysisId, prompt, referenceStyleId,
      analysisData, targetDuration: targetDur, style,
      referenceStyle: clientReferenceStyle, referenceTrace, referenceMode,
      styleDNA, intensity, tempoMode,
    } = body;
    const ai = getAIService(env);

    // [DEBUG-ROOTCAUSE] Server receives request — check what was actually sent
    const rawBody = body as Record<string, unknown>;
    console.log("[DEBUG-ROOTCAUSE] STAGE0_SERVER_RECEIVED", JSON.stringify({
      hasProjectId: !!projectId,
      hasIntentId: !!intentId,
      hasAnalysisId: !!analysisId,
      hasPrompt: !!prompt,
      hasReferenceStyleId: !!referenceStyleId,
      hasAnalysisData: !!analysisData,
      hasTargetDuration: !!targetDur,
      // These fields are sent by client but NOT destructured by server
      hasReferenceStyle: !!rawBody.referenceStyle,
      hasReferenceTrace: !!rawBody.referenceTrace,
      hasReferenceMode: !!rawBody.referenceMode,
      hasStyleDNA: !!rawBody.styleDNA,
      hasIntensity: rawBody.intensity !== undefined,
      hasTempoMode: !!rawBody.tempoMode,
    }));

    if (!prompt) {
      return apiError(ApiErrorCode.InvalidRequest, "prompt is required", 400);
    }

    // === Resolve intent — prompt is primary, intentId is optional cache key (Fix 4)
    let intent: any = null;
    if (intentId && env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT intent_data FROM edit_intents WHERE id = ?"
        )
          .bind(intentId)
          .first<{ intent_data: string }>();
        if (row?.intent_data) intent = JSON.parse(row.intent_data);
      } catch { /* intent not found, will re-decode */ }
    }

    if (!intent) {
      // Re-decode from prompt
      try {
        const decodeRes = await ai.run("decode-intent", {
          systemPrompt:
            "You decode user prompts into structured editing intent. Return ONLY valid JSON.",
          prompt: `User prompt: "${prompt}"`,
          maxTokens: 1024,
        });
        intent = decodeRes.data;
      } catch (e) {
        console.error("[generate-edl] Intent decode failed:", (e as Error).message);
        return apiError(
          ApiErrorCode.IntentDecodeFailed,
          "Could not resolve intent from prompt",
          500
        );
      }
    }

    // === Fetch analysis — prefer direct data, fallback to D1
    let analysis: any = analysisData || null;
    if (!analysis && env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT analysis_data FROM analysis_results WHERE id = ?"
        )
          .bind(analysisId)
          .first<{ analysis_data: string }>();
        if (row?.analysis_data) analysis = JSON.parse(row.analysis_data);
      } catch { /* analysis not found */ }
    }

    if (!analysis) {
      console.error("[generate-edl] Analysis not found for ID:", analysisId, "DB available:", !!env.DB, "direct data:", !!analysisData);
      return apiError(
        ApiErrorCode.AnalysisNotFound,
        "Analysis not found. Run /api/analyze first.",
        404
      );
    }

    // === Reference style (optional) — prefer direct object, fallback to D1 lookup
    let referenceStyle: any = clientReferenceStyle || null;
    if (!referenceStyle && referenceStyleId && env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT analysis_data FROM analysis_results WHERE id = ?"
        )
          .bind(referenceStyleId)
          .first<{ analysis_data: string }>();
        if (row?.analysis_data) referenceStyle = JSON.parse(row.analysis_data);
      } catch { /* reference not found */ }
    }

    // [DEBUG-ROOTCAUSE] Reference analysis consumption check
    console.log("[DEBUG-ROOTCAUSE] REFERENCE_CONSUMPTION", JSON.stringify({
      referenceStyleIdSent: !!referenceStyleId,
      referenceStyleLoaded: !!referenceStyle,
      referenceStyleDataKeys: referenceStyle ? Object.keys(referenceStyle) : [],
      // Client also sent referenceStyle as full object — but server only uses referenceStyleId
      clientSentFullReferenceStyle: !!rawBody.referenceStyle,
      clientSentReferenceTrace: !!rawBody.referenceTrace,
      clientSentReferenceMode: !!rawBody.referenceMode,
      clientSentStyleDNA: !!rawBody.styleDNA,
      clientSentTempoMode: !!rawBody.tempoMode,
      clientSentIntensity: rawBody.intensity !== undefined,
      warning: !referenceStyle && rawBody.referenceStyle
        ? "CLIENT SENT FULL REFERENCE STYLE BUT SERVER ONLY LOOKS UP BY referenceStyleId — REFERENCE ANALYSIS IS NOT BEING CONSUMED"
        : referenceStyle ? "Reference style loaded from D1" : "No reference style",
    }));

    // === V3 PIPELINE: When reference style exists, use full v3 generation ===
    if (referenceStyle && referenceMode) {
      console.log("[generate-edl] Routing to V3 pipeline with reference style");
      console.log("[generate-edl:v3-inputs]", JSON.stringify({
        hasIntent: !!intent,
        intentPacing: intent?.style?.pacing,
        footageCount: analysis.footage?.length ?? 0,
        totalSegments: analysis.footage?.reduce((sum: number, f: any) => sum + (f.segments?.length ?? 0), 0) ?? 0,
        hasMusic: !!analysis.music,
        musicDuration: analysis.music?.duration,
        referenceStyleKeys: referenceStyle ? Object.keys(referenceStyle) : [],
        referenceMode,
      }));
      try {
        const clipIds = (analysis.footage ?? []).map((f: any) => f.clipId);
        const v3Edl = await generateEDLV3({
          env,
          intent,
          analysis,
          ai,
          referenceStyle,
          referenceMode,
          analysisId,
          clipIds,
          prompt,
        });

        // Duration invariant: clamp shots to timeline duration
        const v3TimelineDuration = v3Edl.timeline?.duration ?? 30;
        if (v3Edl.shots && v3Edl.shots.length > 0) {
          const maxEnd = Math.max(...v3Edl.shots.map((s: any) => (s.timing?.startTime ?? 0) + (s.timing?.duration ?? 0)));
          if (maxEnd > v3TimelineDuration + 0.01) {
            console.log(`[generate-edl] Duration invariant: clamping ${maxEnd.toFixed(2)}s to ${v3TimelineDuration}s`);
            v3Edl.shots = v3Edl.shots.filter((s: any) => (s.timing?.startTime ?? 0) < v3TimelineDuration);
            const lastShot = v3Edl.shots[v3Edl.shots.length - 1];
            if (lastShot) {
              const shotEnd = (lastShot.timing?.startTime ?? 0) + (lastShot.timing?.duration ?? 0);
              if (shotEnd > v3TimelineDuration) {
                lastShot.timing.duration = v3TimelineDuration - (lastShot.timing?.startTime ?? 0);
              }
            }
          }
        }

        // Score
        const musicForScore = analysis.music ?? { sourceId: "", duration: v3Edl.timeline?.duration ?? 30, bpm: 120, beatGrid: [] };
        const scores = scoreNewPipelineEDL(v3Edl as any, musicForScore as any);

        // Store EDL
        const edlId = crypto.randomUUID();
        if (env.DB) {
          try {
            await env.DB.prepare(
              `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(edlId, projectId, JSON.stringify(v3Edl), scores.beatSyncScore, scores.pacingVariance, scores.overallConfidence, 0, prompt, Date.now())
              .run();
          } catch (e) {
            console.warn("[generate-edl] D1 insert failed:", (e as Error).message);
          }
        }

        console.log("[DEBUG-ROOTCAUSE] V3_PIPELINE_RESULT", JSON.stringify({
          shotCount: v3Edl.shots?.length ?? 0,
          strictStyleShots: v3Edl.shots?.filter((s: any) => s.meta?.styleMode === "strict_replication").length ?? 0,
          generationMode: "v3_director",
        }));

        console.log("[generate-edl:v3-result]", JSON.stringify({
          shotCount: v3Edl.shots?.length ?? 0,
          duration: v3Edl.timeline?.duration ?? 0,
          maxShotEnd: v3Edl.shots?.length
            ? Math.max(...v3Edl.shots.map((s: any) => (s.timing?.startTime ?? 0) + (s.timing?.duration ?? 0)))
            : 0,
        }));

        return jsonResponse({
          success: true,
          edlId,
          edl: v3Edl,
          scores,
          generationMode: "v3_director",
          provider: "gemini",
          model: "gemini-2.5-flash",
          audioIntelligence: {},
        });
      } catch (e) {
        console.warn("[generate-edl] V3 pipeline failed, falling back to skeleton:", (e as Error).message);
        // Fall through to two-pass pipeline
      }
    }

    // === PASS 1 — Creative skeleton from LLM (legacy fallback) ===
    let skeleton: any = null;
    let provider = "";
    let model = "";

    try {
      const shotCount = Math.max(
        6,
        Math.min(16, Math.floor((analysis.music?.duration ?? 30) / 2))
      );

      const creativePrompt =
        `Intent: ${JSON.stringify(intent)}\n\n` +
        `Footage analysis: ${JSON.stringify(analysis.footage)}\n\n` +
        `Music: BPM ${analysis.music?.bpm ?? 120}, duration ${analysis.music?.duration ?? 30}s, ` +
        `mood "${analysis.music?.characteristics?.mood?.join(", ") ?? "unknown"}", ` +
        `sections: ${JSON.stringify(analysis.music?.sections ?? [])}\n\n` +
        (referenceStyle
          ? `Reference style to match:\n${JSON.stringify(referenceStyle)}\n\n`
          : "") +
        (referenceMode
          ? `Reference mode: ${referenceMode}\n\n`
          : "") +
        (styleDNA
          ? `Style directives from reference analysis:\n${JSON.stringify(styleDNA)}\n\n`
          : "") +
        (intensity !== undefined
          ? `Edit intensity: ${intensity} (0=subtle/minimal, 1=aggressive/heavy)\n\n`
          : "") +
        (tempoMode
          ? `Tempo mode: ${tempoMode}\n\n`
          : "") +
        `Produce an EDLCreativeSkeleton with ${shotCount} shots. ` +
        `The emotional arc should match the music sections and intent style.`;

      const result = await ai.run("generate-edl-creative", {
        systemPrompt: CREATIVE_SYSTEM,
        prompt: creativePrompt,
        schema: undefined,
        schemaJSON: {
          type: "object",
          properties: {
            version: { type: "string" },
            emotionalArc: { type: "array", items: { type: "string" } },
            shots: {
              type: "array",
              minItems: 2,
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  source: {
                    type: "object",
                    properties: {
                      clipId: { type: "string" },
                      segmentIndex: { type: "number" },
                    },
                    required: ["clipId", "segmentIndex"],
                  },
                  intendedRole: {
                    type: "string",
                    enum: ["hook", "build", "peak", "release", "transition", "closer"],
                  },
                  emotionalBeat: { type: "string" },
                  effectIntents: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: [
                            "energy_boost", "tension_build", "release", "impact_hit",
                            "dreamy_soft", "glitch_chaos", "speed_emphasis", "subject_focus",
                            "color_pop", "transition_smooth", "transition_hard",
                          ],
                        },
                        intensity: { type: "number" },
                        trigger: {
                          type: "string",
                          enum: ["beat_drop", "beat_normal", "cut_in", "cut_out", "sustained", "one_shot"],
                        },
                      },
                      required: ["type", "intensity"],
                    },
                  },
                  aiRationale: { type: "string" },
                },
                required: ["id", "source", "intendedRole", "emotionalBeat", "aiRationale"],
              },
            },
            styleNotes: { type: "string" },
          },
          required: ["version", "emotionalArc", "shots"],
        } as Record<string, unknown>,
        maxTokens: 4096,
      });

      if (result.schemaValid) {
        skeleton = result.data;
        provider = result.provider;
        model = result.model;
      }
    } catch (err) {
      console.error("[generate-edl] AI creative pass failed:", (err as Error).message);
    }

    // === PASS 2 — Deterministic timing/effect mapping
    let edl: any;
    let generationMode: "ai_director" | "fast_planner";

    if (skeleton) {
      try {
        edl = alignToOnsets({
          skeleton,
          footage: analysis.footage,
          music: analysis.music,
          intent: { prompt, intentId: intentId ?? "unknown", analysisId },
        });
        generationMode = "ai_director";
      } catch (err) {
        console.error(
          "[generate-edl] alignment failed, using AI skeleton with fast_planner timing:",
          (err as Error).message
        );
        // Use fast planner for timing but preserve AI skeleton's effects and structure
        const fastEdl = fastPlanner.generate({
          intent,
          footage: analysis.footage,
          music: analysis.music,
          intentId: intentId ?? "unknown",
          analysisId,
          prompt,
          referenceStyle,
          ...(intensity !== undefined ? { intensity } : {}),
          ...(tempoMode ? { tempoMode } : {}),
          ...(styleDNA ? { styleDNA } : {}),
        });
        // Merge: use fast planner's timing but AI skeleton's effects where available
        edl = {
          ...fastEdl,
          shots: fastEdl.shots.map((fastShot: any, i: number) => {
            const aiShot = skeleton.shots?.[i];
            let mergedEffects = fastShot.effects;
            if (aiShot?.effectIntents?.length) {
              // Map AI abstract intents to concrete effects via effectMapper
              mergedEffects = [];
              for (const intent of aiShot.effectIntents) {
                try {
                  const mapped = effectMapper.toEffects({
                    intent: { type: intent.type, intensity: intent.intensity || 0.6, trigger: intent.trigger || "sustained" },
                    shotStartTime: fastShot.timing?.startTime ?? 0,
                    shotDuration: fastShot.timing?.duration ?? 1,
                    shotMotionLevel: "medium",
                    shotColors: [],
                    beatLockOnsetTime: fastShot.timing?.startTime ?? null,
                  });
                  mergedEffects.push(...mapped);
                } catch {}
              }
              if (mergedEffects.length === 0) mergedEffects = fastShot.effects;
            }
            return {
              ...fastShot,
              effects: mergedEffects,
              aiRationale: aiShot?.aiRationale || fastShot.aiRationale,
              meta: { ...fastShot.meta, ...(aiShot ? { intendedRole: aiShot.intendedRole, emotionalBeat: aiShot.emotionalBeat } : {}) },
            };
          }),
        };
        generationMode = "ai_director";
        console.log("[generate-edl] merged AI skeleton with fast_planner timing:", { shots: edl.shots?.length ?? 0 });
      }
    } else {
      edl = fastPlanner.generate({
        intent,
        footage: analysis.footage,
        music: analysis.music,
        intentId: intentId ?? "unknown",
        analysisId,
        prompt,
        referenceStyle,
        ...(intensity !== undefined ? { intensity } : {}),
        ...(tempoMode ? { tempoMode } : {}),
        ...(styleDNA ? { styleDNA } : {}),
      });
      generationMode = "fast_planner";
    }

    // [DEBUG-ROOTCAUSE] Stage 1: Raw server EDL before scoring
    const rawShotCount = edl.shots?.length ?? 0;
    const rawAssetKeys = Object.keys(edl.assets?.media ?? {});
    const rawTrackClips = edl.timeline?.tracks?.flatMap((t: any) => t.clips ?? []).length ?? 0;
    const rawDuration = edl.timeline?.duration ?? 0;
    console.log("[DEBUG-ROOTCAUSE] STAGE1_RAW_SERVER_EDL", JSON.stringify({
      shotCount: rawShotCount,
      assetKeys: rawAssetKeys.length,
      trackClips: rawTrackClips,
      duration: rawDuration,
      generationMode,
      hasTimelineTracks: !!edl.timeline?.tracks,
      hasAssetsMedia: !!edl.assets?.media,
      sampleShots: (edl.shots ?? []).slice(0, 3).map((s: any) => ({
        id: s.id,
        clipId: s.source?.clipId,
        startTime: s.timing?.startTime,
        duration: s.timing?.duration,
      })),
    }));

    // Apply reference style enhancement if available
    if (referenceStyle && referenceMode) {
      try {
        const directives = compileReferenceStyleToDirectives(referenceStyle, referenceMode);
        edl = enhanceEDLWithStyleDirectives(edl, directives);
        console.log("[DEBUG-ROOTCAUSE] REFERENCE_STYLE_APPLIED", JSON.stringify({
          mode: referenceMode,
          shotCount: edl.shots?.length ?? 0,
          strictStyleShots: edl.shots?.filter((s: any) => s.meta?.styleMode === "strict_replication").length ?? 0,
        }));
      } catch (e) {
        console.warn("[generate-edl] Reference style enhancement failed:", (e as Error).message);
      }
    }

    // Duration invariant: clamp shots to timeline duration
    const timelineDuration = edl.timeline?.duration ?? 30;
    if (edl.shots && edl.shots.length > 0) {
      const maxEnd = Math.max(...edl.shots.map((s: any) => (s.timing?.startTime ?? 0) + (s.timing?.duration ?? 0)));
      if (maxEnd > timelineDuration + 0.01) {
        console.log(`[generate-edl] Duration invariant: clamping ${maxEnd.toFixed(2)}s to ${timelineDuration}s`);
        // Trim shots that extend past timeline
        edl.shots = edl.shots.filter((s: any) => (s.timing?.startTime ?? 0) < timelineDuration);
        // Trim last shot if it extends past
        const lastShot = edl.shots[edl.shots.length - 1];
        if (lastShot) {
          const shotEnd = (lastShot.timing?.startTime ?? 0) + (lastShot.timing?.duration ?? 0);
          if (shotEnd > timelineDuration) {
            lastShot.timing.duration = timelineDuration - (lastShot.timing?.startTime ?? 0);
          }
        }
      }
    }

    // Section fidelity enforcement for setup_to_montage (legacy path)
    if (referenceStyle?.intentMapping?.structure === 'setup_to_montage' && edl.shots?.length > 0) {
      const climaxPosition = referenceStyle.pacing?.climaxPosition ?? 0.5;
      const timelineDuration = edl.timeline?.duration ?? 30;
      const climaxTs = climaxPosition * timelineDuration;
      let preFx = 0, postFx = 0, preN = 0, postN = 0;
      for (const shot of edl.shots) {
        const isPre = (shot.timing?.startTime ?? 0) < climaxTs;
        if (isPre) {
          preN++;
          if (shot.effects && shot.effects.length > 1) {
            const heavy = ['impact_flash', 'speed_ramp', 'color_pulse', 'context_shake'];
            shot.effects = shot.effects.filter((e: any) => !heavy.includes(e.type)).slice(0, 1);
          }
          preFx += (shot.effects?.length ?? 0);
        } else {
          postN++;
          if (shot.effects && shot.effects.length < 2) {
            const hasSpeed = shot.effects?.some((e: any) => e.type === 'speed_ramp');
            const hasFlash = shot.effects?.some((e: any) => e.type === 'impact_flash' || e.type === 'flash_white');
            if (!hasSpeed) { shot.effects = shot.effects || []; shot.effects.push({ id: `fx_${shot.id}_sr`, type: 'speed_ramp', intensity: 0.6, params: { entrySpeed: 1, exitSpeed: 1, anchorSpeed: 0.5 } }); }
            if (!hasFlash && Math.random() < 0.4) { shot.effects = shot.effects || []; shot.effects.push({ id: `fx_${shot.id}_fl`, type: 'impact_flash', intensity: 0.7, params: { peakBrightness: 0.9, flashFrameCount: 2 } }); }
          }
          postFx += (shot.effects?.length ?? 0);
        }
      }
      console.log(`[generate-edl] Section fidelity (legacy): pre ${preN}/${preFx}, post ${postN}/${postFx}`);
    }

    // Score
    const musicForScore = analysis.music ?? { sourceId: "", duration: edl.timeline?.duration ?? 30, bpm: 120, beatGrid: [] };
    const scores = scoreNewPipelineEDL(edl, musicForScore as any);

    // Store EDL
    const edlId = crypto.randomUUID();
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            edlId,
            projectId,
            JSON.stringify(edl),
            scores.beatSyncScore,
            scores.pacingVariance,
            scores.overallConfidence,
            generationMode === "fast_planner" ? 1 : 0,
            prompt,
            Date.now()
          )
          .run();
      } catch (e) {
        console.warn("[generate-edl] D1 insert failed:", (e as Error).message);
      }
    }

    // Generate audio intelligence (ducking envelope, best segment)
    const audioIntelligence: Record<string, unknown> = {};

    if (analysis.music?.speechSegments?.length > 0) {
      const duckingEnvelope = generateDuckingEnvelope(
        analysis.music.speechSegments,
        edl.timeline?.duration ?? 30,
        0.22
      );
      audioIntelligence.duckingEnvelope = duckingEnvelope;
      audioIntelligence.duckingFilter = duckingEnvelopeToFFmpegFilter(duckingEnvelope);
      audioIntelligence.hasDucking = true;
    } else {
      audioIntelligence.hasDucking = false;
    }

    if (analysis.music?.bestSegment) {
      audioIntelligence.bestSegment = analysis.music.bestSegment;
    }

    audioIntelligence.bpm = analysis.music?.bpm ?? 120;
    audioIntelligence.beatGridLength = (edl.music?.beatGrid ?? []).length;

    // HARD GUARD: Never return success with empty EDL
    const finalShotCount = edl.shots?.length ?? 0;
    const finalDuration = edl.timeline?.duration ?? 0;

    if (finalShotCount === 0) {
      console.error("[generate-edl] EMPTY_EDL_GUARD: Generated EDL has 0 shots", JSON.stringify({
        generationMode,
        analysisId,
        referenceStyleId: !!referenceStyle,
        referenceMode,
        intentPacing: intent?.style?.pacing,
      }));
      return apiError(
        ApiErrorCode.EDLGenerationFailed,
        "Generated EDL has no shots. The planner could not produce valid shots from the provided footage and constraints.",
        500
      );
    }

    if (finalDuration <= 0) {
      console.error("[generate-edl] INVALID_DURATION_GUARD: EDL duration is", finalDuration);
      return apiError(
        ApiErrorCode.EDLGenerationFailed,
        "Generated EDL has invalid timeline duration.",
        500
      );
    }

    return jsonResponse({
      success: true,
      edlId,
      edl,
      scores,
      generationMode,
      provider,
      model,
      audioIntelligence,
    });
  } catch (error: any) {
    console.error("[generate-edl] Error:", error);
    return apiError(
      ApiErrorCode.EDLGenerationFailed,
      error.message || "EDL generation failed",
      500
    );
  }
}
