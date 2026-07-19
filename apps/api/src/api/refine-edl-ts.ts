/**
 * TypeScript EDL Refinement — unified path for GAP-002.
 *
 * Instead of shelling out to Python's monet_refine.py (which uses its own
 * action vocabulary), this calls the LLM directly and applies DirectorActions
 * to the EDL using the same action types as the Kove Director compiler.
 *
 * Flow: EDL → LLM → DirectorActions → mutate EDL → refined EDL
 */

import type { ProjectEDL } from "@monet/edl";
import type { DirectorAction } from "@kove/director";
import { compileDirectorOutput, edlToDirectorOutput } from "@kove/director";
import { convertEDLToOpenReelProject } from "@monet/openreel-adapter";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// LLM call — tries Cerebras → Groq → NVIDIA NIM → DO
// ---------------------------------------------------------------------------

interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

function getProviders(): LLMProvider[] {
  return [
    { name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", apiKey: process.env.CEREBRAS_API_KEY, model: "llama-3.3-70b" },
    { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" },
    { name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_NIM_API_KEY, model: process.env.NVIDIA_NIM_MODEL || "moonshotai/kimi-k2.6" },
    { name: "DigitalOcean", baseUrl: "https://inference.do-ai.run/v1", apiKey: process.env.DIGITALOCEAN_API_KEY, model: "mimo-v2.5" },
  ];
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
): Promise<string | null> {
  for (const provider of getProviders()) {
    if (!provider.apiKey) continue;

    try {
      console.log(`[refine-ts] Trying ${provider.name} (${provider.model})`);
      const t0 = Date.now();

      const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!resp.ok) {
        console.warn(`[refine-ts] ${provider.name} returned ${resp.status}`);
        continue;
      }

      const result = (await resp.json()) as {
        choices: Array<{ message: { content?: string } }>;
      };
      const text = result.choices?.[0]?.message?.content ?? "";
      // Strip thinking blocks
      const cleaned = text.replace(new RegExp("<think>[\\s\\S]*?<\\/think>", "g"), "").trim();
      console.log(`[refine-ts] ${provider.name}: ${cleaned.length} chars (${Date.now() - t0}ms)`);
      return cleaned || null;
    } catch (err) {
      console.warn(`[refine-ts] ${provider.name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Action application — mutate EDL based on DirectorActions
// ---------------------------------------------------------------------------

function applyActionsToEdl(edl: ProjectEDL, actions: DirectorAction[]): ProjectEDL {
  // Deep clone to avoid mutating the original
  const result: ProjectEDL = JSON.parse(JSON.stringify(edl));

  for (const action of actions) {
    switch (action.type) {
      case "clip.add": {
        const params = action.params as Record<string, unknown>;
        const trackId = (params.trackId as string) || "video-main";
        const track = result.timeline.tracks.find((t) => t.id === trackId);
        if (!track) continue;

        track.clips.push({
          id: `clip-${crypto.randomUUID().slice(0, 8)}`,
          mediaId: (params.mediaId as string) || "footage-main",
          startTime: (params.startTime as number) || 0,
          duration: (params.duration as number) || 1,
          inPoint: (params.inPoint as number) || 0,
          outPoint: (params.outPoint as number) || 1,
          speed: (params.speed as number) || 1,
          transforms: { position: [], scale: [], rotation: [] },
          audio: { gain: 1 },
          effects: [],
        });
        break;
      }

      case "clip.remove": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        for (const track of result.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx >= 0) {
            const removed = track.clips[idx];
            track.clips.splice(idx, 1);
            // Ripple: shift subsequent clips back
            if (params.ripple !== false) {
              for (let i = idx; i < track.clips.length; i++) {
                track.clips[i].startTime -= removed.duration;
              }
            }
            break;
          }
        }
        break;
      }

      case "clip.speed": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        const speed = params.speed as number;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip && speed != null) {
            clip.speed = speed;
            break;
          }
        }
        break;
      }

      case "clip.transform": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) continue;
          if (params.speed != null) clip.speed = params.speed as number;
          if (params.start != null) clip.inPoint = params.start as number;
          if (params.end != null) clip.outPoint = params.end as number;
          if (params.duration != null) clip.duration = params.duration as number;
          break;
        }
        break;
      }

      case "effect.custom":
      case "effect.apply-preset": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.targetId as string;
        const effectType = (params.effectType as string) || (params.preset as string);
        if (!clipId || !effectType) continue;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            clip.effects.push({
              id: `effect-${crypto.randomUUID().slice(0, 8)}`,
              type: effectType,
              start: 0,
              duration: clip.duration,
              params: (params.params as Record<string, unknown>) || {},
            });
            break;
          }
        }
        break;
      }

      case "effect.keyframe": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            clip.effects.push({
              id: `kf-${crypto.randomUUID().slice(0, 8)}`,
              type: (params.effectType as string) || "keyframe",
              start: (params.atTime as number) || 0,
              duration: (params.duration as number) || clip.duration,
              params: (params.params as Record<string, unknown>) || {},
            });
            break;
          }
        }
        break;
      }

      case "transition.add": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            clip.effects.push({
              id: `trans-${crypto.randomUUID().slice(0, 8)}`,
              type: (params.transitionType as string) || "crossfade",
              start: 0,
              duration: (params.duration as number) || 0.5,
              params: {},
            });
            break;
          }
        }
        break;
      }

      case "audio.fade": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            clip.audio = {
              ...clip.audio,
              fadeIn: params.fadeIn as number | undefined,
              fadeOut: params.fadeOut as number | undefined,
            };
            break;
          }
        }
        break;
      }

      case "audio.set-volume": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        const gain = params.gain as number;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip && gain != null) {
            clip.audio = { ...clip.audio, gain };
            break;
          }
        }
        break;
      }

      case "color.grade": {
        const params = action.params as Record<string, unknown>;
        const clipId = params.clipId as string;
        for (const track of result.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            clip.effects.push({
              id: `grade-${crypto.randomUUID().slice(0, 8)}`,
              type: "color-grading",
              start: 0,
              duration: clip.duration,
              params: {
                saturation: params.saturation,
                contrast: params.contrast,
                brightness: params.brightness,
                temperature: params.temperature,
                tint: params.tint,
              },
            });
            break;
          }
        }
        break;
      }

      case "subtitle.auto": {
        const params = action.params as Record<string, unknown>;
        // Add subtitle track if missing
        let subTrack = result.timeline.tracks.find((t) => t.type === "text");
        if (!subTrack) {
          subTrack = {
            id: "text-subtitles",
            type: "text",
            order: result.timeline.tracks.length,
            locked: false,
            hidden: false,
            clips: [],
          };
          result.timeline.tracks.push(subTrack);
        }
        subTrack.clips.push({
          id: `sub-${crypto.randomUUID().slice(0, 8)}`,
          mediaId: "subtitle",
          startTime: (params.startTime as number) || 0,
          duration: (params.duration as number) || 2,
          inPoint: 0,
          outPoint: (params.duration as number) || 2,
          transforms: { position: [], scale: [], rotation: [] },
          audio: { gain: 1 },
          effects: [{
            id: `sub-style-${crypto.randomUUID().slice(0, 8)}`,
            type: "subtitle-style",
            start: 0,
            duration: (params.duration as number) || 2,
            params: {
              text: params.text,
              style: params.style,
              animation: params.animation,
            },
          }],
        });
        break;
      }

      // Actions that don't directly mutate EDL clips
      case "timeline.build":
      case "timeline.clear":
      case "track/create":
      case "track/remove":
      case "marker.add":
      case "audio.beat-sync":
      case "audio.ducking":
      case "stabilize":
      case "reframe":
        // These are structural; handled at a higher level or no-op for refinement
        break;
    }
  }

  // Recalculate timeline duration
  let maxEnd = 0;
  for (const track of result.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  result.timeline.duration = maxEnd;

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const REFINE_SYSTEM_PROMPT = `You are a video editing AI. You receive the current EDL (Edit Decision List) \
of a video project and a user refinement request. You must output a JSON array \
of actions to apply to the EDL.

Supported action types:
- {"type":"clip.speed","params":{"clipId":"...","speed":0.5}} — change clip speed
- {"type":"clip.transform","params":{"clipId":"...","start":0.5,"end":2.0}} — trim clip
- {"type":"clip.remove","params":{"clipId":"...","ripple":true}} — remove clip (ripple closes gap)
- {"type":"effect.custom","params":{"targetId":"...","effectType":"vignette","params":{}}} — add effect
- {"type":"effect.custom","params":{"targetId":"...","effectType":"push_in","params":{}}} — Ken Burns zoom
- {"type":"effect.custom","params":{"targetId":"...","effectType":"context_shake","params":{}}} — camera shake
- {"type":"effect.custom","params":{"targetId":"...","effectType":"impact_flash","params":{}}} — flash
- {"type":"effect.custom","params":{"targetId":"...","effectType":"color_pulse","params":{}}} — color pulse
- {"type":"effect.custom","params":{"targetId":"...","effectType":"whip_pan","params":{}}} — whip pan
- {"type":"transition.add","params":{"clipId":"...","transitionType":"crossfade","duration":0.5}} — add transition
- {"type":"audio.fade","params":{"clipId":"...","fadeIn":0.5,"fadeOut":0.5}} — fade
- {"type":"audio.set-volume","params":{"clipId":"...","gain":0.5}} — volume
- {"type":"color.grade","params":{"clipId":"...","saturation":1.2,"contrast":1.1}} — color grade
- {"type":"subtitle.auto","params":{"text":"Hello","startTime":1.0,"duration":2.0}} — add subtitle

RULES:
- Output ONLY a valid JSON array of actions. No markdown, no explanation.
- Each action must reference a real clipId from the EDL.
- If the request is unclear, make your best interpretation.
- Prefer minimal changes — don't over-edit.
- One effect per clip max unless explicitly requested.`;

export interface RefineResult {
  edl: ProjectEDL;
  actions: DirectorAction[];
  reasoning: string;
}

export async function refineEdlTypeScript(
  currentEdl: ProjectEDL,
  prompt: string,
  scopeClipIds?: string[],
): Promise<RefineResult> {
  // Convert EDL to a compact representation for the LLM
  const edlSummary = summarizeEdl(currentEdl, scopeClipIds);

  const userPrompt = `Current EDL:\n${edlSummary}\n\nRefinement request: ${prompt}`;

  const response = await callLLM(REFINE_SYSTEM_PROMPT, userPrompt);
  if (!response) {
    throw new Error("All LLM providers failed for refinement");
  }

  // Parse actions from LLM response
  let actions: DirectorAction[];
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      actions = JSON.parse(jsonMatch[0]);
    } else {
      const parsed = JSON.parse(response);
      actions = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {
    throw new Error(`Failed to parse LLM response as actions: ${response.slice(0, 200)}`);
  }

  // Validate actions have required fields
  actions = actions.filter(
    (a) => a && typeof a.type === "string" && a.params && typeof a.params === "object",
  );

  if (actions.length === 0) {
    return { edl: currentEdl, actions: [], reasoning: "No applicable actions generated" };
  }

  // Apply actions to EDL
  const refinedEdl = applyActionsToEdl(currentEdl, actions);

  return {
    edl: refinedEdl,
    actions,
    reasoning: `Applied ${actions.length} actions via TypeScript refinement path`,
  };
}

function summarizeEdl(edl: ProjectEDL, scopeClipIds?: string[]): string {
  const lines: string[] = [];
  lines.push(`Duration: ${edl.timeline.duration.toFixed(1)}s`);
  lines.push(`Tracks: ${edl.timeline.tracks.length}`);

  for (const track of edl.timeline.tracks) {
    lines.push(`\nTrack: ${track.id} (${track.type})`);
    for (const clip of track.clips) {
      // If scoped, only show clips in scope
      if (scopeClipIds && !scopeClipIds.includes(clip.id)) continue;

      const effects = clip.effects?.length
        ? ` effects=[${clip.effects.map((e) => e.type).join(",")}]`
        : "";
      lines.push(
        `  ${clip.id}: ${clip.startTime.toFixed(1)}-${(clip.startTime + clip.duration).toFixed(1)}s ` +
        `speed=${clip.speed}${effects}`,
      );
    }
  }

  return lines.join("\n");
}
