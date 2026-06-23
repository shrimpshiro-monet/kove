import { z } from "zod";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { apiError, ApiErrorCode, jsonResponse } from "../lib/api-response";

const GeminiThinkEffectsRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  duration: z.number().positive(),
  filename: z.string().optional().default("video.mp4"),
});

const EFFECTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    effects: {
      type: "ARRAY",
      description: "List of suggested visual effects to apply at specific times.",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            description: "Type of effect (must be one of the specified supported types: rgb_split, shake, zoom_pulse, glow, invert, gaussian-blur, camera-blur, brightness, contrast, saturation, mirror, mosaic, find_edges, posterize, strobe_light, directional_blur, radial_zoom_blur, echo)."
          },
          intensity: {
            type: "NUMBER",
            description: "Intensity of the effect, usually between 0.0 and 1.0."
          },
          params: {
            type: "OBJECT",
            description: "Optional parameters specific to the effect type.",
            properties: {
              blend: { type: "NUMBER", description: "Invert blend (0-100)" },
              blurriness: { type: "NUMBER", description: "Gaussian blurriness amount" },
              blurRadius: { type: "NUMBER", description: "Camera blur radius" },
              reflectionAngle: { type: "NUMBER", description: "Mirror reflection angle (90 or 180)" },
              horizontalBlocks: { type: "NUMBER", description: "Mosaic horizontal blocks count" },
              verticalBlocks: { type: "NUMBER", description: "Mosaic vertical blocks count" },
              period: { type: "NUMBER", description: "Strobe light flash period in seconds" },
              duration: { type: "NUMBER", description: "Strobe light flash duration in seconds" },
              strobeType: { type: "NUMBER", description: "Strobe type (0: black, 1: invert)" },
              direction: { type: "NUMBER", description: "Directional blur direction angle in degrees" },
              blurLength: { type: "NUMBER", description: "Directional blur length in pixels" },
              decay: { type: "NUMBER", description: "Echo decay rate (0.0 to 1.0)" }
            }
          },
          startTime: {
            type: "NUMBER",
            description: "Start time in seconds of the effect within the video."
          },
          duration: {
            type: "NUMBER",
            description: "Duration in seconds of the effect."
          },
          aiRationale: {
            type: "STRING",
            description: "An in-depth explanation of WHY this effect was chosen (emotional/creative intent) and HOW it contributes to the visual storytelling, specifically addressing how to achieve the look."
          }
        },
        required: ["type", "intensity", "startTime", "duration", "aiRationale"]
      }
    }
  },
  required: ["effects"]
};

export async function handleGeminiThinkEffects(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const validation = GeminiThinkEffectsRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        ApiErrorCode.InvalidRequest,
        "Invalid think request parameters",
        400,
        validation.error
      );
    }

    const { prompt, duration, filename } = validation.data;

    const ai = getAIService(env);

    const systemInstruction = `You are an expert video editor and creative director.
Your task is to analyze the user's request and suggest highly fitting visual effects to apply to a single-shot video clip.
You MUST provide DEEP creative reasoning for each effect. Do not just describe the effect; explain the 'why' (emotional impact) and the 'how' (how the specific parameters create the vibe).

You MUST choose only from this supported list of visual effects types. Do NOT invent new effect types:
1. 'rgb_split' (intensity: 0 to 1) - splits RGB channels, perfect for high energy, glitch, hits, music beats, shock, cyber vibes
2. 'shake' (intensity: 0 to 1) - shakes the frame, perfect for bass drops, impacts, action, power moves, chaos
3. 'zoom_pulse' (intensity: 0 to 1) - zooms in and out in a pulse/beat, great for music sync, focus, heavy moments
4. 'glow' (intensity: 0 to 1) - adds outer glow, great for dreaminess, power aura, magical moments, highlights
5. 'invert' (intensity: 0 to 1, params: { blend: 0 to 100 }) - inverts colors, great for shock, flashbacks, beat flashes, drops
6. 'gaussian-blur' (intensity: 0 to 1, params: { blurriness: 0 to 100 }) - standard Gaussian blur, great for intro/outro, defocusing, dramatic transitions
7. 'camera-blur' (intensity: 0 to 1, params: { blurRadius: 0 to 100 }) - camera lens style defocusing
8. 'brightness' (intensity: 0 to 1) - brightness adjustments (0.5 to 1.5)
9. 'contrast' (intensity: 0 to 1) - contrast adjustments (0.5 to 2.0)
10. 'saturation' (intensity: 0 to 1) - saturation (0 is grayscale, 1 is original, 2 is saturated)
11. 'mirror' (intensity: 0 to 1, params: { reflectionAngle: 90 or 180 }) - mirrors the frame
12. 'mosaic' (intensity: 0 to 1, params: { horizontalBlocks: 5 to 100, verticalBlocks: 5 to 100 }) - retro pixelated look
13. 'find_edges' (intensity: 0 to 1) - isolates outlines/edges, great for stylized/pencil sketching looks
14. 'posterize' (intensity: 0 to 1) - high-contrast retro posterized aesthetic
15. 'strobe_light' (intensity: 0 to 1, params: { period: 0.1 to 2.0, duration: 0.05 to 0.5, strobeType: 0 or 1 }) - flashing black screen or inverted colors
16. 'directional_blur' (intensity: 0 to 1, params: { direction: 0 to 360, blurLength: 1 to 50 }) - blurs in a specific angle direction, great for fast motion
17. 'radial_zoom_blur' (intensity: 0 to 1) - fast zoom motion blur, perfect for zoom-ins, action, hits
18. 'echo' (intensity: 0 to 1, params: { decay: 0 to 1 }) - motion trailing ghosts, beautiful for flow, slow-motion, aesthetic/psychedelic vibes

Return a list of effects to apply within the bounds of the video's total duration (0 to ${duration} seconds).
You can combine multiple effects, but do not return more than 5 effects. Make sure the startTime + duration of each effect does not exceed ${duration} seconds.
Be highly creative and tailored to the prompt. Explain exactly HOW the chosen effect achieves the desired vibe (e.g., 'by creating a chromatic aberration that suggests digital instability').`;

    const fullPrompt = `The user wants to edit a video of ${duration} seconds duration with the filename "${filename}".
Their request/vibe requirement is: "${prompt}".

Suggest visual effects that fit this creative intent. Return your response in JSON according to the schema provided.`;

    const result = await ai.generateContentJSON<{ effects: any[] }>({
      prompt: fullPrompt,
      systemInstruction,
      temperature: 0.5,
      schema: EFFECTS_SCHEMA
    });

    // Validate that returned effects are within bounds
    const normalizedEffects = (result.effects || []).map((fx) => {
      const startTime = Math.min(Math.max(0, fx.startTime || 0), duration);
      const fxDuration = Math.min(Math.max(0.1, fx.duration || 1), duration - startTime);
      return {
        ...fx,
        startTime,
        duration: fxDuration,
      };
    });

    return jsonResponse({
      success: true,
      effects: normalizedEffects,
      summary: `Gemini analyzed your request and suggested ${normalizedEffects.length} visual effects matching the prompt.`
    });
  } catch (error) {
    console.error("[gemini-think-effects] failed:", error);
    return apiError(
      ApiErrorCode.InternalError,
      error instanceof Error ? error.message : "Failed to suggest effects using Gemini",
      500
    );
  }
}
