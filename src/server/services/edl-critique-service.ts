// src/server/services/edl-critique-service.ts
import type { Env } from "../types/env";
import { getAIService } from "./ai-service";
import { loadPromptTemplate } from "../prompts";
import type { IntentExtractionResult } from "../types/intent";
import type { MusicStructure } from "./music-structure-service";

export interface EDLCritique {
  score: number;
  verdict: string;
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    description: string;
    affectedShotIds: string[];
  }>;
  patches: Array<{
    op:
      | "replace_shot"
      | "remove_shot"
      | "retime_shot"
      | "add_effect"
      | "remove_effect"
      | "adjust_pacing";
    targetShotId: string;
    params: Record<string, unknown>;
  }>;
}

const CRITIQUE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    verdict: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          category: { type: "string" },
          description: { type: "string" },
          affectedShotIds: { type: "array", items: { type: "string" } },
        },
        required: ["severity", "category", "description", "affectedShotIds"],
      },
    },
    patches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: [
              "replace_shot",
              "remove_shot",
              "retime_shot",
              "add_effect",
              "remove_effect",
              "adjust_pacing",
            ],
          },
          targetShotId: { type: "string" },
          params: { type: "object" },
        },
        required: ["op", "targetShotId", "params"],
      },
    },
  },
  required: ["score", "verdict", "issues", "patches"],
} as const;

export async function critiqueEDL(
  env: Env,
  draftEdl: any,
  intent: IntentExtractionResult,
  musicStructure: MusicStructure | null,
): Promise<EDLCritique> {
  const template = loadPromptTemplate("critique-edl.txt");
  const prompt = template
    .replace("{{DRAFT_EDL}}", JSON.stringify(draftEdl))
    .replace("{{INTENT}}", JSON.stringify(intent.intent))
    .replace("{{PILLAR_WEIGHTS}}", JSON.stringify(intent.pillarWeights))
    .replace("{{DIRECTOR_PARAMS}}", JSON.stringify(intent.directorParams))
    .replace(
      "{{MUSIC_STRUCTURE}}",
      musicStructure ? JSON.stringify(musicStructure) : "null",
    );

  const ai = getAIService(env);
  const critique = await ai.generateContentJSON<EDLCritique>({
    prompt,
    systemInstruction:
      "You are a senior editor performing a brutal quality audit. Be specific and actionable.",
    stage: "critique",
    temperature: 0.3,
    schema: CRITIQUE_SCHEMA,
  });

  return critique;
}

export function applyPatches(draftEdl: any, patches: EDLCritique["patches"]): any {
  const edl = structuredClone(draftEdl);
  if (!edl.shots) return edl;

  for (const patch of patches) {
    const idx = edl.shots.findIndex((s: any) => s.id === patch.targetShotId);
    if (idx === -1 && patch.op !== "adjust_pacing") continue;

    switch (patch.op) {
      case "remove_shot":
        edl.shots.splice(idx, 1);
        break;

      case "retime_shot": {
        const newStart = (patch.params as any).startTime;
        const newDuration = (patch.params as any).duration;
        if (typeof newStart === "number") edl.shots[idx].timing.startTime = newStart;
        if (typeof newDuration === "number") edl.shots[idx].timing.duration = newDuration;
        break;
      }

      case "add_effect": {
        const eff = (patch.params as any).effect;
        if (eff && Array.isArray(edl.shots[idx].effects)) {
          edl.shots[idx].effects.push(eff);
        }
        break;
      }

      case "remove_effect": {
        const effectType = (patch.params as any).effectType;
        if (Array.isArray(edl.shots[idx].effects)) {
          edl.shots[idx].effects = edl.shots[idx].effects.filter(
            (e: any) => e.type !== effectType,
          );
        }
        break;
      }

      case "replace_shot": {
        const newShot = (patch.params as any).shot;
        if (newShot) edl.shots[idx] = { ...edl.shots[idx], ...newShot };
        break;
      }

      case "adjust_pacing": {
        const factor = (patch.params as any).factor ?? 1.0;
        edl.shots.forEach((s: any) => {
          s.timing.duration *= factor;
        });
        // Re-cascade startTimes
        let cursor = 0;
        edl.shots.forEach((s: any) => {
          s.timing.startTime = cursor;
          cursor += s.timing.duration;
        });
        edl.timeline.duration = cursor;
        break;
      }
    }
  }

  return edl;
}

export async function critiqueAndRefine(
  env: Env,
  draftEdl: any,
  intent: IntentExtractionResult,
  musicStructure: MusicStructure | null,
): Promise<{ refined: any; critique: EDLCritique }> {
  const critique = await critiqueEDL(env, draftEdl, intent, musicStructure);

  // If score >= 85, draft is solid — return as-is
  if (critique.score >= 85 || critique.patches.length === 0) {
    return { refined: draftEdl, critique };
  }

  const refined = applyPatches(draftEdl, critique.patches);
  return { refined, critique };
}
