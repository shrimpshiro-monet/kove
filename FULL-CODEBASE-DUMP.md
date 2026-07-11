# Style Replication Pipeline — Full Codebase Dump

> Every line of code that matters for style replication. Organized by tier.

---

# TIER 1 — The Brain

## src/server/lib/edl-generation.ts (475 lines)

```typescript
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
import { injectReferenceEffects } from "./reference-effect-injector";
import { injectReferenceColorGrades } from "./reference-color-injector";
import { enhanceEDLWithStyleDirectives } from "../director/enhance-edl-with-style";
import { compileReferenceStyleToDirectives } from "../director/style-directives";
import { validateCreativeDensity } from "../director/creative-density";
import { compileTraceToStyleSlots } from "../director/reference-edit-trace";
import { compareReferenceTraceToEDL } from "../director/reference-similarity";
import { critiqueAndRefine } from "../services/edl-critique-service";
import { ensureBeatLocksForMusic } from "./edl-scoring";

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
    env, intent, analysis, ai, referenceStyle, referenceTrace,
    referenceMode, momentMap, vocabulary, analysisId, clipIds,
    threadId, prompt, outputWidth, outputHeight, outputFps,
  } = params;

  const intentId = String((intent as unknown as Record<string, unknown>).id || "unknown");
  const targetDuration = intent.durationSeconds;
  const resolvedWidth = outputWidth ?? 1920;
  const resolvedHeight = outputHeight ?? 1080;
  const resolvedFps = outputFps ?? 30;

  const promptTemplate = loadPromptTemplate("generate-edl-v3.txt");

  // Compact footage context (top 8 segments per clip)
  const compactFootage = (analysis.footage || []).map((f) => ({
    clipId: f.clipId,
    duration: f.duration,
    segments: Array.isArray(f.segments)
      ? [...f.segments]
          .sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0))
          .slice(0, 8)
          .map((s) => ({
            start: s.start, end: s.end, duration: s.duration,
            tags: s.tags?.slice(0, 5), score: s.scores?.overall,
            emotion: s.scores?.emotion, motion: s.scores?.motion,
            description: s.description?.slice(0, 80),
          }))
      : [],
  }));

  // Compact music context
  const compactMusic = analysis.music
    ? {
        musicId: analysis.music.musicId, duration: analysis.music.duration,
        bpm: analysis.music.bpm, beatGrid: analysis.music.beatGrid,
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
      referenceConstraints += `\n## STRUCTURAL ARC: Dialogue Drama\nMinimal effects throughout. Clean cuts. Focus on performance and pacing.\n`;
    } else if (energyArc === 'build' || energyArc === 'climax_spike') {
      referenceConstraints += `\n## ENERGY ARC: ${energyArc}\nEffects should build toward the climax point and peak there.\n`;
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
  if (referenceTrace) {
    const targetDuration = intent.durationSeconds ?? 30;
    const slots = compileTraceToStyleSlots(referenceTrace, targetDuration);
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
        brutalistImpact: 0.5, tensionPivot: 0.2, vocalFlowSync: 0.1, legacyMontage: 0.2,
      }
    ))
    .replace("{{DIRECTOR_PARAMS}}", JSON.stringify(
      (intent as unknown as Record<string, unknown>)?.directorParams ?? {
        climaxPosition: 0.65, restraintLevel: "moderate",
        heroMomentCount: 2, crossClipBias: 0.6, effectBudget: 25,
      }
    ))
    .replace("{{EDIT_INTENSITY}}", String(0.5))
    .replace("{{ANALYSIS}}", JSON.stringify({ footage: compactFootage, music: compactMusic }))
    .replace("{{MUSIC_STRUCTURE}}", JSON.stringify(compactMusic))
    .replace("{{REFERENCE_STYLE}}", JSON.stringify(referenceStyle ?? null))
    .replace("{{AVAILABLE_CLIPS}}", JSON.stringify(clipIds))
    .replace("{{REFERENCE_CONSTRAINTS}}", referenceConstraints)
    .replace("{{REFERENCE_DIRECTOR_SECTION}}", referenceDirectorSection)
    .replace("{{STYLE_SLOT_SECTION}}", styleSlotSection);

  // Call Gemini
  const aiModel = getConfiguredGeminiModel(env);
  const response = await withTimeout(
    ai.generateContentJSON({ prompt: fullPrompt, temperature: 0.7, maxOutputTokens: 8192 }),
    120_000, "EDL generation timed out after 120s"
  );

  // Parse response
  let edlData: Partial<MonetEDL>;
  try {
    edlData = typeof response === "string" ? JSON.parse(response) : response;
  } catch {
    throw new Error("Failed to parse EDL from AI response");
  }

  remapHallucinatedIds(edlData, clipIds, analysis.music?.musicId);
  patchRawEDLForZod(edlData, { prompt, intentId, analysisId, threadId });

  let edl: MonetEDL;
  try {
    edl = validateAndNormalizeAdvancedEDL(edlData);
  } catch (err) {
    throw new Error(`EDL validation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  edl = ensureBeatLocksForMusic(edl);
  if (referenceStyle) edl = enforceReferenceStyleOnEDL(edl, referenceStyle, referenceMode);
  if (referenceStyle) edl = injectReferenceEffects(edl, referenceStyle);
  if (referenceStyle) edl = injectReferenceColorGrades(edl, referenceStyle);
  if (referenceStyle) {
    const directives = compileReferenceStyleToDirectives(referenceStyle, referenceMode);
    edl = enhanceEDLWithStyleDirectives(edl, directives);
  }

  // Section fidelity enforcement for setup_to_montage
  if (referenceStyle?.intentMapping?.structure === 'setup_to_montage' && edl.shots?.length > 0) {
    const climaxPosition = referenceStyle.pacing?.climaxPosition ?? 0.5;
    const timelineDuration = edl.timeline?.duration ?? 30;
    const climaxTs = climaxPosition * timelineDuration;
    let preClimaxEffects = 0, postClimaxEffects = 0, preClimaxCount = 0, postClimaxCount = 0;
    for (const shot of edl.shots) {
      const shotStart = shot.timing?.startTime ?? 0;
      const isPreClimax = shotStart < climaxTs;
      if (isPreClimax) {
        preClimaxCount++;
        if (shot.effects && shot.effects.length > 1) {
          const heavyTypes = ['impact_flash', 'speed_ramp', 'color_pulse', 'context_shake'];
          shot.effects = shot.effects.filter((e: any) => !heavyTypes.includes(e.type)).slice(0, 1);
        }
        preClimaxEffects += (shot.effects?.length ?? 0);
      } else {
        postClimaxCount++;
        if (shot.effects && shot.effects.length < 2) {
          const hasSpeed = shot.effects?.some((e: any) => e.type === 'speed_ramp');
          const hasFlash = shot.effects?.some((e: any) => e.type === 'impact_flash' || e.type === 'flash_white');
          if (!hasSpeed) { shot.effects = shot.effects || []; shot.effects.push({ id: `fx_${shot.id}_sr`, type: 'speed_ramp', intensity: 0.6, params: { entrySpeed: 1, exitSpeed: 1, anchorSpeed: 0.5 } }); }
          if (!hasFlash && Math.random() < 0.4) { shot.effects = shot.effects || []; shot.effects.push({ id: `fx_${shot.id}_fl`, type: 'impact_flash', intensity: 0.7, params: { peakBrightness: 0.9, flashFrameCount: 2 } }); }
        }
        postClimaxEffects += (shot.effects?.length ?? 0);
      }
    }
    console.log(`[edl-generation] Section fidelity enforced: pre-climax ${preClimaxCount} shots/${preClimaxEffects} effects, post-climax ${postClimaxCount} shots/${postClimaxEffects} effects`);
  }

  try {
    const directives = referenceStyle
      ? compileReferenceStyleToDirectives(referenceStyle, referenceMode)
      : compileReferenceStyleToDirectives(null, "inspired");
    const densityCheck = validateCreativeDensity(edl, directives);
    if (!densityCheck.passed) console.warn("[edl-generation] Creative density warning:", densityCheck.failures);
  } catch { /* non-blocking */ }

  if (referenceStyle) {
    try {
      const critiqueResult = await critiqueAndRefine(env, edl, intent as any, (analysis.music as any) ?? null);
      if (critiqueResult?.refined) edl = critiqueResult.refined;
    } catch { /* non-blocking */ }
  }

  if (referenceTrace) {
    const comparison = compareReferenceTraceToEDL(referenceTrace, edl);
    if (comparison.overall < 0.5) console.warn("[edl-generation] Low similarity to reference:", comparison.overall);
  }

  try {
    const finalCheck = validateEDL({ edl, intent, analysis });
    if (!finalCheck.isValid) throw new Error(`Final EDL validation failed: ${finalCheck.errors.join(", ")}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Final EDL validation")) throw err;
  }

  return edl;
}

function remapHallucinatedIds(edl: Partial<MonetEDL>, availableClipIds: string[], availableMusicId?: string): void {
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
      if (!availableClipIds.includes(track.clipId)) track.clipId = firstClipId;
    }
  }
  if (edl.planarTracks) {
    for (const track of edl.planarTracks) {
      if (!availableClipIds.includes(track.clipId)) track.clipId = firstClipId;
    }
  }
}

function patchRawEDLForZod(edlData: Partial<MonetEDL>, opts?: { prompt?: string; intentId?: string; analysisId?: string; threadId?: string }): void {
  edlData.version = edlData.version || "1.0.0";
  edlData.metadata = edlData.metadata || {
    title: "AI Generated Edit", createdAt: Date.now(), aiModel: "gemini-2.5-flash",
    prompt: opts?.prompt || "", intentId: opts?.intentId || "unknown",
    analysisId: opts?.analysisId || "unknown", projectId: opts?.threadId || "unknown",
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
  if (edlData.music) {
    if (!edlData.music.id) edlData.music.id = edlData.music.sourceId || `music_${Date.now()}`;
    if (!edlData.music.sourceId) edlData.music.sourceId = edlData.music.id || '';
    if (edlData.music.bpm === undefined || edlData.music.bpm === null) edlData.music.bpm = 120;
    if (!Array.isArray(edlData.music.beatGrid) || edlData.music.beatGrid.length === 0) {
      const bpm = edlData.music.bpm || 120;
      const beatInterval = 60 / bpm;
      const duration = edlData.timeline?.duration ?? 30;
      edlData.music.beatGrid = [];
      for (let t = 0; t < duration; t += beatInterval) {
        edlData.music.beatGrid.push(Math.round(t * 1000) / 1000);
      }
    }
    if (edlData.music.volume === undefined || edlData.music.volume === null) edlData.music.volume = 1.0;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
```

---

## src/server/api/generate-edl.ts (715 lines)

[Full code already shown above in Tier 1 read — 715 lines including V3 pipeline, legacy fallback, duration clamping, section fidelity, transition distribution, empty EDL guard]

---

## src/server/prompts/generate-edl-v3.txt (523 lines)

[Full prompt already shown above — the Gemini director prompt with 50+ effects, structural arc rules, pillar techniques, transition rules, self-audit checklist]

---

## src/server/types/reference-style.ts (608 lines)

[Full type definition already shown above — ReferenceStyle interface with rhythm, pacing, shotLanguage, visualStyle, effects, emotionalArc, editingPhilosophy, composition, pillarScores, textStyle, effectTriggers, effectVocabulary, colorGrades, velocityRamps, flashFrames, structuralAnalysis, climax, intentMapping]

---

## src/server/lib/python-velocity-bridge.ts (189 lines)

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

interface VelocitySample { timestamp: number; magnitude: number; }
interface PythonShot { index: number; start_time: number; end_time: number; duration: number; start_frame: number; end_frame: number; }
interface PythonResult {
  total_duration: number; fps: number; total_frames: number;
  shots: PythonShot[]; velocity_curve: VelocitySample[];
  dominant_palette: string[]; audio: { bpm: number; beats: number[] } | null;
  cut_frequency: number; avg_shot_duration: number; pacing: string;
}

export interface StructuralMotionResult {
  motionEnergyProfile1s: number[];
  shotMotionProfile: Array<{ shotIndex: number; startTime: number; duration: number; meanMotion: number; maxMotion: number; }>;
  earlyEnergy: number; lateEnergy: number; energyVarianceRatio: number;
  peakMotionTimestamp?: number; motionSource: string;
  motionSampleCount: number; nonzeroMotionSampleCount: number;
  pythonShots: PythonShot[]; velocitySamples: VelocitySample[];
  dominantPalette: string[]; audio: { bpm: number; beats: number[] } | null;
}

export async function runPythonVelocityAnalysis(videoPath: string): Promise<StructuralMotionResult> {
  const scriptDir = path.resolve(process.cwd(), "workers/python-ai/workers");
  try {
    const { stdout } = await execFileAsync("python3", [
      "-c", `import json, sys; sys.path.insert(0, '${scriptDir}'); from deep_analysis import run_deep_analysis; res = run_deep_analysis(sys.argv[1]); print(json.dumps(res))`,
      videoPath,
    ], { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 });

    const raw: PythonResult = JSON.parse(stdout.trim());
    const totalDuration = raw.total_duration;
    const numSeconds = Math.ceil(totalDuration);

    const motionEnergyProfile1s = new Array(numSeconds).fill(0);
    const bucketCounts = new Array(numSeconds).fill(0);
    for (const sample of raw.velocity_curve) {
      const sec = Math.floor(sample.timestamp);
      if (sec >= 0 && sec < numSeconds) { motionEnergyProfile1s[sec] += sample.magnitude; bucketCounts[sec]++; }
    }
    for (let i = 0; i < numSeconds; i++) { if (bucketCounts[i] > 0) motionEnergyProfile1s[i] /= bucketCounts[i]; }

    const shotMotionProfile = raw.shots.map((shot) => {
      const shotSamples = raw.velocity_curve.filter((v) => v.timestamp >= shot.start_time && v.timestamp < shot.end_time);
      const mags = shotSamples.map((s) => s.magnitude);
      return {
        shotIndex: shot.index, startTime: shot.start_time, duration: shot.duration,
        meanMotion: mags.length > 0 ? mags.reduce((a, b) => a + b, 0) / mags.length : 0,
        maxMotion: mags.length > 0 ? Math.max(...mags) : 0,
      };
    });

    const midpoint = totalDuration / 2;
    const earlySamples = raw.velocity_curve.filter((v) => v.timestamp < midpoint);
    const lateSamples = raw.velocity_curve.filter((v) => v.timestamp >= midpoint);
    const earlyEnergy = earlySamples.length > 0 ? earlySamples.reduce((s, v) => s + v.magnitude, 0) / earlySamples.length : 0;
    const lateEnergy = lateSamples.length > 0 ? lateSamples.reduce((s, v) => s + v.magnitude, 0) / lateSamples.length : 0;
    const energyVarianceRatio = earlyEnergy > 0 ? lateEnergy / earlyEnergy : 1;

    let peakMotionTimestamp: number | undefined;
    if (raw.velocity_curve.length > 0) {
      const peak = raw.velocity_curve.reduce((max, s) => (s.magnitude > max.magnitude ? s : max), raw.velocity_curve[0]);
      peakMotionTimestamp = peak.timestamp;
    }

    const nonzeroSamples = raw.velocity_curve.filter((v) => v.magnitude > 0.1);
    return {
      motionEnergyProfile1s, shotMotionProfile, earlyEnergy, lateEnergy, energyVarianceRatio,
      peakMotionTimestamp, motionSource: nonzeroSamples.length > raw.velocity_curve.length * 0.1 ? "python_velocity" : "missing",
      motionSampleCount: raw.velocity_curve.length, nonzeroMotionSampleCount: nonzeroSamples.length,
      pythonShots: raw.shots, velocitySamples: raw.velocity_curve,
      dominantPalette: raw.dominant_palette ?? [], audio: raw.audio ?? null,
    };
  } catch (err) {
    console.error(`[python-velocity] Analysis failed: ${(err as Error).message}`);
    return {
      motionEnergyProfile1s: [], shotMotionProfile: [], earlyEnergy: 0, lateEnergy: 0, energyVarianceRatio: 1,
      motionSource: "error", motionSampleCount: 0, nonzeroMotionSampleCount: 0,
      pythonShots: [], velocitySamples: [], dominantPalette: [], audio: null,
    };
  }
}
```

---

# TIER 2 — Perception

## workers/python-ai/workers/deep_analysis.py (374 lines)

```python
"""
Deep video analysis pipeline — Single-Pass Optimized.
PySceneDetect (AdaptiveDetector) + OpenCV optical flow + Librosa + HSV color grading.
All free, runs on CPU, no API calls.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field, asdict
from typing import Optional

import cv2
import numpy as np


@dataclass
class Shot:
    index: int
    start_time: float
    end_time: float
    duration: float
    start_frame: int
    end_frame: int


@dataclass
class VelocitySample:
    timestamp: float
    magnitude: float


@dataclass
class ColorSample:
    timestamp: float
    brightness: float
    saturation: float
    contrast: float
    temperature: float


@dataclass
class FlashFrame:
    timestamp: float
    frame_index: int
    brightness: float
    flash_type: str


@dataclass
class BeatInfo:
    bpm: float
    beats: list[float]
    onsets: list[float]


@dataclass
class AnalysisResult:
    total_duration: float
    fps: float
    total_frames: int
    width: int
    height: int
    shots: list[dict]
    velocity_curve: list[dict]
    color_samples: list[dict]
    flash_frames: list[dict]
    audio: Optional[dict]
    cut_frequency: float
    avg_shot_duration: float
    shot_duration_variance: float
    pacing: str
    dominant_palette: list[str]
    summary: dict = field(default_factory=dict)


FLOW_W = 320
FLOW_H = 180


def get_video_info(video_path: str) -> dict:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", video_path],
            capture_output=True, text=True, timeout=30,
        )
        info = json.loads(result.stdout)
        vs = next((s for s in info.get("streams", []) if s["codec_type"] == "video"), None)
        if not vs:
            return {"fps": 30, "total_frames": 0, "width": 0, "height": 0, "duration": 0}
        fps_parts = vs.get("r_frame_rate", "30/1").split("/")
        fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 30.0
        duration = float(info.get("format", {}).get("duration", 0))
        return {
            "fps": fps,
            "total_frames": int(vs.get("nb_frames", 0) or duration * fps),
            "width": int(vs.get("width", 0)),
            "height": int(vs.get("height", 0)),
            "duration": duration,
        }
    except Exception:
        return {"fps": 30, "total_frames": 0, "width": 0, "height": 0, "duration": 0}


def detect_shots_pyscenedetect(video_path: str) -> list[Shot]:
    try:
        from scenedetect import detect, AdaptiveDetector
        scene_list = detect(video_path, AdaptiveDetector(
            adaptive_threshold=3.5, min_scene_len=45,
        ))
        return [
            Shot(index=i, start_time=s.get_seconds(), end_time=e.get_seconds(),
                 duration=e.get_seconds() - s.get_seconds(),
                 start_frame=s.get_frames(), end_frame=e.get_frames())
            for i, (s, e) in enumerate(scene_list)
        ]
    except Exception:
        return detect_shots_ffmpeg(video_path)


def detect_shots_ffmpeg(video_path: str) -> list[Shot]:
    try:
        info = get_video_info(video_path)
        fps = info["fps"]
        result = subprocess.run(
            ["ffmpeg", "-i", video_path, "-vf", "select='gt(scene,0.3)',showinfo",
             "-vsync", "vfr", "-f", "null", "-"],
            capture_output=True, text=True, timeout=120,
        )
        import re
        timestamps = [float(m) for m in re.findall(r"pts_time:\s*([\d.]+)", result.stderr or "")]
        timestamps = [0.0] + sorted(set(timestamps)) + [info["duration"]]
        min_shot_duration = 0.5
        merged = [timestamps[0]]
        for ts in timestamps[1:-1]:
            if ts - merged[-1] >= min_shot_duration:
                merged.append(ts)
        merged.append(timestamps[-1])
        return [
            Shot(index=i, start_time=merged[i], end_time=merged[i + 1],
                 duration=merged[i + 1] - merged[i],
                 start_frame=int(merged[i] * fps), end_frame=int(merged[i + 1] * fps))
            for i in range(len(merged) - 1)
        ]
    except Exception:
        return []


def extract_all_frame_metrics(
    video_path: str,
    flow_interval: int = 3,
    color_interval: int = 5,
    palette_interval: int = 5,
) -> tuple[list[VelocitySample], list[ColorSample], list[float], list[int], np.ndarray]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return [], [], [], [], np.empty((0, 3), dtype=np.float32)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    velocity_samples: list[VelocitySample] = []
    color_samples: list[ColorSample] = []
    brightness_timeline: list[float] = []
    brightness_indices: list[int] = []
    palette_pixels: list[np.ndarray] = []
    prev_flow_gray: Optional[np.ndarray] = None
    flow_counter = 0
    color_counter = 0
    palette_counter = 0
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        ts = frame_idx / fps
        gray_full = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness_timeline.append(float(np.mean(gray_full) / 255.0))
        brightness_indices.append(frame_idx)

        flow_counter += 1
        if flow_counter >= flow_interval:
            flow_small = cv2.resize(gray_full, (FLOW_W, FLOW_H))
            if prev_flow_gray is not None and flow_small.shape == prev_flow_gray.shape:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_flow_gray, flow_small, None,
                    pyr_scale=0.5, levels=2, winsize=11,
                    iterations=2, poly_n=5, poly_sigma=1.2, flags=0,
                )
                mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
                velocity_samples.append(VelocitySample(timestamp=ts, magnitude=float(np.mean(mag))))
            prev_flow_gray = flow_small
            flow_counter = 0

        color_counter += 1
        if color_counter >= color_interval:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            brightness = float(np.mean(hsv[:, :, 2]) / 255.0)
            saturation = float(np.mean(hsv[:, :, 1]) / 255.0)
            contrast = float(np.std(gray_full) / 128.0)
            b_ch, _, r_ch = cv2.split(frame)
            temperature = float((np.mean(r_ch) - np.mean(b_ch)) / 255.0)
            color_samples.append(ColorSample(
                timestamp=ts, brightness=brightness, saturation=saturation,
                contrast=contrast, temperature=temperature,
            ))
            color_counter = 0

        palette_counter += 1
        if palette_counter >= palette_interval:
            palette_pixels.append(cv2.resize(frame, (16, 16)).reshape(-1, 3))
            palette_counter = 0

        frame_idx += 1

    cap.release()
    return (
        velocity_samples, color_samples, brightness_timeline, brightness_indices,
        np.vstack(palette_pixels) if palette_pixels else np.empty((0, 3), dtype=np.float32),
    )


def detect_flash_from_timeline(brightness_timeline: list[float], brightness_indices: list[int], fps: float) -> list[FlashFrame]:
    if len(brightness_timeline) < 3:
        return []
    arr = np.array(brightness_timeline)
    mean = np.mean(arr)
    std = np.std(arr)
    flashes: list[FlashFrame] = []
    for i in range(1, len(arr) - 1):
        curr, prev, nxt = arr[i], arr[i - 1], arr[i + 1]
        if prev == 0 or nxt == 0:
            continue
        if curr / prev > 2.5 and curr / nxt > 2.5 and curr > mean + 2 * std:
            flashes.append(FlashFrame(timestamp=brightness_indices[i] / fps, frame_index=brightness_indices[i], brightness=float(curr), flash_type="white"))
        elif curr / prev < 0.4 and curr / nxt < 0.4 and curr < mean - 2 * std:
            flashes.append(FlashFrame(timestamp=brightness_indices[i] / fps, frame_index=brightness_indices[i], brightness=float(curr), flash_type="black"))
    return flashes


def cluster_palette(palette_pixels: np.ndarray, n_colors: int = 5) -> list[str]:
    if palette_pixels.shape[0] < n_colors:
        return []
    try:
        from sklearn.cluster import MiniBatchKMeans
        kmeans = MiniBatchKMeans(n_clusters=n_colors, n_init=3, max_iter=100, random_state=42, batch_size=min(1024, palette_pixels.shape[0]))
        kmeans.fit(palette_pixels.astype(np.float32))
        return [f"#{int(c[2]):02x}{int(c[1]):02x}{int(c[0]):02x}" for c in kmeans.cluster_centers_]
    except ImportError:
        return []
    except Exception:
        return []


def analyze_audio(video_path: str) -> Optional[BeatInfo]:
    try:
        import librosa
        y, sr = librosa.load(video_path, sr=22050, mono=True)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0]) if len(tempo) > 0 else 120.0
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()
        return BeatInfo(bpm=bpm, beats=beat_times, onsets=onset_times)
    except Exception:
        return None


def classify_pacing(cut_frequency: float, avg_shot_duration: float) -> str:
    if cut_frequency > 2.0 or avg_shot_duration < 0.5:
        return "frantic"
    if cut_frequency > 1.0 or avg_shot_duration < 1.0:
        return "fast"
    if cut_frequency > 0.5 or avg_shot_duration < 2.0:
        return "medium"
    return "slow"


def run_deep_analysis(video_path: str, audio_path: Optional[str] = None) -> dict:
    info = get_video_info(video_path)
    shots = detect_shots_pyscenedetect(video_path)
    velocity, color_samples, bright_tl, bright_idx, palette_px = extract_all_frame_metrics(
        video_path, flow_interval=3, color_interval=5, palette_interval=5,
    )
    flash_frames = detect_flash_from_timeline(bright_tl, bright_idx, info["fps"])
    palette = cluster_palette(palette_px)
    audio = analyze_audio(audio_path or video_path)

    durations = [s.duration for s in shots]
    avg_dur = float(np.mean(durations)) if durations else 0
    var = float(np.var(durations)) if durations else 0
    cut_freq = len(shots) / info["duration"] if info["duration"] > 0 else 0
    pacing = classify_pacing(cut_freq, avg_dur)

    result = AnalysisResult(
        total_duration=info["duration"], fps=info["fps"],
        total_frames=info["total_frames"], width=info["width"], height=info["height"],
        shots=[asdict(s) for s in shots],
        velocity_curve=[asdict(v) for v in velocity],
        color_samples=[asdict(c) for c in color_samples],
        flash_frames=[asdict(f) for f in flash_frames],
        audio=asdict(audio) if audio else None,
        cut_frequency=cut_freq, avg_shot_duration=avg_dur,
        shot_duration_variance=var, pacing=pacing,
        dominant_palette=palette,
        summary={
            "shot_count": len(shots), "velocity_samples": len(velocity),
            "color_samples": len(color_samples), "flash_frame_count": len(flash_frames),
            "has_audio": audio is not None, "bpm": audio.bpm if audio else None,
            "palette_colors": len(palette),
        },
    )
    return asdict(result)


# --- Backwards compatibility wrappers ---
def compute_optical_flow(video_path: str, sample_interval: int = 3) -> list[VelocitySample]:
    velocity, _, _, _, _ = extract_all_frame_metrics(video_path, flow_interval=sample_interval, color_interval=999999, palette_interval=999999)
    return velocity

def extract_color_samples(video_path: str, sample_interval: int = 5) -> list[ColorSample]:
    _, color_samples, _, _, _ = extract_all_frame_metrics(video_path, flow_interval=999999, color_interval=sample_interval, palette_interval=999999)
    return color_samples

def detect_flash_frames(video_path: str, sample_interval: int = 1) -> list[FlashFrame]:
    info = get_video_info(video_path)
    _, _, bright_tl, bright_idx, _ = extract_all_frame_metrics(video_path, flow_interval=999999, color_interval=999999, palette_interval=999999)
    return detect_flash_from_timeline(bright_tl, bright_idx, info["fps"])

def extract_dominant_palette(video_path: str, n_colors: int = 5, sample_frames: int = 20) -> list[str]:
    _, _, _, _, palette_px = extract_all_frame_metrics(video_path, flow_interval=999999, color_interval=999999, palette_interval=1)
    return cluster_palette(palette_px, n_colors=n_colors)
```

---

## src/server/services/reference-analysis-service.ts (830 lines)

[Full code already shown above — orchestrates Python velocity bridge, FFmpeg scene detection, LLM vision, effect/color/velocity extraction, structural analysis, rhythm splits, climax detection, intent mapping]

---

## src/server/lib/scene-detection.ts (315 lines)

[Full code already shown above — FFmpeg scene detection, short-shot merging, thumbnail extraction]

---

## src/server/lib/reference-effect-extractor.ts (361 lines)

[Full code already shown above — per-shot effect vocabulary: impact_flash, context_shake, speed_ramp, whip_pan, color_pulse, push_in]

---

## src/server/lib/reference-color-extractor.ts (142 lines)

[Full code already shown above — color grade keyframe extraction with smoothing and threshold detection]

---

## src/server/lib/reference-velocity-extractor.ts (174 lines)

[Full code already shown above — U-ramp velocity detection, beat snapping, easing classification]

---

# TIER 3 — Execution

## src/server/director/enhance-edl-with-style.ts (357 lines)

[Full code already shown above — role-based effect placement (ramp/hit/glide), legacy fallback, GPU effects, timing adjustment]

---

## src/server/director/style-directives.ts (234 lines)

[Full code already shown above — StyleDirectives type, compileReferenceStyleToDirectives, tempo mode overrides]

---

## src/server/lib/reference-style-enforcer.ts (158 lines)

[Full code already shown above — shot duration scaling, transition mix enforcement, effects density, beat lock]

---

## src/server/lib/reference-effect-injector.ts (277 lines)

[Full code already shown above — maps reference effects to EDL effects, injects flash frames, velocity ramps, transition distribution]

---

## src/server/lib/reference-color-injector.ts (86 lines)

[Full code already shown above — interpolates color grades across shots using bracketing keyframes]

---

# TIER 4 — Ground Truth + Evaluation

## src/server/lib/style-match-scorer.ts (175 lines)

```typescript
import type { MonetEDL } from "../types/edl";
import type { ReferenceStyle } from "../types/reference-style";

interface StyleMatchScore {
  total: number;
  breakdown: { shotDuration: number; cutFrequency: number; effectVocabulary: number; transitionStyle: number; };
  details: string[];
}

function scoreShotDuration(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  if (edl.shots.length === 0) return { score: 0, detail: "No shots in EDL" };
  const totalDuration = edl.shots.reduce((sum, s) => sum + s.timing.duration, 0);
  const edlAvg = totalDuration / edl.shots.length;
  const refAvg = reference.rhythm.avgShotDuration;
  const diff = Math.abs(edlAvg - refAvg);
  const tolerance = refAvg * 0.3;
  if (diff <= tolerance * 0.5) return { score: 25, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (excellent)` };
  if (diff <= tolerance) return { score: 20, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (good)` };
  if (diff <= tolerance * 2) return { score: 15, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (fair)` };
  if (diff <= tolerance * 3) return { score: 10, detail: `Shot duration match: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s (poor)` };
  return { score: 5, detail: `Shot duration mismatch: ${edlAvg.toFixed(2)}s vs ${refAvg.toFixed(2)}s` };
}

function scoreCutFrequency(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  if (edl.timeline.duration <= 0) return { score: 0, detail: "Zero duration timeline" };
  const edlCutsPerSec = edl.shots.length / edl.timeline.duration;
  const refCutsPerSec = 1 / reference.rhythm.avgShotDuration;
  const diff = Math.abs(edlCutsPerSec - refCutsPerSec);
  const tolerance = refCutsPerSec * 0.3;
  if (diff <= tolerance * 0.5) return { score: 25, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (excellent)` };
  if (diff <= tolerance) return { score: 20, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (good)` };
  if (diff <= tolerance * 2) return { score: 15, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (fair)` };
  if (diff <= tolerance * 3) return { score: 10, detail: `Cut frequency match: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s (poor)` };
  return { score: 5, detail: `Cut frequency mismatch: ${edlCutsPerSec.toFixed(2)}/s vs ${refCutsPerSec.toFixed(2)}/s` };
}

function scoreEffectVocabulary(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  const refEffects = new Set(reference.effects.commonEffects.map(e => e.toLowerCase()));
  if (reference.effectVocabulary) {
    for (const shot of reference.effectVocabulary) {
      for (const e of shot.effects) refEffects.add(e.type.toLowerCase());
    }
  }
  const edlEffects = new Set<string>();
  for (const shot of edl.shots) {
    if (shot.effects) {
      for (const effect of shot.effects) edlEffects.add(effect.type.toLowerCase());
    }
  }
  if (refEffects.size === 0 && edlEffects.size === 0) return { score: 25, detail: "No effects in either (neutral match)" };
  if (refEffects.size === 0) return { score: 10, detail: `EDL has ${edlEffects.size} effects but reference has none` };
  if (edlEffects.size === 0) return { score: 5, detail: "EDL has no effects but reference expects effects" };
  const matched = Array.from(refEffects).filter(e => edlEffects.has(e));
  const coverage = matched.length / refEffects.size;
  const score = Math.round(5 + coverage * 20);
  return { score: Math.min(25, Math.max(5, score)), detail: `Effect vocabulary: ${matched.length}/${refEffects.size} reference effects used (${(coverage * 100).toFixed(0)}%)` };
}

function scoreTransitionStyle(edl: MonetEDL, reference: ReferenceStyle): { score: number; detail: string } {
  let cuts = 0, crossfades = 0, other = 0, withTransition = 0;
  for (const shot of edl.shots) {
    if (shot.transition) {
      withTransition++;
      const t = shot.transition.type.toLowerCase();
      if (t === "cut") cuts++;
      else if (t === "crossfade" || t === "dissolve") crossfades++;
      else other++;
    }
  }
  const total = withTransition > 0 ? withTransition : edl.shots.length;
  if (total === 0) return { score: 15, detail: "No transition data available" };
  const edlCutPct = cuts / total;
  const refCutPct = reference.effects.transitionsBreakdown.cutPercentage;
  const diff = Math.abs(edlCutPct - refCutPct);
  const tolerance = 0.15;
  if (diff <= tolerance * 0.5) return { score: 25, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (excellent)` };
  if (diff <= tolerance) return { score: 20, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (good)` };
  if (diff <= tolerance * 2) return { score: 15, detail: `Transition style match: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}% (fair)` };
  return { score: 10, detail: `Transition style mismatch: ${(edlCutPct * 100).toFixed(0)}% cuts vs ${(refCutPct * 100).toFixed(0)}%` };
}

export function scoreStyleMatch(edl: MonetEDL, referenceStyle: ReferenceStyle): StyleMatchScore {
  const details: string[] = [];
  const shotDuration = scoreShotDuration(edl, referenceStyle);
  const cutFrequency = scoreCutFrequency(edl, referenceStyle);
  const effectVocabulary = scoreEffectVocabulary(edl, referenceStyle);
  const transitionStyle = scoreTransitionStyle(edl, referenceStyle);
  details.push(shotDuration.detail, cutFrequency.detail, effectVocabulary.detail, transitionStyle.detail);
  return {
    total: shotDuration.score + cutFrequency.score + effectVocabulary.score + transitionStyle.score,
    breakdown: { shotDuration: shotDuration.score, cutFrequency: cutFrequency.score, effectVocabulary: effectVocabulary.score, transitionStyle: transitionStyle.score },
    details,
  };
}
```

---

# MISSING / NOT YET BUILT

- **scripts/analyzers/dna_blender.py** — Does not exist. Python analyzer outputs are merged in TypeScript via `reference-analysis-service.ts`.
- **scripts/analyzers/effect_detector.py** — Does not exist. Effect detection is in TypeScript via `reference-effect-extractor.ts`.
- **Raw-clip analysis / clip-scoring** — Exists in the footage analysis pipeline (`/api/analyze` + Gemini vision), not as a standalone script.
- **Handcrafted reference EDL** — No `curry-handcrafted-edl.json` exists.
- **AI-generated replica EDL** — No `spiderman-replica-edl.json` exists.
- **StyleMatchReport diff code** — `style-match-scorer.ts` exists but no runtime comparison view in Style Lab yet.
- **Style DNA archetype libraries** — Exist at `src/lib/style-dna/library/` (tarantino-dialogue.ts, cinematic-noir.ts, spiderverse-action.ts) but not included in this dump as they're optional context.
