/**
 * Refinement Chat — text-based tweak flow.
 *
 * After an EDL is generated, users can ask for tweaks via text:
 * - "make the montage faster"
 * - "the intro is too long"
 * - "add more slow-mo at the end"
 * - "some transitions feel off"
 *
 * The AI asks clarifying questions when needed, then applies changes.
 */
import type { Env } from "../types/env";
import type { ShotEDL } from "@monet/edl-v3";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RefinementRequest {
  edl: ShotEDL;
  feedback: string;
  clipAnalyses?: Array<{
    clipId: string;
    summary: {
      actionRatio: number;
      closeUpRatio: number;
      totalFaceTime: number;
      highEnergySegments: number;
    };
    segments?: Array<{
      startTime: number;
      endTime: number;
      contentType: string;
      score: number;
    }>;
  }>;
}

export interface RefinementResponse {
  type: "clarification" | "applied" | "error";
  message: string;
  updatedEdl?: ShotEDL;
  changes?: string[];
  clarification?: string;
}

// ── Refinement Engine ───────────────────────────────────────────────────────

/**
 * Process a refinement request.
 *
 * Flow:
 * 1. Parse the feedback to understand intent
 * 2. If ambiguous → ask clarifying question
 * 3. If clear → apply changes to EDL
 * 4. Validate result
 */
export async function refineEDL(
  env: Env,
  request: RefinementRequest,
): Promise<RefinementResponse> {
  const { edl, feedback, clipAnalyses } = request;

  // Step 1: Parse intent
  const intent = parseRefinementIntent(feedback);

  // Step 2: Check if clarification is needed
  if (intent.needsClarification) {
    return {
      type: "clarification",
      message: intent.clarificationQuestion,
      clarification: intent.clarificationQuestion,
    };
  }

  // Step 3: Apply changes
  try {
    const { updatedEdl, changes } = await applyRefinement(edl, intent, clipAnalyses);

    return {
      type: "applied",
      message: `Applied ${changes.length} changes: ${changes.join("; ")}`,
      updatedEdl,
      changes,
    };
  } catch (error) {
    return {
      type: "error",
      message: `Failed to apply refinement: ${(error as Error).message}`,
    };
  }
}

// ── Intent Parsing ──────────────────────────────────────────────────────────

interface RefinementIntent {
  action: "speed_up" | "slow_down" | "shorten" | "lengthen" | "add_effect" |
          "remove_effect" | "change_transition" | "adjust_color" | "reorder" |
          "remove_shot" | "add_shot" | "change_pacing" | "unknown";
  target: string;        // what part of the EDL (all, intro, middle, end, specific shot)
  value: number | string; // the change amount
  needsClarification: boolean;
  clarificationQuestion: string;
}

function parseRefinementIntent(feedback: string): RefinementIntent {
  const lower = feedback.toLowerCase();

  // Speed
  if (/\b(faster|speed up|quick|rapid|hype)\b/.test(lower)) {
    return { action: "speed_up", target: "all", value: 0.8, needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(slower|slow down|calm|relax|breathe)\b/.test(lower)) {
    return { action: "slow_down", target: "all", value: 1.2, needsClarification: false, clarificationQuestion: "" };
  }

  // Duration
  if (/\b(shorter|cut|trim|reduce)\b/.test(lower)) {
    if (/\b(intro|beginning|start|opening)\b/.test(lower)) {
      return { action: "shorten", target: "intro", value: 0.5, needsClarification: false, clarificationQuestion: "" };
    }
    if (/\b(outro|end|ending|closing)\b/.test(lower)) {
      return { action: "shorten", target: "outro", value: 0.5, needsClarification: false, clarificationQuestion: "" };
    }
    return { action: "shorten", target: "all", value: 0.7, needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(longer|extend|stretch)\b/.test(lower)) {
    return { action: "lengthen", target: "all", value: 1.3, needsClarification: false, clarificationQuestion: "" };
  }

  // Effects
  if (/\b(add|include).*\b(slow.?mo|slow motion)\b/.test(lower)) {
    return { action: "add_effect", target: identifyTarget(lower), value: "slow_mo", needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(add|include).*\b(flash|flashback)\b/.test(lower)) {
    return { action: "add_effect", target: identifyTarget(lower), value: "flash", needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(remove|get rid of).*\b(effect|flash|shake)\b/.test(lower)) {
    return { action: "remove_effect", target: identifyTarget(lower), value: "all", needsClarification: false, clarificationQuestion: "" };
  }

  // Transitions
  if (/\b(smooth|crossfade|dissolve)\b/.test(lower) && /\b(transition|cut|between)\b/.test(lower)) {
    return { action: "change_transition", target: "all", value: "crossfade", needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(hard|sharp|quick|abrupt)\b/.test(lower) && /\b(transition|cut)\b/.test(lower)) {
    return { action: "change_transition", target: "all", value: "cut", needsClarification: false, clarificationQuestion: "" };
  }

  // Color
  if (/\b(brighter|lighter)\b/.test(lower)) {
    return { action: "adjust_color", target: "all", value: "brighter", needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(darker|dimmer|moodier)\b/.test(lower)) {
    return { action: "adjust_color", target: "all", value: "darker", needsClarification: false, clarificationQuestion: "" };
  }
  if (/\b(more saturated|vibrant|colorful)\b/.test(lower)) {
    return { action: "adjust_color", target: "all", value: "saturated", needsClarification: false, clarificationQuestion: "" };
  }

  // Specific shot issues
  if (/\b(some|few|several).*\b(text|subtitle|caption|overlay)\b/.test(lower) && /\b(off|wrong|bad|weird|misplaced)\b/.test(lower)) {
    return {
      action: "unknown",
      target: "text_overlays",
      value: "",
      needsClarification: true,
      clarificationQuestion: "Which text/caption specifically looks off? Can you describe what it says or where it appears?",
    };
  }

  if (/\b(the (middle|middle section|middle part))\b/.test(lower) && /\b(slow|boring|drag|long)\b/.test(lower)) {
    return { action: "speed_up", target: "middle", value: 0.7, needsClarification: false, clarificationQuestion: "" };
  }

  if (/\b(the (beginning|intro|start|opening))\b/.test(lower) && /\b(slow|boring|too long)\b/.test(lower)) {
    return { action: "shorten", target: "intro", value: 0.6, needsClarification: false, clarificationQuestion: "" };
  }

  if (/\b(the (end|ending|outro|closer))\b/.test(lower) && /\b(sudden|abrupt|needs more)\b/.test(lower)) {
    return { action: "lengthen", target: "outro", value: 1.5, needsClarification: false, clarificationQuestion: "" };
  }

  // Pacing
  if (/\b(pacing|rhythm|flow)\b/.test(lower) && /\b(off|wrong|bad|weird)\b/.test(lower)) {
    return {
      action: "unknown",
      target: "pacing",
      value: "",
      needsClarification: true,
      clarificationQuestion: "What about the pacing feels off? Is it too fast, too slow, or inconsistent?",
    };
  }

  // Generic "fix" — needs clarification
  if (/\b(fix|improve|make it better|doesn't feel right|not quite)\b/.test(lower)) {
    return {
      action: "unknown",
      target: "general",
      value: "",
      needsClarification: true,
      clarificationQuestion: "What specifically would you like to change? For example: speed, transitions, color, timing of a specific section?",
    };
  }

  // Default: unknown
  return {
    action: "unknown",
    target: "all",
    value: feedback,
    needsClarification: true,
    clarificationQuestion: `I'm not sure what you'd like to change. Could you be more specific? For example:\n- "make it faster" / "slow down the middle"\n- "add slow-mo at the climax"\n- "smooth out the transitions"\n- "the intro is too long"`,
  };
}

function identifyTarget(feedback: string): string {
  if (/\b(intro|beginning|start|opening)\b/.test(feedback)) return "intro";
  if (/\b(outro|end|ending|closing)\b/.test(feedback)) return "outro";
  if (/\b(middle|center|peak|climax)\b/.test(feedback)) return "middle";
  return "all";
}

// ── Change Application ──────────────────────────────────────────────────────

async function applyRefinement(
  edl: ShotEDL,
  intent: RefinementIntent,
  clipAnalyses?: RefinementRequest["clipAnalyses"],
): Promise<{ updatedEdl: ShotEDL; changes: string[] }> {
  // Deep clone
  const updated = JSON.parse(JSON.stringify(edl)) as ShotEDL;
  const changes: string[] = [];

  switch (intent.action) {
    case "speed_up": {
      const factor = typeof intent.value === "number" ? intent.value : 0.8;
      const targets = getTargetShots(updated, intent.target);
      for (const shot of targets) {
        shot.timing.duration *= factor;
        shot.timing.speed = (shot.timing.speed || 1) * (1 / factor);
        changes.push(`Sped up shot "${shot.id}" to ${shot.timing.duration.toFixed(1)}s`);
      }
      renormalize(updated);
      break;
    }

    case "slow_down": {
      const factor = typeof intent.value === "number" ? intent.value : 1.2;
      const targets = getTargetShots(updated, intent.target);
      for (const shot of targets) {
        shot.timing.duration *= factor;
        shot.timing.speed = (shot.timing.speed || 1) * (1 / factor);
        changes.push(`Slowed down shot "${shot.id}" to ${shot.timing.duration.toFixed(1)}s`);
      }
      renormalize(updated);
      break;
    }

    case "shorten": {
      const targets = getTargetShots(updated, intent.target);
      const removeCount = Math.max(1, Math.floor(targets.length * 0.3));
      for (let i = 0; i < removeCount && targets.length > 1; i++) {
        // Remove lowest-score shots
        const worst = targets.reduce((a, b) =>
          (a.meta.importance ?? 0.5) < (b.meta.importance ?? 0.5) ? a : b);
        const idx = updated.shots.findIndex(s => s.id === worst.id);
        if (idx >= 0) {
          updated.shots.splice(idx, 1);
          changes.push(`Removed shot "${worst.id}" (importance=${(worst.meta.importance ?? 0).toFixed(2)})`);
        }
      }
      renormalize(updated);
      break;
    }

    case "lengthen": {
      // Duplicate highest-score shots to extend
      const targets = getTargetShots(updated, intent.target);
      if (targets.length > 0) {
        const best = targets.reduce((a, b) =>
          (a.meta.importance ?? 0.5) > (b.meta.importance ?? 0.5) ? a : b);
        const clone = JSON.parse(JSON.stringify(best));
        clone.id = `${best.id}-extended`;
        const insertIdx = updated.shots.findIndex(s => s.id === best.id) + 1;
        updated.shots.splice(insertIdx, 0, clone);
        changes.push(`Duplicated best shot "${best.id}" to extend ${intent.target}`);
      }
      renormalize(updated);
      break;
    }

    case "add_effect": {
      const targets = getTargetShots(updated, intent.target);
      for (const shot of targets) {
        if (intent.value === "slow_mo") {
          shot.timing.speed = 0.5;
          shot.timing.duration *= 2;
          changes.push(`Added slow-mo to shot "${shot.id}"`);
        } else if (intent.value === "flash") {
          shot.effects.push({
            id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: "impact_flash",
            intensity: 0.7,
          });
          changes.push(`Added flash effect to shot "${shot.id}"`);
        }
      }
      renormalize(updated);
      break;
    }

    case "change_transition": {
      const transType = typeof intent.value === "string" ? intent.value : "crossfade";
      const targets = getTargetShots(updated, intent.target);
      for (const shot of targets) {
        shot.transition = {
          ...shot.transition,
          type: transType as any,
          duration: transType === "cut" ? 0 : 300,
        };
        changes.push(`Changed transition to "${transType}" for shot "${shot.id}"`);
      }
      break;
    }

    case "adjust_color": {
      // Color adjustments would be applied during rendering
      changes.push(`Color adjustment "${intent.value}" will be applied during render`);
      break;
    }
  }

  return { updatedEdl: updated, changes };
}

function getTargetShots(edl: ShotEDL, target: string): typeof edl.shots {
  const shots = edl.shots;
  const third = Math.floor(shots.length / 3);

  switch (target) {
    case "intro": return shots.slice(0, third);
    case "middle": return shots.slice(third, third * 2);
    case "outro": return shots.slice(third * 2);
    default: return shots;
  }
}

function renormalize(edl: ShotEDL): void {
  let t = 0;
  const sorted = [...edl.shots].sort((a, b) => a.timing.startTime - b.timing.startTime);
  for (const shot of sorted) {
    shot.timing.startTime = t;
    t += shot.timing.duration;
  }
  edl.meta.duration = t;
}
