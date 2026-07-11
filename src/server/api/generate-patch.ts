import fs from "node:fs/promises";
import { MonetEDL, EDLPatch, PreviewFrame } from "../types/edl.js";
import { getAIService } from "../services/ai-service.js";
import { loadPromptTemplate } from "../prompts/index.js";
import { Env } from "../types/env.js";

/**
 * Generates an EDLPatch using Gemini based on feedback, current EDL, and keyframes.
 */
export async function generatePatch(
  currentEDL: MonetEDL,
  feedback: string,
  keyframes: PreviewFrame[],
  env?: Env
): Promise<EDLPatch> {
  const ai = getAIService(env);
  const promptTemplate = loadPromptTemplate("generate-patch.txt");

  const promptParts: any[] = [
    {
      text: `
${promptTemplate}

## Current EDL
\`\`\`json
${JSON.stringify(currentEDL, null, 2)}
\`\`\`

## User Feedback
"${feedback}"

Generate the EDLPatch operations now.
`,
    },
  ];

  // Add images to the multimodal prompt
  for (const frame of keyframes) {
    try {
      // frame.imageUrl can be a local path or a base64 string
      // If it's a local path, read it and convert to base64
      let inlineData;
      if (frame.imageUrl.startsWith("data:image")) {
        const [header, data] = frame.imageUrl.split(",");
        const mimeType = header.split(":")[1].split(";")[0];
        inlineData = {
          data,
          mimeType,
        };
      } else {
        const buffer = await fs.readFile(frame.imageUrl);
        inlineData = {
          data: buffer.toString("base64"),
          mimeType: "image/jpeg",
        };
      }

      promptParts.push({
        inlineData,
      });
      promptParts.push({
        text: `Screenshot at ${frame.timestamp}s`,
      });
    } catch (error) {
      console.warn(`Could not load keyframe at ${frame.imageUrl}:`, error);
    }
  }

  const patch = await ai.generateContentJSON<EDLPatch>({
    prompt: promptParts as unknown as string,
    temperature: 0.1, // Even lower for maximum precision
    schema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["modify", "add", "remove", "reorder"] },
              target: { type: "string" },
              property: { type: "string" },
              value: { type: "any" },
              element: { type: "object" },
              newIndex: { type: "number" },
            },
            required: ["op", "target"],
          },
        },
      },
      required: ["operations"],
    },
  });

  return validatePatch(patch, currentEDL);
}

/**
 * Self-validation logic to ensure the patch is safe to apply.
 */
function validatePatch(patch: EDLPatch, edl: MonetEDL): EDLPatch {
  const validOps = patch.operations.filter((op) => {
    // 1. Check if target exists for modify/remove/reorder
    if (op.op !== "add") {
      const target = findTarget(edl, op.target);
      if (!target) {
        console.warn(`Validation: Target ${op.target} not found for ${op.op}. Removing operation.`);
        return false;
      }

      // 2. For modify, check if property exists (shallow check or known paths)
      if (op.op === "modify") {
        if (!op.property) return false;
        // Basic range checks for known properties
        if (op.property === "intensity" || op.property.endsWith(".intensity")) {
          if (typeof op.value !== "number" || op.value < 0 || op.value > 1) {
            console.warn(`Validation: Intensity out of range for ${op.target}.`);
            return false;
          }
        }
      }

      // 3. For reorder, check if newIndex is within bounds
      if (op.op === "reorder") {
        if (typeof op.newIndex !== "number" || op.newIndex < 0) {
          console.warn(`Validation: Invalid newIndex for ${op.target}.`);
          return false;
        }
        // Need to find the container to check upper bound
        const container = findContainer(edl, op.target);
        if (container && op.newIndex >= container.length) {
          console.warn(`Validation: newIndex out of bounds for ${op.target}.`);
          return false;
        }
      }
    } else {
      // 4. For add, check if element has required fields
      if (!op.element || !op.element.type) {
        console.warn(`Validation: Missing element or element type for add operation.`);
        return false;
      }
    }

    return true;
  });

  return { operations: validOps };
}

function findContainer(edl: MonetEDL, targetId: string): any[] | null {
  if (edl.shots.some((s) => s.id === targetId)) return edl.shots;
  if (edl.textOverlays?.some((t) => t.id === targetId)) return edl.textOverlays;

  for (const shot of edl.shots) {
    if (shot.effects?.some((e) => e.id === targetId)) return shot.effects;
  }
  return null;
}

function findTarget(edl: MonetEDL, targetId: string): any {
  if (edl.music && edl.music.id === targetId) return edl.music;
  const shot = edl.shots.find((s) => s.id === targetId);
  if (shot) return shot;

  if (edl.textOverlays) {
    const text = edl.textOverlays.find((t) => t.id === targetId);
    if (text) return text;
  }

  for (const shot of edl.shots) {
    if (shot.effects) {
      const effect = shot.effects.find((e) => e.id === targetId);
      if (effect) return effect;
    }
  }

  return null;
}
