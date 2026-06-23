// POST /api/generate-edl - Generate edit timeline from intent + analysis
// Phase 4: The AI director creates the actual edit

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import type { MonetEDL } from "../types/edl";
import { EDL_JSON_SCHEMA } from "../types/edl";
import { EDL_JSON_SCHEMA_SLIM } from "../types/edl-slim";
import type { IntentExtractionResult } from "../types/intent";
import type { AnalysisResult } from "../types/analysis";
import type { ReferenceStyle } from "../types/reference-style";
import { normalizeReferenceStyle } from "../types/reference-style";
import { now } from "../types/env";
import { loadPromptTemplate } from "../prompts";
import { generateDeterministicEDL } from "../lib/deterministic-edl";
import { getConfiguredGeminiModel } from "../services/model-config";
import { getAnalysisResult } from "../lib/analysis-store";
import { getOpenReelCapabilityContract } from "../lib/openreel-capabilities";
import { validateAndNormalizeAdvancedEDL } from "../lib/validate-advanced-edl";
import { validateEDL } from "../lib/edl-validator";
import { getAISystemEditingInstruction } from "../lib/engine-capabilities";
import { enforceReferenceStyleOnEDL } from "../lib/reference-style-enforcer";
import { createIntentFromPrompt, getIntentById, getCachedIntentByPrompt } from "../services/intent-service";
import { enrichEdlWithAI } from "../services/edl-ai-enrichment";
import { normalizeIntent, isRecord } from "../lib/intent-normalization";
import type { NormalizedIntent } from "../lib/intent-normalization";
import { compileReferenceStyleToDirectives } from "../director/style-directives";
import { enhanceEDLWithStyleDirectives } from "../director/enhance-edl-with-style";
import { validateCreativeDensity } from "../director/creative-density";
import { normalizeInputs, type ClipMetadata } from "../../lib/input-normalization";
import { compileTraceToStyleSlots } from "../director/reference-edit-trace";
import { buildReferenceDirectorSection } from "../director/reference-director";
import type { ReferenceEditTrace, StyleSlot } from "../director/reference-edit-trace";
import { compareReferenceTraceToEDL } from "../director/reference-similarity";
import type { ReferenceSimilarityReport } from "../director/reference-similarity";
import { critiqueAndRefine } from "../services/edl-critique-service";
import { inferMusicStructure } from "../services/music-structure-service";
import { withRetry } from "../lib/retry";
import { getEnginesForTier } from "../../lib/engines/registry";
import { routeEDL, summarizeRouting } from "../../lib/engines/router";

const GENERATE_TIMEOUT_MS = 120000;

function buildStyleDNABrief(dna: any): string {
  if (!dna) return "(no compiled style provided)";

  const grade = dna.grade ?? {};
  const timing = dna.timing ?? {};
  const editorial = dna.editorial ?? {};
  const camera = dna.camera ?? {};
  const audio = dna.audioReactivity ?? {};
  const text = dna.graphics?.text ?? {};

  const globalEffects = (dna.globalEffects?.effects ?? [])
    .map((e: any) => {
      const trigger = e.triggerOnAudio?.on ?? "shot_continuous";
      return `  - ${e.type} | params: ${JSON.stringify(e.params)} | trigger: ${trigger}`;
    })
    .join("\n") || "  (none)";

  const heroEffects = (dna.heroEffects?.effects ?? [])
    .map((e: any) => `  - ${e.type} | params: ${JSON.stringify(e.params)}`)
    .join("\n") || "  (none)";

  return [
    "## COMPILED STYLE DNA",
    `Name: ${dna.name}`,
    `Category: ${dna.category}`,
    `Source influences: ${(dna.sourceInfluences ?? []).join(", ")}`,
    `Confidence: ${dna.confidence}`,
    "",
    "### EDITORIAL CONTRACT — you MUST follow these:",
    `- Average shot duration: ${editorial.avgShotDurationSec ?? 2.0}s`,
    `- Shot duration variance: ${editorial.shotDurationVariance ?? 0.4} (higher = more dynamic)`,
    `- Preferred shot durations to choose from: ${(editorial.preferredDurations ?? [1, 2, 4]).join(", ")} seconds`,
    `- Cut style: ${editorial.cutStyle ?? "hard_cut"}`,
    `- Cut alignment: ${editorial.cutAlignment ?? "on_beat"} (snap shot.timing.startTime to nearest beat in music.beatGrid)`,
    `- Closeup bias: ${editorial.closeupBias ?? 0.5} (0=all wide, 1=all closeup)`,
    `- Wide shot bias: ${editorial.wideShotBias ?? 0.3}`,
    `- Pacing curve: ${editorial.pacingCurve ?? "rising"}`,
    `- Use montage: ${editorial.useMontage ?? false}`,
    `- Use jump cuts: ${editorial.useJumpCuts ?? false}`,
    `- Hero transition type: ${editorial.heroTransition?.type ?? "cut"}`,
    "",
    "### TIMING FEEL",
    `- Frame rate feel: ${JSON.stringify(timing.frameRateFeel ?? { type: "normal", fps: 30 })}`,
    `- Tempo: ${timing.tempo ?? "moderate"}`,
    `- Speed ramp style: ${timing.speedRampStyle ?? "none"}`,
    "",
    "### COLOR + GRADE TARGETS",
    `- Saturation: ${grade.saturation ?? 1.0}, Contrast: ${grade.contrast ?? 1.0}`,
    `- Temperature: ${grade.temperature ?? 0}, Tint: ${grade.tint ?? 0}`,
    `- Grain intensity: ${grade.grain?.intensity ?? 0}`,
    `- Vignette amount: ${grade.vignette?.amount ?? 0}`,
    `- Chromatic aberration intensity: ${grade.chromaticAberration?.intensity ?? 0}`,
    `- Bloom intensity: ${grade.bloom?.intensity ?? 0}`,
    "",
    "### CAMERA ENERGY",
    `- Energy: ${camera.energy ?? "steady"}`,
    `- Base movement: ${camera.movement?.baseMovement ?? "none"}`,
    `- Movement amplitude: ${camera.movement?.amplitude ?? 0}`,
    "",
    "### EFFECT VOCABULARY — use ONLY these effects in shot.effects arrays:",
    "",
    "Global effects (recurring throughout edit):",
    globalEffects,
    "",
    "Hero effects (apply ONLY on shots tagged styleTags: ['hero_moment']):",
    heroEffects,
    "",
    "### AUDIO REACTIVITY",
    audio.enabled
      ? [
          `- Enabled: yes`,
          `- Beat cut probability: ${audio.onBeat?.cutProbability ?? 0} (chance of placing a cut on each beat)`,
          `- Beat trigger effect: ${audio.onBeat?.triggerEffect ?? "none"} (attach this effect to shots starting on beats)`,
          `- Drop trigger effect: ${audio.onDrop?.triggerEffect ?? "none"} (attach to shot at first drop moment)`,
          `- Sensitivity: ${audio.sensitivity ?? 1.0}`,
        ].join("\n")
      : "- Disabled (cut on narrative beats, not music)",
    "",
    "### TEXT/CAPTION GUIDANCE (if you emit captions)",
    `- Font family: ${text.fontFamily ?? "context_aware"}`,
    `- Size feel: ${text.sizeFeel ?? "medium"}`,
    `- Animation entry: ${text.animation?.entryAnimation ?? "fade_in"}`,
    `- Placement: ${text.placement ?? "lower_third"}`,
    "",
    "### YOUR JOB AS DIRECTOR",
    "1. Generate the number of shots needed to fill INTENT.structure.duration at the editorial.avgShotDurationSec pace",
    "2. Vary shot durations using editorial.preferredDurations — do not make every shot the same length",
    "3. Snap shot.timing.startTime values to nearest beat in ANALYSIS.music.beatGrid (within 50ms)",
    "4. Tag exactly DIRECTOR_PARAMS.heroMomentCount shots with styleTags: ['hero_moment']",
    "5. On hero_moment shots: attach the HERO effects listed above",
    "6. On non-hero shots: attach global effects according to their trigger context (beat, drop, continuous)",
    "7. Effect intensity should match the style — don't water it down",
    "8. Effect duration on hero shots: 0.15-0.4s for impact effects, full shot duration for grade effects",
  ].join("\n");
}

interface GenerateEDLRequest {
  projectId?: string;
  threadId?: string; // threadId and projectId are treated interchangeably in this context
  intentId?: string;
  analysisId?: string;
  prompt?: string;
  clipIds?: string[];
  footageIds?: string[];
  referenceStyle?: ReferenceStyle;
  referenceTrace?: ReferenceEditTrace;
  referenceMode?: "strict_replication" | "inspired";
  style?: string;
  durationSeconds?: number;
  styleDNA?: any;
}

interface GenerateEDLResponse {
  success: boolean;
  edlId?: string;
  edl?: MonetEDL;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  intentId?: string;
  usedFallback?: boolean;
  error?: string;
  referenceSimilarity?: ReferenceSimilarityReport;
}



/**
 * Generate complete edit timeline from intent + analysis
 *
 * Flow:
 * 1. Fetch intent and analysis from D1
 * 2. Build prompt with all context
 * 3. Call Gemini with EDL generation prompt
 * 4. Score the generated EDL
 * 5. Store EDL in D1
 * 6. Return EDL + scores
 */
export async function handleGenerateEDL(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return jsonResponse({ success: false, error: "Empty request body" }, 400);
    }
    const body: GenerateEDLRequest = JSON.parse(rawBody);

    const projectId = body.projectId || body.threadId;
    const intentId = body.intentId;
    const analysisId = body.analysisId;
    const prompt = body.prompt;
    const clipIds = body.clipIds || body.footageIds || [];

    // Validate input - must have either intentId or prompt to resolve intent
    if (!projectId || (!intentId && !prompt)) {
      return jsonResponse(
        { success: false, error: "Missing required fields: projectId and (intentId or prompt)" },
        400
      );
    }

    // Must have analysisId or clipIds to generate EDL
    if (!analysisId && clipIds.length === 0) {
      return jsonResponse(
        { success: false, error: "Missing analysis context: analysisId or clipIds required" },
        400
      );
    }

    // Resolve intent (with fallback)
    let intent: any = null;
    let resolvedIntentId = intentId;

    if (intentId) {
      intent = await fetchIntent(intentId, env);
    }

    if (!intent && prompt) {
      console.log("[generate-edl] Intent missing or stale, attempting prompt resolution", {
        intentId,
        prompt: prompt.slice(0, 50),
      });

      try {
        const resolved = await resolveIntentFromService({
          env,
          intentId,
          prompt,
          threadId: projectId,
          style: body.style,
          durationSeconds: body.durationSeconds,
        });
        intent = { intent: resolved.intent, confidence: 1.0, reasoning: "Resolved from prompt fallback" };
        resolvedIntentId = resolved.id;
      } catch (err) {
        console.error("[generate-edl] Intent resolution failed", err);
      }
    }

    if (!intent) {
      return jsonResponse(
        { success: false, error: "Intent not found and could not be resolved from prompt" },
        404
      );
    }

    // Fetch analysis from D1 (or mock for dev)
    // If analysisId is missing but clipIds are provided, we might need a dynamic analysis step,
    // but for now we expect analysisId to be present or in-memory.
    let analysis = analysisId ? await fetchAnalysis(analysisId, env) : null;
    
    if (!analysis && clipIds.length > 0) {
       // Try to find analysis by any of the clipIds as a fallback
       // (Simplified for MVP)
       console.warn("[generate-edl] AnalysisId missing, but clipIds provided. Fallback not fully implemented.");
    }

    if (!analysis) {
      return jsonResponse(
        { success: false, error: "Analysis not found" },
        404
      );
    }

    const normalizedReferenceStyle = body.referenceStyle
      ? normalizeReferenceStyle(body.referenceStyle)
      : undefined;

    // Generate EDL (LLM-enhanced with deterministic fallback)
    const ai = getAIService(env);
    const aiModel = getConfiguredGeminiModel(env);
    let edl: MonetEDL;
    let usedFallback = false;

    const userTier = (request.headers.get("X-User-Tier") as any) ?? "free";
    const availableEngines = getEnginesForTier(userTier);

    const engineRoster = availableEngines.map(e => `
- ${e.displayName} (id: ${e.id}, tier: ${e.tier}, cost: ${e.cost}, quality: ${e.qualityBonus})
  ${e.description}
  Handles: ${Array.from(e.supports).join(", ")}
  Best for: ${Array.from(e.preferredFor).join(", ")}
  ${e.maxShotsPerEdit ? `Cap: ${e.maxShotsPerEdit} shots/edit` : ""}
`).join("\n");

    const rawIntent = isRecord(intent) ? intent.intent ?? intent : intent;

    // ===== GUARD: ensure intent has the structure normalizeIntent expects =====
    if (!rawIntent || typeof rawIntent !== "object") {
      throw new Error(`Intent is malformed: ${typeof rawIntent}`);
    }

    const safeIntent: any = {
      goal: { primary: "Edit", ...(rawIntent as any).goal },
      style: { pacing: "medium", mood: [], ...(rawIntent as any).style },
      structure: { duration: 30, energyCurve: [], ...(rawIntent as any).structure },
      technical: {
        syncToBeat: true, beatSyncStrength: 0.7, transitionStyle: "cut",
        colorTreatment: "vibrant", effectsIntensity: 0.5,
        ...(rawIntent as any).technical,
      },
      contentPreferences: {
        focusOn: [], ...(rawIntent as any).contentPreferences,
      },
      pillarWeights: (rawIntent as any).pillarWeights,
      directorParams: (rawIntent as any).directorParams,
    };

    const normalizedIntent = normalizeIntent({
      rawIntent: safeIntent,                            // ← use safeIntent
      prompt,
      requestedDurationSeconds: body.durationSeconds,
      analysis,
    });

    // ===== GUARD: analysis.footage might be undefined =====
    const footageArray = Array.isArray(analysis?.footage) ? analysis.footage : [];
    if (footageArray.length === 0) {
      console.warn("[generate-edl] analysis has no footage segments");
    }

    const compactFootage = footageArray.map((f: any) => ({
      clipId: f?.clipId ?? "unknown",
      duration: f?.duration ?? 0,
      width: f?.width ?? 0,
      height: f?.height ?? 0,
      fps: f?.fps ?? 30,
      rotation: f?.rotation ?? 0,
      segments: Array.isArray(f?.segments)
        ? [...f.segments]
            .sort((a: any, b: any) => (b?.scores?.overall ?? 0) - (a?.scores?.overall ?? 0))
            .slice(0, 8)
            .map((s: any) => ({
              start: s?.start ?? 0,
              end: s?.end ?? 0,
              duration: s?.duration ?? 0,
              tags: Array.isArray(s?.tags) ? s.tags.slice(0, 5) : [],
              score: s?.scores?.overall ?? 0,
              description: typeof s?.description === "string"
                ? s.description.slice(0, 80)
                : "",
            }))
        : [],
    }));

    // ===== INPUT NORMALIZATION =====
    // Determine optimal output resolution and FPS from actual clip metadata
    const clipMetadataForNorm: ClipMetadata[] = compactFootage
      .filter((f: any) => f.width > 0 && f.height > 0)
      .map((f: any) => ({
        clipId: f.clipId,
        width: f.width,
        height: f.height,
        fps: f.fps || 30,
        duration: f.duration,
        rotation: f.rotation || 0,
      }));

    const normalization = clipMetadataForNorm.length > 0
      ? normalizeInputs(clipMetadataForNorm, { tier: userTier })
      : null;

    const outputWidth = normalization?.resolution.width ?? 1920;
    const outputHeight = normalization?.resolution.height ?? 1080;
    const outputFps = normalization?.fps ?? 30;

    if (normalization) {
      console.log("[generate-edl] input normalization:", normalization.summary);
    }

    // CRITICAL: only "footage" type clips are editable.
    // Reference videos are for style analysis only — must NEVER enter the EDL.
    const availableClipIds = compactFootage
      .filter((f: any) => {
        // analysis.footage entries are already pre-filtered, but enforce strictness
        const type = f?.type ?? "footage";
        return type === "footage";
      })
      .map((f: any) => f.clipId)
      .filter(Boolean);

    if (availableClipIds.length === 0) {
      throw new Error(
        "No valid footage clips available — reference and music files cannot be used as source footage."
      );
    }

    console.log("[generate-edl] available footage clipIds:", availableClipIds);

    // ===== GUARD: music structure with defaults =====
    const musicStructure = analysis?.music
      ? inferMusicStructure({
          bpm: analysis.music.bpm ?? 120,
          beats: Array.isArray(analysis.music.beatGrid) ? analysis.music.beatGrid : [],
          energyCurve: Array.isArray((analysis.music as any).energyCurve)
            ? (analysis.music as any).energyCurve
            : Array.isArray(analysis.music.characteristics?.energy)
            ? (analysis.music.characteristics.energy as any)
            : [],
          duration: (analysis.music.duration ?? 30) * 1000,
        })
      : null;

    let critiqueResult: any = null;

    try {
      // Build the v3 prompt
      const styleVocab = loadPromptTemplate("style-vocabulary.txt");
      const v3Template = loadPromptTemplate("generate-edl-v3.txt");
      const fullPrompt = v3Template
        .replace("{{STYLE_VOCABULARY}}", styleVocab ?? "")
        .replace("{{INTENT}}", JSON.stringify(safeIntent ?? {}))
        .replace("{{PILLAR_WEIGHTS}}", JSON.stringify(
          (intent as any)?.pillarWeights ?? {
            brutalistImpact: 0.5, tensionPivot: 0.2,
            vocalFlowSync: 0.1, legacyMontage: 0.2,
          }
        ))
        .replace("{{DIRECTOR_PARAMS}}", JSON.stringify(
          (intent as any)?.directorParams ?? {
            climaxPosition: 0.65, restraintLevel: "moderate",
            heroMomentCount: 2, crossClipBias: 0.6, effectBudget: 25,
          }
        ))
        .replace("{{EDIT_INTENSITY}}", String(
          (body as any)?.intensity ?? (intent as any)?.intensity ?? 0.5
        ))
        .replace("{{ANALYSIS}}", JSON.stringify(analysis ?? {}))
        .replace("{{MUSIC_STRUCTURE}}", JSON.stringify(musicStructure ?? null))
        .replace("{{REFERENCE_STYLE}}", JSON.stringify(normalizedReferenceStyle ?? null))
        .replace("{{AVAILABLE_CLIPS}}", JSON.stringify(availableClipIds ?? []))
        .replace("{{ENGINE_ROSTER}}", engineRoster)
        .replace("{{STYLE_DNA_BRIEF}}", buildStyleDNABrief(body.styleDNA))
        .replace("{{LEARNED_PRIORS}}", "");  // ← in case you reference this placeholder

      // First-pass draft
      let draftEdl = await withRetry(() =>
        ai.generateContentJSON<any>({
          prompt: fullPrompt,
          systemInstruction:
            "You are Monet's edit director. Generate a complete JSON MonetEDL.",
          stage: "edl_generation",
          temperature: 0.85,
          schema: EDL_JSON_SCHEMA,
        }),
      );

      // ===== GUARD 1: Ensure draft has shots array =====
      if (!draftEdl || !Array.isArray(draftEdl.shots)) {
        console.error("[generate-edl] LLM returned EDL without shots array", {
          keys: draftEdl ? Object.keys(draftEdl) : "null",
          raw: JSON.stringify(draftEdl).slice(0, 500),
        });
        throw new Error("Director returned malformed EDL — missing shots array");
      }

      console.log("[generate-edl] draft generated", {
        shotCount: draftEdl.shots.length,
        hasMusic: !!draftEdl.music,
        hasGlobalEffects: !!draftEdl.globalEffects,
      });

      // ===== GPT SHOT COUNT GUARD: retry if too few shots =====
      const pacing = (safeIntent.style?.pacing ?? "medium") as string;
      const duration = safeIntent.structure?.duration ?? 30;
      const pacingMinShots: Record<string, number> = { aggressive: 18, fast: 12, medium: 8, slow: 5 };
      const baseMin = pacingMinShots[pacing] ?? 8;
      const targetShotCount = Math.max(baseMin, Math.floor(duration / 2));

      if (draftEdl.shots.length < targetShotCount) {
        console.warn(`[generate-edl] LLM only produced ${draftEdl.shots.length} shots, need ${targetShotCount} — retrying with hotter temp`);

        try {
          const retryPrompt = fullPrompt +
            `\n\n# PREVIOUS ATTEMPT INSUFFICIENT\nYou only generated ${draftEdl.shots.length} shots but the minimum is ${targetShotCount}. Generate ${targetShotCount}+ shots this time. Cut more aggressively. Every shot needs at least 2 effects.`;

          const retryEdl = await withRetry(() =>
            ai.generateContentJSON<any>({
              prompt: retryPrompt,
              systemInstruction:
                "You are Monet's edit director. Generate a complete JSON MonetEDL with MORE shots than before. Be aggressive with cut count.",
              stage: "edl_generation",
              temperature: 0.95,
              schema: EDL_JSON_SCHEMA,
            }),
          );

          if (retryEdl?.shots?.length > draftEdl.shots.length) {
            draftEdl = retryEdl;
            console.log(`[generate-edl] retry succeeded with ${retryEdl.shots.length} shots`);
          }
        } catch (retryErr: any) {
          console.warn("[generate-edl] shot count retry failed, keeping original draft", {
            error: retryErr.message,
          });
        }
      }

      // ===== Critique pass — with bulletproofing =====
      let finalEdl = draftEdl;
      try {
        const fullIntent: IntentExtractionResult = {
          intent: intent.intent || intent,
          pillarWeights: intent.pillarWeights || { brutalistImpact: 0.5, tensionPivot: 0.2, vocalFlowSync: 0.1, legacyMontage: 0.2 },
          directorParams: intent.directorParams || { climaxPosition: 0.65, restraintLevel: "moderate", heroMomentCount: 2, crossClipBias: 0.6, effectBudget: 25 },
          confidence: intent.confidence ?? 0.8,
          clarifyingQuestions: [],
          reasoning: intent.reasoning || "",
        };

        const { refined, critique } = await critiqueAndRefine(
          env,
          draftEdl,
          fullIntent,
          musicStructure,
        );

        // ===== GUARD 2: Critique response sanitization =====
        const safePatches = Array.isArray(critique?.patches) ? critique.patches : [];
        const safeIssues = Array.isArray(critique?.issues) ? critique.issues : [];

        // ===== GUARD 3: Only use refined if it has shots =====
        if (refined && Array.isArray(refined.shots) && refined.shots.length > 0) {
          finalEdl = refined;
        } else {
          console.warn("[generate-edl] critique refinement produced invalid EDL, keeping draft");
          finalEdl = draftEdl;
        }

        critiqueResult = {
          score: critique?.score ?? 0,
          verdict: critique?.verdict ?? "no critique returned",
          patchCount: safePatches.length,
          criticalIssues: safeIssues.filter((i: any) => i?.severity === "critical").length,
        };

        console.log("[generate-edl] critique complete", critiqueResult);
      } catch (e: any) {
        console.warn("[generate-edl] critique pass failed, shipping draft", {
          error: e.message,
          stack: e.stack?.split("\n").slice(0, 5).join("\n"),
        });
        // finalEdl stays = draftEdl
      }

      edl = finalEdl;

      // ===== POST-PROCESSING: Clip diversity + effect diversity =====
      edl = enforceClipDiversity(edl);
      edl = enforceEffectDiversity(edl);

      // ===== 7. FINAL SAFETY NET =====
      if (!Array.isArray(edl.shots)) edl.shots = [];
      if (!edl.timeline) {
        edl.timeline = {
          duration: safeIntent.structure.duration,
          resolution: { width: outputWidth, height: outputHeight },
          fps: outputFps,
        };
      } else {
        // Patch missing sub-fields
        if (!edl.timeline.resolution) {
          edl.timeline.resolution = { width: outputWidth, height: outputHeight };
        }
        if (!edl.timeline.fps) edl.timeline.fps = outputFps;
        if (typeof edl.timeline.duration !== "number") {
          edl.timeline.duration = safeIntent.structure.duration;
        }
      }

      // Add metadata
      edl.metadata = {
        title: `Edit for ${projectId}`,
        createdAt: Date.now(),
        aiModel,
        prompt: normalizedIntent.prompt,
        intentId: resolvedIntentId || "unknown",
        analysisId: body.analysisId || "unknown",
      };

      // Set global edit intensity (0-1 slider)
      edl.intensity = Math.max(0, Math.min(1,
        (body as any)?.intensity ?? (intent as any)?.intensity ?? 0.5
      ));

      if (normalizedReferenceStyle) {
        edl = enforceReferenceStyleOnEDL(
          edl,
          normalizedReferenceStyle,
          body.referenceMode ?? "strict_replication"
        );
      }
    } catch (error) {
      console.error("LLM EDL generation failed, using deterministic fallback:", error);

      // FALLBACK: Deterministic EDL (no LLM dependency)
      edl = generateDeterministicEDL({
        intent: normalizedIntent,
        analysis: analysis as AnalysisResult,
        intentId: resolvedIntentId!,
        analysisId: body.analysisId || "unknown",
        projectId: projectId,
        prompt: normalizedIntent.prompt,
        durationSeconds: body.durationSeconds,
      });

      if (normalizedReferenceStyle) {
        edl = enforceReferenceStyleOnEDL(
          edl,
          normalizedReferenceStyle,
          body.referenceMode ?? "strict_replication"
        );
      }

      usedFallback = true;
    }

    // Score the EDL
    edl = ensureBeatLocksForMusic(edl);

    // ===== AI Enrichment specialist passes =====
    const { edl: enrichedEdl, enrichmentSummary } = await enrichEdlWithAI(edl, env, {
      tier: userTier,
      clipUrlResolver: (clipId) => `${env.MONET_API_URL || "http://localhost:3000"}/api/media/${clipId}`,
    });
    edl = enrichedEdl;
    console.log("[generate-edl] AI enrichment completed", enrichmentSummary);

    // --- DIRECTOR QUALITY PASS ---
    const styleMode =
      body?.referenceMode === "strict_replication" ? "strict_replication" : "inspired";
    
    const styleDirectives = compileReferenceStyleToDirectives(
      body?.referenceStyle,
      styleMode
    );
    
    edl = enhanceEDLWithStyleDirectives(edl, styleDirectives);
    
    const creativeDensity = validateCreativeDensity(edl, styleDirectives);
    
    console.log("[generate-edl] director quality pass", {
      styleDirectives,
      creativeDensity,
    });

    if (!creativeDensity.passed) {
      console.warn("[generate-edl] Creative density failed after enhancement", creativeDensity);
    }
    // -----------------------------

    const scores = scoreEDL(edl, analysis, intent as IntentExtractionResult);
    
    let referenceSimilarity: ReferenceSimilarityReport | undefined;
    if (body.referenceTrace) {
      referenceSimilarity = compareReferenceTraceToEDL(body.referenceTrace, edl);
    }

    // Store EDL in D1 (if DB available)
    const edlId = env?.DB
      ? await storeEDL(env.DB, projectId, resolvedIntentId as string, body.analysisId || "unknown", edl, scores, aiModel)
      : `edl-${Date.now()}`;

    const routingResult = routeEDL(edl, { tier: userTier });
    const engineRouting = summarizeRouting(routingResult);

    // CRITICAL: ensure edl.timeline.duration matches the actual sum of shot durations
    // This prevents the renderer from freezing on the last frame past the real edit end
    if (Array.isArray(edl.shots) && edl.shots.length > 0) {
      const lastShot = edl.shots[edl.shots.length - 1];
      const actualEnd =
        (lastShot.timing?.startTime ?? 0) +
        (lastShot.timing?.duration ?? 0);

      const declaredDuration = edl.timeline?.duration ?? 0;

      if (Math.abs(actualEnd - declaredDuration) > 0.5) {
        console.warn("[generate-edl] timeline duration mismatch", {
          actualEnd,
          declaredDuration,
          fixingTo: actualEnd,
        });
        if (!edl.timeline) {
          edl.timeline = { duration: actualEnd, resolution: { width: outputWidth, height: outputHeight }, fps: outputFps };
        } else {
          edl.timeline.duration = actualEnd;
        }
      }
    }

    return jsonResponse({
      success: true,
      edlId,
      edl,
      scores,
      intentId: resolvedIntentId,
      usedFallback, // Tell user if we fell back to deterministic
      styleDirectives,
      musicStructure,
      critique: critiqueResult,
      creativeDensity: {
        featuresPerShot:
          (edl.shots || []).reduce(
            (sum: number, s: any) => sum + (s.effects?.length ?? 0),
            0,
          ) / Math.max(1, edl.shots?.length || 1),
      },
      referenceSimilarity,
      engineRouting,
    });
  } catch (error: any) {
    console.error("[generate-edl] FATAL", {
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
      phase: error.phase || "unknown",
    });
    return jsonResponse(
      {
        success: false,
        error: error.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      500
    );
  }
}

/**
 * Generate EDL using AI service — V2 (slimmed prompt, enforced clipIds)
 */
async function generateEDL(params: {
  env: Env;
  intent: NormalizedIntent;
  analysis: AnalysisResult;
  ai: ReturnType<typeof getAIService>;
  referenceStyle?: ReferenceStyle;
  referenceTrace?: ReferenceEditTrace;
  referenceMode: "strict_replication" | "inspired";
  analysisId?: string;
  clipIds: string[];
  threadId?: string;
  prompt: string;
  outputWidth?: number;
  outputHeight?: number;
  outputFps?: number;
}): Promise<MonetEDL> {
  const {
    env,
    intent,
    analysis,
    ai,
    referenceStyle,
    referenceTrace,
    referenceMode,
    analysisId,
    clipIds,
    threadId,
    prompt,
    outputWidth,
    outputHeight,
    outputFps,
  } = params;

  // Intent object has an ID field
  const intentId = (intent as any).id || "unknown";

  const targetDuration = intent.durationSeconds;
  const resolvedWidth = outputWidth ?? 1920;
  const resolvedHeight = outputHeight ?? 1080;
  const resolvedFps = outputFps ?? 30;

  // Load the V3 prompt template
  const promptTemplate = loadPromptTemplate("generate-edl-v3.txt");

  // ─── Build compact footage context (top 8 segments per clip) ───
  const compactFootage = (analysis.footage || []).map((f) => ({
    clipId: f.clipId,
    duration: f.duration,
    segments: Array.isArray(f.segments)
      ? [...f.segments]
          .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0))
          .slice(0, 8)
          .map((s) => ({
            start: s.start,
            end: s.end,
            duration: s.duration,
            tags: s.tags?.slice(0, 5), // Cap tags to reduce tokens
            score: s.scores?.overall,
            emotion: s.scores?.emotion,
            motion: s.scores?.motion,
            description: s.description?.slice(0, 80), // Truncate long descriptions
          }))
      : [],
  }));

  // ─── Build compact music context ───
  const compactMusic = analysis.music
    ? {
        musicId: analysis.music.musicId,
        duration: analysis.music.duration,
        bpm: analysis.music.bpm,
        beatGrid: analysis.music.beatGrid,
        energy: analysis.music.characteristics.energy,
        structure: (analysis.music as any).structure,
      }
    : null;

  // ─── Build reference constraints (5 numbers, not 2KB of prose) ───
  let referenceConstraints = "";
  let referenceDirectorSection = "";
  if (referenceStyle) {
    const rs = referenceStyle;
    const strict = referenceMode === "strict_replication";
    referenceConstraints = `
## REFERENCE STYLE CONSTRAINTS (${strict ? "STRICT — hard constraints" : "INSPIRED — soft targets"})
- Average shot duration: ${rs.rhythm.avgShotDuration.toFixed(2)}s (${strict ? "±15%" : "±30%"} tolerance)
- Cut alignment: ${rs.rhythm.cutAlignment} (${rs.rhythm.cutAlignment === "strict" ? "every cut within 50ms of beat" : "cuts near beats, ±200ms ok"})
- Climax at: ${Math.round(rs.pacing.climaxPosition * 100)}% of timeline
- Transitions: ${Math.round(rs.effects.transitionsBreakdown.cutPercentage * 100)}% cuts / ${Math.round(rs.effects.transitionsBreakdown.crossfadePercentage * 100)}% crossfades
- Color treatment: ${rs.intentMapping.colorTreatment}
- Effects frequency: ${Math.round(rs.effects.effectsFrequency * 100)}% of shots
- Editor philosophy: "${rs.editingPhilosophy.summary.slice(0, 120)}"
- Energy curve shape: ${rs.pacing.energyCurve.map((v) => v.toFixed(1)).join(",")}
`;
    // ─── Inject pillar scores from reference analysis ───
    if (referenceStyle.pillarScores) {
      const ps = referenceStyle.pillarScores;
      referenceConstraints += `
## DETECTED STYLE PILLARS (from reference analysis)
- Brutalist Impact: ${(ps.brutalistImpact * 100).toFixed(0)}%
- Tension-Pivot Narrative: ${(ps.tensionPivot * 100).toFixed(0)}%
- Vocal Flow Sync: ${(ps.vocalFlowSync * 100).toFixed(0)}%
- Legacy Montage: ${(ps.legacyMontage * 100).toFixed(0)}%
Apply techniques from active pillars (>30%) proportionally.
`;
    }

    referenceDirectorSection = buildReferenceDirectorSection(
      referenceStyle,
      referenceMode,
      targetDuration
    );
  }

  let styleSlotsSection = "";
  if (referenceTrace) {
    const slots = compileTraceToStyleSlots(referenceTrace, targetDuration);
    styleSlotsSection = `
## TARGET EDIT TIMELINE (STYLE SLOTS)
You must follow this exact event sequence to mirror the reference structure.

${JSON.stringify(slots, null, 2)}
`;
  }

  // ─── Assemble the generation prompt using template variables ───
  const availableClipIds = compactFootage.map((f) => f.clipId);

  // Load the full style vocabulary
  const styleVocabulary = loadPromptTemplate("style-vocabulary.txt");

  const intentContext = {
    pacing: intent.style.pacing,
    mood: intent.style.mood,
    goal: intent.goal.primary,
    durationSeconds: targetDuration,
    pillarWeights: intent.pillarWeights || { brutalistImpact: 0, tensionPivot: 0, vocalFlowSync: 0, legacyMontage: 0 },
    directorParams: intent.directorParams || { climaxPosition: 0.65, restraintLevel: "moderate", heroMomentCount: 1, crossClipBias: 0.5 }
  };

  const analysisContext = {
    segments: compactFootage,
    music: compactMusic,
  };

  const clipsContext = availableClipIds;

  const referenceContext = referenceStyle ? {
    constraints: referenceConstraints,
    director: referenceDirectorSection,
    slots: styleSlotsSection
  } : "None";

  const generationPrompt = promptTemplate
    .replace("{{STYLE_VOCABULARY}}", styleVocabulary)
    .replace("{{INTENT}}", JSON.stringify(intentContext, null, 2))
    .replace("{{ANALYSIS}}", JSON.stringify(analysisContext, null, 2))
    .replace("{{REFERENCE}}", JSON.stringify(referenceContext, null, 2))
    .replace("{{CLIPS}}", JSON.stringify(clipsContext, null, 2));

  // Constrain by construction - dynamic schema mapping with enum of valid clipIds
  const dynamicSchema = {
    ...EDL_JSON_SCHEMA_SLIM,
    properties: {
      ...EDL_JSON_SCHEMA_SLIM.properties,
      shots: {
        ...EDL_JSON_SCHEMA_SLIM.properties.shots,
        items: {
          ...EDL_JSON_SCHEMA_SLIM.properties.shots.items,
          properties: {
            ...EDL_JSON_SCHEMA_SLIM.properties.shots.items.properties,
            source: {
              ...EDL_JSON_SCHEMA_SLIM.properties.shots.items.properties.source,
              properties: {
                ...EDL_JSON_SCHEMA_SLIM.properties.shots.items.properties.source.properties,
                clipId: {
                  type: "string",
                  enum: availableClipIds, // Physically constrains Gemini to only use these IDs!
                },
              },
            },
          },
        },
      },
    },
  };

  // ─── Call Gemini with constrained parameters & retry loop on validation failures ───
  const maxAttempts = 3;
  let lastErrorSummary: string | undefined;
  let edlData: Partial<MonetEDL> = {};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const correction = lastErrorSummary
      ? `\n\n# PREVIOUS ATTEMPT REJECTED\nYour last EDL failed validation:\n${lastErrorSummary}\nReturn a corrected EDL fixing ALL of these issues. Do not repeat the same mistakes.`
      : "";

    console.log(`[director] Attempt ${attempt}/${maxAttempts} - calling Gemini for EDL`);

    try {
      edlData = await withTimeout(
        ai.generateContentJSON<Partial<MonetEDL>>({
          prompt: generationPrompt + correction,
          systemInstruction: getAISystemEditingInstruction(),
          stage: "edl_generation",
          temperature: 0.75,
          schema: dynamicSchema,  // Constrained schema
        }),
        GENERATE_TIMEOUT_MS,
        "EDL generation timed out"
      );

      // Post-process: fix any remaining ID hallucination issues as a safety net
      remapHallucinatedIds(edlData, availableClipIds, analysis.music?.musicId);

      // Construct temporary EDL to run through Zod schema & validator
      const tempEdl = { ...edlData };
      if (analysis.music) {
        tempEdl.music = {
          id: "music_main",
          sourceId: analysis.music.musicId,
          bpm: analysis.music.bpm,
          beatGrid: analysis.music.beatGrid,
          volume: 0.8,
          fadeIn: 0.5,
        };
      }
      tempEdl.timeline = {
        resolution: { width: resolvedWidth, height: resolvedHeight },
        fps: resolvedFps,
        duration: tempEdl.timeline?.duration || targetDuration,
      };
      patchRawEDLForZod(tempEdl, { prompt, intentId, analysisId, threadId });

      let parsedEdl: MonetEDL;
      try {
        parsedEdl = validateAndNormalizeAdvancedEDL(tempEdl as MonetEDL);
      } catch (err: any) {
        lastErrorSummary = `Zod Schema validation failed: ${err.message}`;
        console.warn(`[director] Attempt ${attempt} schema validation failed:`, lastErrorSummary);
        continue;
      }

      const validationResult = validateEDL({ edl: parsedEdl, intent, analysis: analysis as AnalysisResult });
      if (validationResult.isValid) {
        console.log(`[director] EDL validated successfully on attempt ${attempt}`);
        edlData = parsedEdl;
        break;
      } else {
        lastErrorSummary = validationResult.errors.map(e => `Shot validation error: ${e}`).join("\n");
        console.warn(`[director] Attempt ${attempt} quality validation failed:`, lastErrorSummary);
      }
    } catch (err: any) {
      lastErrorSummary = `Generation or parsing failed: ${err.message}`;
      console.warn(`[director] Attempt ${attempt} execution failed:`, lastErrorSummary);
    }

    if (attempt === maxAttempts) {
      throw new Error(`Director failed to produce a valid EDL after ${maxAttempts} attempts. Last error:\n${lastErrorSummary}`);
    }
  }

  // ─── Final check and formatting ───
  if (analysis.music && !edlData.music) {
    edlData.music = {
      id: "music_main",
      sourceId: analysis.music.musicId,
      bpm: analysis.music.bpm,
      beatGrid: analysis.music.beatGrid,
      volume: 0.8,
      fadeIn: 0.5,
    };
  }

  edlData.timeline = {
    resolution: { width: resolvedWidth, height: resolvedHeight },
    fps: resolvedFps,
    duration: edlData.timeline?.duration || targetDuration,
  };

  patchRawEDLForZod(edlData, { prompt, intentId, analysisId, threadId });

  return validateAndNormalizeAdvancedEDL(edlData as MonetEDL);
}

/**
 * Robustly remaps any hallucinated IDs in the EDL to known available IDs.
 */
function remapHallucinatedIds(
  edl: Partial<MonetEDL>,
  availableClipIds: string[],
  availableMusicId?: string
): void {
  const firstClipId = availableClipIds[0] || "unknown";

  // Remap shots
  if (edl.shots) {
    for (const shot of edl.shots) {
      if (shot.source && !availableClipIds.includes(shot.source.clipId)) {
        console.warn(`[remap-ids] Remapping shot clipId "${shot.source.clipId}" → "${firstClipId}"`);
        shot.source.clipId = firstClipId;
      }
    }
  }

  // Remap music sourceId
  if (edl.music && availableMusicId && edl.music.sourceId !== availableMusicId) {
    console.warn(`[remap-ids] Remapping music sourceId "${edl.music.sourceId}" → "${availableMusicId}"`);
    edl.music.sourceId = availableMusicId;
  }

  // Remap motion tracks
  if (edl.motionTracks) {
    for (const track of edl.motionTracks) {
      if (!availableClipIds.includes(track.clipId)) {
        console.warn(`[remap-ids] Remapping motionTrack clipId "${track.clipId}" → "${firstClipId}"`);
        track.clipId = firstClipId;
      }
    }
  }

  // Remap planar tracks
  if (edl.planarTracks) {
    for (const track of edl.planarTracks) {
      if (!availableClipIds.includes(track.clipId)) {
        console.warn(`[remap-ids] Remapping planarTrack clipId "${track.clipId}" → "${firstClipId}"`);
        track.clipId = firstClipId;
      }
    }
  }
}

/**
 * Patch fields the slim schema doesn't produce but Zod requires
 */
function patchRawEDLForZod(
  edlData: Partial<MonetEDL>,
  opts?: { prompt?: string; intentId?: string; analysisId?: string; threadId?: string }
): void {
  edlData.version = edlData.version || "1.0.0";
  edlData.metadata = edlData.metadata || {
    title: "AI Generated Edit",
    createdAt: Date.now(),
    aiModel: "gemini-2.5-flash",
    prompt: opts?.prompt || "",
    intentId: opts?.intentId || "unknown",
    analysisId: opts?.analysisId || "unknown",
    projectId: opts?.threadId || "unknown",
  };
  if (edlData.shots) {
    for (let i = 0; i < edlData.shots.length; i++) {
      const shot = edlData.shots[i];
      if (!shot.id) shot.id = `shot_${String(i + 1).padStart(3, "0")}`;
      if (shot.effects) {
        for (let j = 0; j < shot.effects.length; j++) {
          if (!shot.effects[j].id) shot.effects[j].id = `fx_${shot.id}_${j}`;
        }
      }
      if (shot.transition && shot.transition.duration === undefined) {
        shot.transition.duration = shot.transition.type === "crossfade" ? 0.3 : 0;
      }
      if (!shot.transition) shot.transition = { type: "cut", duration: 0 };
    }
  }
  if (edlData.globalEffects?.colorGrade) {
    const validGrades = ["cinematic", "vibrant", "vintage", "monochrome", "anime", "raw"];
    const raw = String(edlData.globalEffects.colorGrade).toLowerCase();
    const matched = validGrades.find((g) => raw.includes(g));
    edlData.globalEffects.colorGrade = (matched || "cinematic") as any;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Build the "Reference Director" section injected into the EDL generation prompt.
 *
 * This is what makes Monet actually edit LIKE that creator.
 * We convert the analyzed ReferenceStyle into concrete, imperative
 * instructions that override Gemini's defaults and force it to think
 * like the reference editor — not generically.
 *
 * Philosophy: give Gemini the editor's CONTRACT, not just their numbers.
 */
// Reference Director Section and replication contract imported from reference-director.ts

/**
 * Score the generated EDL for quality
 */
function scoreEDL(
  edl: MonetEDL,
  analysis: AnalysisResult,
  intent: IntentExtractionResult
): { beatSyncScore: number; pacingVariance: number; overallConfidence: number } {
  // Beat sync score (if music provided)
  let beatSyncScore = 1.0;
  if (edl.music && Array.isArray(edl.music.beatGrid) && edl.music.beatGrid.length > 0) {
    beatSyncScore = calculateBeatSyncScore(edl, edl.music.beatGrid);
  }

  // Pacing variance (variety in shot durations)
  const pacingVariance = calculatePacingVariance(edl);

  // Overall confidence (combined score)
  const overallConfidence = beatSyncScore * 0.5 + pacingVariance * 0.3 + intent.confidence * 0.2;

  return {
    beatSyncScore: Math.round(beatSyncScore * 100) / 100,
    pacingVariance: Math.round(pacingVariance * 100) / 100,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };
}

/**
 * Calculate how well shots align to beat grid
 */
function calculateBeatSyncScore(edl: MonetEDL, beatGrid: number[]): number {
  if (!edl.shots.length || !beatGrid.length) return 1.0; // No music = perfect score

  let hits = 0;
  const threshold = 0.05; // 50ms tolerance

  for (const shot of edl.shots) {
    if (!shot.beatLock) continue;

    const beatTime = beatGrid[shot.beatLock.beatIndex];
    if (!beatTime) continue;

    const shotTime = shot.timing.startTime;
    const offset = Math.abs(shotTime - beatTime);

    if (offset < threshold) {
      hits++;
    }
  }

  // Shots with beatLock
  const beatLockedShots = edl.shots.filter((s) => s.beatLock).length;

  // Music exists but no beat locks means sync metadata is missing.
  if (beatLockedShots === 0) return 0;

  return hits / beatLockedShots;
}

function ensureBeatLocksForMusic(edl: MonetEDL): MonetEDL {
  const beatGrid = edl.music?.beatGrid;
  if (!beatGrid || beatGrid.length === 0 || edl.shots.length === 0) {
    return edl;
  }

  const hasAnyBeatLock = edl.shots.some((shot) => !!shot.beatLock);
  if (hasAnyBeatLock) {
    return edl;
  }

  const shots = edl.shots.map((shot) => {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < beatGrid.length; i++) {
      const dist = Math.abs(beatGrid[i] - shot.timing.startTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return {
      ...shot,
      beatLock: {
        beatIndex: bestIdx,
        lockMode: "start" as const,
      },
    };
  });

  return {
    ...edl,
    shots,
  };
}

/**
 * Calculate pacing variety (coefficient of variation)
 */
function calculatePacingVariance(edl: MonetEDL): number {
  if (edl.shots.length < 2) return 0.5; // Single shot = default mid score

  const durations = edl.shots.map((s) => s.timing.duration);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Prevent divide by zero
  if (mean === 0) return 0;

  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (normalized)
  const cv = stdDev / mean;

  // 0 = all same length (boring), 1 = high variety (dynamic)
  // Cap at 1.0 for very high variance
  return Math.min(cv / 0.5, 1.0);
}

/**
 * Fetch intent from D1 (or mock for dev)
 */
async function fetchIntent(
  intentId: string,
  env: Env
): Promise<IntentExtractionResult | null> {
  if (!env?.DB) {
    // Mock intent for dev
    console.warn("No DB binding - using mock intent");
    return {
      intent: {
        version: "1.0.0",
        goal: { primary: "Create aggressive anime AMV" },
        style: { genre: "anime_amv", pacing: "aggressive", mood: ["intense"] },
        structure: { duration: 30, energyCurve: Array(30).fill(0.8) },
        technical: {
          syncToBeat: true,
          beatSyncStrength: 0.9,
          transitionStyle: "cut",
          colorTreatment: "anime",
          effectsIntensity: 0.6,
        },
        contentPreferences: { focusOn: ["action", "closeups"] },
      },
      pillarWeights: { brutalistImpact: 0.8, tensionPivot: 0.4, vocalFlowSync: 0.5, legacyMontage: 0.1 },
      directorParams: { climaxPosition: 0.55, restraintLevel: "minimal", heroMomentCount: 3, crossClipBias: 0.8, effectBudget: 25 },
      confidence: 0.85,
      clarifyingQuestions: [],
      reasoning: "Mock intent for testing",
    };
  }

  const result = await env.DB.prepare(
    "SELECT intent_data, confidence FROM edit_intents WHERE id = ?"
  )
    .bind(intentId)
    .first<{ intent_data: string; confidence: number }>();

  if (!result) return null;

  const parsed = JSON.parse(result.intent_data);
  return {
    intent: parsed,
    pillarWeights: parsed.pillarWeights || { brutalistImpact: 0.5, tensionPivot: 0.2, vocalFlowSync: 0.1, legacyMontage: 0.2 },
    directorParams: parsed.directorParams || { climaxPosition: 0.65, restraintLevel: "moderate", heroMomentCount: 2, crossClipBias: 0.6 },
    confidence: result.confidence,
    clarifyingQuestions: [],
    reasoning: "Stored intent",
  };
}

/**
 * Fetch analysis from D1 (or mock for dev)
 */
async function fetchAnalysis(
  analysisId: string,
  env: Env
): Promise<AnalysisResult | null> {
  const inMemory = getAnalysisResult(analysisId);
  if (inMemory) {
    return inMemory;
  }

  if (!env?.DB) {
    console.warn("No DB binding and no in-memory analysis found for:", analysisId);
    return null;
  }

  const result = await env.DB.prepare(
    "SELECT analysis_data FROM analysis_results WHERE id = ?"
  )
    .bind(analysisId)
    .first<{ analysis_data: string }>();

  if (!result) return null;

  return JSON.parse(result.analysis_data);
}

/**
 * Store EDL in D1
 */
async function storeEDL(
  db: D1Database,
  projectId: string,
  intentId: string,
  analysisId: string,
  edl: MonetEDL,
  scores: { beatSyncScore: number; pacingVariance: number; overallConfidence: number },
  aiModel: string
): Promise<string> {
  const edlId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO edls (
        id, project_id, intent_id, analysis_id, version,
        edl_data, beat_sync_score, pacing_variance_score, overall_confidence,
        model_used, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      edlId,
      projectId,
      intentId,
      analysisId,
      edl.version || "1.0.0",
      JSON.stringify(edl),
      scores.beatSyncScore,
      scores.pacingVariance,
      scores.overallConfidence,
      aiModel,
      now()
    )
    .run();

  return edlId;
}


// Helper: JSON response
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * Robust intent resolution helper
 */
async function resolveIntentFromService(params: {
  env: Env;
  intentId?: string;
  prompt?: string;
  threadId?: string;
  style?: string;
  durationSeconds?: number;
}): Promise<{ id: string; intent: unknown }> {
  const { env, intentId, prompt, threadId, style, durationSeconds } = params;

  if (intentId) {
    const existingIntent = await getIntentById(env, intentId);
    if (existingIntent) {
      return { id: intentId, intent: existingIntent };
    }
  }

  if (prompt) {
    const cachedIntent = await getCachedIntentByPrompt(env, prompt);
    if (cachedIntent?.id && cachedIntent.intent) {
      return cachedIntent;
    }

    return createIntentFromPrompt(env, {
      prompt,
      threadId,
      style,
      durationSeconds,
    });
  }

  throw new Error("No intentId or prompt provided to resolve intent");
}

function enforceClipDiversity(edl: MonetEDL): MonetEDL {
  if (!edl.shots?.length) return edl;

  const usage: Record<string, number> = {};
  for (const shot of edl.shots) {
    const id = shot.source.clipId;
    usage[id] = (usage[id] || 0) + 1;
  }

  const clipIds = Object.keys(usage);

  if (clipIds.length === 1) {
    // Single clip: slice into different time segments for visual variety
    let cursor = 0;
    for (const shot of edl.shots) {
      const originalDuration = shot.source.outPoint - shot.source.inPoint;
      // Use varying durations per shot for pacing feel
      const variedDuration = Math.max(0.5, originalDuration * (0.7 + Math.random() * 0.6));

      shot.source.inPoint = cursor;
      shot.source.outPoint = cursor + variedDuration;

      // Advance cursor with small random gap for rhythm variety
      cursor += variedDuration + (Math.random() * 1.5 + 0.3);
    }
    console.log("[generate-edl] enforced clip diversity: single clip, time-sliced into", edl.shots.length, "segments");
  }

  // Enforce valid segment boundaries across all clips
  for (const shot of edl.shots) {
    if (shot.source.inPoint < 0) shot.source.inPoint = 0;
    if (shot.source.outPoint <= shot.source.inPoint) {
      shot.source.outPoint = shot.source.inPoint + 1;
    }
  }

  return edl;
}

function enforceEffectDiversity(edl: MonetEDL): MonetEDL {
  if (!edl.shots?.length) return edl;

  for (const shot of edl.shots) {
    if (!shot.effects?.length) continue;

    const seen = new Set<string>();
    shot.effects = shot.effects.filter((e: any) => {
      const type = e.type ?? e.kind ?? "unknown";
      if (seen.has(type)) return false;
      seen.add(type);
      return true;
    });
  }

  return edl;
}
