import type { Env } from "../types/env";
import type { MonetEDL } from "../types/edl";
import type { AnalysisResult } from "../types/analysis";
import type { ReferenceStyle } from "../types/reference-style";
import type { NormalizedIntent } from "./intent-normalization";
import type { ReferenceEditTrace } from "../director/reference-edit-trace";
import { loadPromptTemplate } from "../prompts";
import { getConfiguredGeminiModel } from "../services/model-config";
import { getAIService } from "../services/ai-service";
import { validateAndNormalizeAdvancedEDL } from "./validate-advanced-edl";
import { validateEDL } from "./edl-validator";
import { enforceReferenceStyleOnEDL } from "./reference-style-enforcer";
import { injectReferenceColorGrades } from "./reference-color-injector";
import { placeEffectsDeterministically } from "../director/effect-placement";
import { enforceMotionContinuity } from "../director/shot-continuity";
import { compileReferenceStyleToDirectives } from "../director/style-directives";
import { validateCreativeDensity } from "../director/creative-density";
import { compileTraceToStyleSlots } from "../director/reference-edit-trace";
import { compareReferenceTraceToEDL } from "../director/reference-similarity";
import { critiqueAndRefine } from "../services/edl-critique-service";
import { ensureBeatLocksForMusic, type RhythmMap } from "./edl-scoring";
import { buildReferenceDirectorSection } from "../director/reference-director";
import { humanizeEDL, buildHumanizerConfig } from "../director/humanizer";

export async function generateEDL(params: {
  env: Env;
  intent: NormalizedIntent;
  analysis: AnalysisResult;
  ai: ReturnType<typeof getAIService>;
  referenceStyle?: ReferenceStyle;
  referenceTrace?: ReferenceEditTrace;
  referenceMode: "strict_replication" | "inspired";
  momentMap?: unknown;
  vocabulary?: unknown;
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
    momentMap,
    vocabulary,
    analysisId,
    clipIds,
    threadId,
    prompt,
    outputWidth,
    outputHeight,
    outputFps,
  } = params;

  const intentId = String((intent as unknown as Record<string, unknown>).id || "unknown");
  const targetDuration = intent.durationSeconds;
  const resolvedWidth = outputWidth ?? 1920;
  const resolvedHeight = outputHeight ?? 1080;
  const resolvedFps = outputFps ?? 30;

  // Use trace from style if client didn't provide one
  const effectiveTrace = referenceTrace ?? (referenceStyle as any)?.referenceTrace ?? null;

  const promptTemplate = loadPromptTemplate("generate-edl-v3.txt");

  // Compact footage context (top segments per clip, with perception data)
  const compactFootage = (analysis.footage || []).map((f) => ({
    clipId: f.clipId,
    duration: f.duration,
    segments: Array.isArray(f.segments)
      ? [...f.segments]
          .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0))
          .slice(0, 16)
          .map((s: any) => ({
            start: s.start,
            end: s.end,
            duration: s.duration,
            tags: s.tags?.slice(0, 8),
            semantic: s.semantic ?? [],
            motion: s.scores?.motion,
            motionDir: s.motionDir ?? "none",
            faceCentered: s.faceCentered ?? false,
            hasVelocityRamp: s.hasVelocityRamp ?? false,
            energy: s.scores?.emotion,
            score: s.scores?.overall,
            description: s.description?.slice(0, 100),
          }))
      : [],
  }));

  // Compact music context
  const compactMusic = analysis.music
    ? {
        musicId: analysis.music.musicId,
        duration: analysis.music.duration,
        bpm: analysis.music.bpm,
        beatGrid: analysis.music.beatGrid,
        energy: analysis.music.characteristics.energy,
        structure: (analysis.music as Record<string, unknown>).structure,
      }
    : null;

  // Reference constraints
  let referenceConstraints = "";
  let referenceDirectorSection = "";
  if (referenceStyle) {
    const rs = referenceStyle;
    const strict = referenceMode === "strict_replication";
    const tb = rs.effects.transitionsBreakdown;

    // Rich director prompt — editor philosophy, signature moves, moment map
    referenceDirectorSection = buildReferenceDirectorSection(
      referenceStyle,
      referenceMode,
      targetDuration,
      (momentMap as any) ?? null,
      (vocabulary as any) ?? null,
    );

    referenceConstraints = `
## REFERENCE STYLE CONSTRAINTS (${strict ? "STRICT — hard constraints" : "INSPIRED — soft targets"})
- Average shot duration: ${rs.rhythm.avgShotDuration.toFixed(2)}s (${strict ? "±15%" : "±30%"} tolerance)
- Cut alignment: ${rs.rhythm.cutAlignment} (${rs.rhythm.cutAlignment === "strict" ? "every cut within 50ms of beat" : "cuts near beats, ±200ms ok"})
- Climax at: ${Math.round(rs.pacing.climaxPosition * 100)}% of timeline
- Transitions: ${Math.round(tb.cutPercentage * 100)}% cuts / ${Math.round(tb.crossfadePercentage * 100)}% crossfades
- Color treatment: ${rs.intentMapping.colorTreatment}
- Effects frequency: ${Math.round(rs.effects.effectsFrequency * 100)}% of shots
- Editor philosophy: "${rs.editingPhilosophy.summary.slice(0, 120)}"
- Energy curve shape: ${rs.pacing.energyCurve.map((v) => v.toFixed(1)).join(",")}

`;
    // Add structure-aware section rules
    const structure = rs.intentMapping?.structure;
    const energyArc = rs.intentMapping?.energyArc;
    const climaxTs = rs.pacing?.climaxPosition ?? 0.5;
    if (structure === 'setup_to_montage') {
      referenceConstraints += `
## STRUCTURAL ARC: Setup → Montage (${strict ? 'STRICT' : 'soft'})
The reference has a HYBRID structure with two distinct sections:
- BEFORE climax (~${Math.round(climaxTs * 100)}% = ~${(climaxTs * (rs.duration || 30)).toFixed(1)}s): SLOW SETUP — dialogue, breathing, minimal effects. Shots should be LONGER, FEWER effects, mostly clean cuts. Effect density: 0-1 per shot.
- AFTER climax: RAPID MONTAGE — high energy, fast cuts, heavy effects. Shots should be SHORTER, MORE effects, beat-locked. Effect density: 2-5 per shot.
- AT climax: STRONGEST moment — peak effects, hardest cut, highest energy.
- DO NOT apply heavy effects (impact_flash, speed_ramp, color_pulse) to shots before the climax timestamp.
- Effect density MUST increase after the climax point.
`;
    } else if (structure === 'dialogue_drama') {
      referenceConstraints += `
## STRUCTURAL ARC: Dialogue Drama
Minimal effects throughout. Clean cuts. Focus on performance and pacing.
`;
    } else if (energyArc === 'build' || energyArc === 'climax_spike') {
      referenceConstraints += `
## ENERGY ARC: ${energyArc}
Effects should build toward the climax point and peak there.
`;
    }
    referenceConstraints += `
## REFERENCE TRANSITIONS (match these ratios)
- cut: ${Math.round(tb.cutPercentage * 100)}%
- crossfade: ${Math.round(tb.crossfadePercentage * 100)}%
- whip-pan: ${Math.round((tb.whipPanPercentage ?? 0) * 100)}%
- dip_black: ${Math.round((tb.dipBlackPercentage ?? 0) * 100)}%
- flash: ${Math.round((tb.flashPercentage ?? 0) * 100)}%
- glitch: ${Math.round((tb.glitchPercentage ?? 0) * 100)}%
- zoom-blur: ${Math.round((tb.zoomBlurPercentage ?? 0) * 100)}%
`;
    if (referenceStyle.pillarScores) {
      const ps = referenceStyle.pillarScores;
      referenceConstraints += `
## PILLAR SCORES (reference editor's strengths)
- Brutalist Impact: ${(ps.brutalistImpact * 100).toFixed(0)}%
- Tension Pivot: ${(ps.tensionPivot * 100).toFixed(0)}%
- Vocal Flow Sync: ${(ps.vocalFlowSync * 100).toFixed(0)}%
- Legacy Montage: ${(ps.legacyMontage * 100).toFixed(0)}%
`;
    }
  }

  // Style slots from reference trace
  let styleSlotSection = "";
  if (effectiveTrace) {
    const targetDuration = intent.durationSeconds ?? 30;
    const slots = compileTraceToStyleSlots(effectiveTrace, targetDuration);
    if (slots.length > 0) {
      styleSlotSection = "\n## STYLE SLOTS (moment-by-moment effects from reference)\n";
      for (const slot of slots) {
        styleSlotSection += `- t=${slot.outputTimeSec.toFixed(1)}s (norm=${slot.normalizedTime.toFixed(2)}): ${slot.requiredEvents.join(",")} (intensity ${(slot.intensity * 100).toFixed(0)}%)\n`;
      }
    }
  }

  // Build the full prompt
  const styleVocab = loadPromptTemplate("style-vocabulary.txt");
  const fullPrompt = promptTemplate
    .replace("{{STYLE_VOCABULARY}}", styleVocab ?? "")
    .replace("{{INTENT}}", JSON.stringify({
      goal: { primary: "Edit", ...((intent as unknown as Record<string, unknown>).goal ?? {}) },
      style: { pacing: "medium", mood: [], ...((intent as unknown as Record<string, unknown>).style ?? {}) },
      structure: { duration: 30, energyCurve: [], ...((intent as unknown as Record<string, unknown>).structure ?? {}) },
      technical: {
        syncToBeat: true, beatSyncStrength: 0.7, transitionStyle: "cut",
        colorTreatment: "vibrant", effectsIntensity: 0.5,
        ...((intent as unknown as Record<string, unknown>).technical ?? {}),
      },
    }))
    .replace("{{PILLAR_WEIGHTS}}", JSON.stringify(
      (intent as unknown as Record<string, unknown>)?.pillarWeights ?? {
        brutalistImpact: 0.5, tensionPivot: 0.2,
        vocalFlowSync: 0.1, legacyMontage: 0.2,
      }
    ))
    .replace("{{DIRECTOR_PARAMS}}", JSON.stringify(
      (intent as unknown as Record<string, unknown>)?.directorParams ?? {
        climaxPosition: 0.65, restraintLevel: "moderate",
        heroMomentCount: 2, crossClipBias: 0.6, effectBudget: 25,
      }
    ))
    .replace("{{EDIT_INTENSITY}}", String(0.5))
    .replace("{{ANALYSIS}}", JSON.stringify({
      footage: compactFootage,
      music: compactMusic,
    }))
    .replace("{{MUSIC_STRUCTURE}}", JSON.stringify(compactMusic))
    .replace("{{REFERENCE_STYLE}}", JSON.stringify(referenceStyle ?? null))
    .replace("{{AVAILABLE_CLIPS}}", JSON.stringify(clipIds))
    .replace("{{REFERENCE_CONSTRAINTS}}", referenceConstraints)
    .replace("{{REFERENCE_DIRECTOR_SECTION}}", referenceDirectorSection)
    .replace("{{STYLE_SLOT_SECTION}}", styleSlotSection);

  // Call Gemini
  const aiModel = getConfiguredGeminiModel(env);
  const temperature = referenceMode === "strict_replication" ? 0.25 : 0.5;
  const response = await withTimeout(
    ai.generateContentJSON({
      prompt: fullPrompt,
      temperature,
      maxOutputTokens: 8192,
    }),
    120_000,
    "EDL generation timed out after 120s"
  );

  // Parse response
  let edlData: Partial<MonetEDL>;
  try {
    edlData = typeof response === "string" ? JSON.parse(response) : response;
  } catch {
    throw new Error("Failed to parse EDL from AI response");
  }

  // Remap hallucinated clip IDs
  remapHallucinatedIds(edlData, clipIds, analysis.music?.musicId);

  // Patch for Zod validation
  patchRawEDLForZod(edlData, { prompt, intentId, analysisId, threadId });

  // Validate
  let edl: MonetEDL;
  try {
    edl = validateAndNormalizeAdvancedEDL(edlData);
  } catch (err) {
    throw new Error(`EDL validation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Post-generation mutation chain — enforce → color → effects → continuity → beat-lock LAST
  const rhythm = (referenceStyle as any)?.rhythmMap
    ?? (analysis.music as any)?.rhythmMap
    ?? undefined;

  if (referenceStyle) {
    edl = enforceReferenceStyleOnEDL(edl, referenceStyle, referenceMode);
    edl = injectReferenceColorGrades(edl, referenceStyle);
    if (rhythm) edl = placeEffectsDeterministically(edl, referenceStyle, rhythm);
    edl = enforceMotionContinuity(edl);
  }

  // Beat-lock is ALWAYS last so effect placement can't drift the cuts off transients
  edl = ensureBeatLocksForMusic(edl, rhythm as RhythmMap | undefined, {
    maxDriftMs: 70,
    strict: referenceMode === "strict_replication",
  });

  // Humanizer — adds controlled unpredictability that makes edits feel human
  // Applies AFTER beat-lock so imperfections layer on top of sync
  if (referenceStyle && rhythm) {
    try {
      const shotDurations = referenceStyle.rhythm?.structure
        ? [referenceStyle.rhythm.structure.firstHalfAvgShotDuration, referenceStyle.rhythm.structure.secondHalfAvgShotDuration]
        : [referenceStyle.rhythm?.avgShotDuration ?? 1.0];
      const humanizerConfig = buildHumanizerConfig(referenceStyle, shotDurations, resolvedFps);
      edl = humanizeEDL(edl, referenceStyle, rhythm, humanizerConfig);
      console.log(`[edl-generation] Humanizer applied: micro-imperfections + decay + reflow`);
    } catch (e) {
      console.warn(`[edl-generation] Humanizer failed: ${(e as Error).message}`);
    }
  }

  // Validate creative density
  try {
    const directives = referenceStyle
      ? compileReferenceStyleToDirectives(referenceStyle, referenceMode)
      : compileReferenceStyleToDirectives(null, "inspired");
    const densityCheck = validateCreativeDensity(edl, directives);
    if (!densityCheck.passed) {
      console.warn("[edl-generation] Creative density warning:", densityCheck.failures);
    }
  } catch {
    // density check is non-blocking
  }

  // Critique and refine (up to 2 passes)
  if (referenceStyle) {
    try {
      const critiqueResult = await critiqueAndRefine(env, edl, intent as any, (analysis.music as any) ?? null);
      if (critiqueResult?.refined) {
        edl = critiqueResult.refined;
      }
    } catch {
      // critique is non-blocking
    }
  }

  // Compare to reference trace
  if (effectiveTrace) {
    const comparison = compareReferenceTraceToEDL(effectiveTrace, edl);
    if (comparison.overall < 0.5) {
      console.warn("[edl-generation] Low similarity to reference:", comparison.overall);
    }
  }

  // Final validation
  try {
    const finalCheck = validateEDL({ edl, intent, analysis });
    if (!finalCheck.isValid) {
      throw new Error(`Final EDL validation failed: ${finalCheck.errors.join(", ")}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Final EDL validation")) throw err;
  }

  return edl;
}

function remapHallucinatedIds(
  edl: Partial<MonetEDL>,
  availableClipIds: string[],
  availableMusicId?: string
): void {
  const firstClipId = availableClipIds[0] || "unknown";

  if (edl.shots) {
    for (const shot of edl.shots) {
      if (shot.source && !availableClipIds.includes(shot.source.clipId)) {
        console.warn(`[remap-ids] Remapping shot clipId "${shot.source.clipId}" → "${firstClipId}"`);
        shot.source.clipId = firstClipId;
      }
    }
  }

  if (edl.music && availableMusicId && edl.music.sourceId !== availableMusicId) {
    console.warn(`[remap-ids] Remapping music sourceId "${edl.music.sourceId}" → "${availableMusicId}"`);
    edl.music.sourceId = availableMusicId;
  }

  if (edl.motionTracks) {
    for (const track of edl.motionTracks) {
      if (!availableClipIds.includes(track.clipId)) {
        console.warn(`[remap-ids] Remapping motionTrack clipId "${track.clipId}" → "${firstClipId}"`);
        track.clipId = firstClipId;
      }
    }
  }

  if (edl.planarTracks) {
    for (const track of edl.planarTracks) {
      if (!availableClipIds.includes(track.clipId)) {
        console.warn(`[remap-ids] Remapping planarTrack clipId "${track.clipId}" → "${firstClipId}"`);
        track.clipId = firstClipId;
      }
    }
  }
}

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
    edlData.globalEffects.colorGrade = (matched || "cinematic") as "cinematic" | "vibrant" | "vintage" | "monochrome" | "anime" | "raw";
  }

  // Patch music fields for Zod validation
  if (edlData.music) {
    if (!edlData.music.id) edlData.music.id = edlData.music.sourceId || `music_${Date.now()}`;
    if (!edlData.music.sourceId) edlData.music.sourceId = edlData.music.id || '';
    if (edlData.music.bpm === undefined || edlData.music.bpm === null) edlData.music.bpm = 120;
    // Never fabricate a click track. Real beats only.
    if (!Array.isArray(edlData.music.beatGrid) || edlData.music.beatGrid.length === 0) {
      edlData.music.beatGrid = [];
      (edlData.music as any).beatSyncAvailable = false;
    } else {
      (edlData.music as any).beatSyncAvailable = true;
    }
    if (edlData.music.volume === undefined || edlData.music.volume === null) edlData.music.volume = 1.0;
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
