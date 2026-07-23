/**
 * Vision Analyzer — uses Cloudflare Workers AI vision model for content understanding.
 *
 * Only runs when:
 * 1. Non-LLM analysis is cached but not sufficient
 * 2. User asks a question that requires visual understanding
 * 3. First-time analysis of a clip (then cached)
 *
 * Uses @cf/meta/llama-3.2-11b-vision-instruct for frame understanding.
 */
import type { Env } from "../types/env";

// ── Types ───────────────────────────────────────────────────────────────────

export interface VisionAnalysis {
  clipId: string;
  segments: VisionSegment[];
  summary: string;
  analyzedAt: number;
}

export interface VisionSegment {
  startTime: number;
  endTime: number;
  description: string;    // "Steph Curry shooting a three-pointer"
  subject: string;        // "Steph Curry", "basketball", "crowd"
  action: string;         // "shooting", "celebrating", "dribbling"
  mood: string;           // "exciting", "intense", "calm"
  tags: string[];         // ["basketball", "three-pointer", "swish"]
}

// ── Analyzer ────────────────────────────────────────────────────────────────

/**
 * Analyze video frames using Cloudflare vision model.
 *
 * @param env - Environment with AI binding
 * @param videoPath - Path to video file
 * @param clipId - Clip identifier
 * @param timestamps - Specific timestamps to analyze (if empty, analyzes evenly)
 */
export async function analyzeWithVision(
  env: Env,
  frames: Uint8Array[],
  clipId: string,
  duration: number,
  timestamps?: number[],
): Promise<VisionAnalysis> {
  if (!env.AI) {
    throw new Error("Cloudflare Workers AI not available");
  }

  // If no specific timestamps, sample evenly
  const times = timestamps ?? Array.from(
    { length: Math.min(8, frames.length) },
    (_, i) => (i / Math.min(8, frames.length)) * duration,
  );

  const segments: VisionSegment[] = [];

  // Analyze each frame (batch if possible, but vision models process one at a time)
  for (let i = 0; i < Math.min(frames.length, times.length); i++) {
    const frame = frames[i];
    const timestamp = times[i];

    try {
      const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
        messages: [
          {
            role: "system",
            content: `You are a video content analyst. Analyze this frame and return JSON with:
- description: what is happening (1 sentence)
- subject: main subject (person, object, scene)
- action: what the subject is doing (1 word)
- mood: emotional tone (1 word)
- tags: array of relevant tags (3-5 words)

Be specific. If you see a basketball player, name them if recognizable. If they're shooting, say "shooting". If celebrating, say "celebrating".`,
          },
          {
            role: "user",
            content: [
              { type: "image", image: frame },
              { type: "text", text: `Analyze this video frame at ${timestamp.toFixed(1)}s.` },
            ],
          },
        ],
        max_tokens: 256,
      });

      const text = result?.response ?? result?.result?.response ?? "";
      const parsed = parseVisionResponse(text);

      segments.push({
        startTime: Math.max(0, timestamp - 1),
        endTime: Math.min(duration, timestamp + 1),
        description: parsed.description || "Unknown",
        subject: parsed.subject || "Unknown",
        action: parsed.action || "unknown",
        mood: parsed.mood || "neutral",
        tags: parsed.tags || [],
      });
    } catch (e) {
      console.warn(`[vision] Failed to analyze frame at ${timestamp.toFixed(1)}s: ${(e as Error).message}`);
    }
  }

  return {
    clipId,
    segments,
    summary: segments.map(s => `${s.action} ${s.subject} (${s.mood})`).join(", "),
    analyzedAt: Date.now(),
  };
}

/**
 * Answer a question about a clip using vision analysis.
 */
export async function askAboutClip(
  env: Env,
  question: string,
  frames: Uint8Array[],
  clipId: string,
  duration: number,
): Promise<string> {
  if (!env.AI) {
    throw new Error("Cloudflare Workers AI not available");
  }

  // Use first few frames for context
  const sampleFrames = frames.slice(0, 4);

  const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
    messages: [
      {
        role: "system",
        content: `You are a video analyst. Answer questions about the video content based on the frames shown. Be specific about what you see.`,
      },
      {
        role: "user",
        content: [
          ...sampleFrames.map((frame) => ({ type: "image" as const, image: frame })),
          { type: "text" as const, text: `Video duration: ${duration.toFixed(1)}s. Question: ${question}` },
        ],
      },
    ],
    max_tokens: 512,
  });

  return result?.response ?? result?.result?.response ?? "I couldn't analyze the video.";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseVisionResponse(text: string): Record<string, unknown> {
  // Try to extract JSON from the response
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}

  // Fallback: parse key-value pairs
  const result: Record<string, unknown> = {};
  const descMatch = text.match(/description[:\s]*(.+?)(?:\n|$)/i);
  const subjectMatch = text.match(/subject[:\s]*(.+?)(?:\n|$)/i);
  const actionMatch = text.match(/action[:\s]*(.+?)(?:\n|$)/i);
  const moodMatch = text.match(/mood[:\s]*(.+?)(?:\n|$)/i);
  const tagsMatch = text.match(/tags[:\s]*\[(.+?)\]/i);

  if (descMatch) result.description = descMatch[1].trim();
  if (subjectMatch) result.subject = subjectMatch[1].trim();
  if (actionMatch) result.action = actionMatch[1].trim();
  if (moodMatch) result.mood = moodMatch[1].trim();
  if (tagsMatch) result.tags = tagsMatch[1].split(",").map((t: string) => t.trim().replace(/"/g, ""));

  return result;
}
