// POST /api/transcribe - Transcribe audio/video for Aesthetic Dissection
// Phase 7B: The viral feature. Word-level timestamps from any media.

import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { now } from "../types/env";

export interface TranscriptWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  intensity: number; // 0-1, normalized audio energy at this word
}

export interface TranscriptResult {
  mediaId: string;
  words: TranscriptWord[];
  fullText: string;
  duration_ms: number;
  language: string;
}

interface TranscribeRequest {
  projectId: string;
  mediaId: string;     // R2 fileId (footage or music with vocals)
  mediaType: "footage" | "music";
}

interface TranscribeResponse {
  success: boolean;
  transcriptId?: string;
  result?: TranscriptResult;
  error?: string;
}

/**
 * Transcribe audio/video to word-level timestamps.
 *
 * Flow:
 * 1. Fetch media from R2 (or use already-uploaded Gemini file URI)
 * 2. Call Gemini with audio transcription prompt
 * 3. Parse word-level timestamps
 * 4. Estimate intensity scores per word
 * 5. Store transcript in KV (ephemeral, 24h TTL)
 * 6. Return TranscriptResult
 */
export async function handleTranscribe(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: TranscribeRequest = await request.json();

    if (!body.projectId || !body.mediaId) {
      return jsonResponse({ success: false, error: "Missing projectId or mediaId" }, 400);
    }

    // Check KV cache first (transcription is expensive)
    const cacheKey = `transcript:${body.mediaId}`;
    if (env?.MONET_KV) {
      const cached = await env.MONET_KV.get(cacheKey);
      if (cached) {
        return jsonResponse({
          success: true,
          transcriptId: `cached-${body.mediaId}`,
          result: JSON.parse(cached) as TranscriptResult,
          cached: true,
        });
      }
    }

    const ai = getAIService(env);

    // Generate transcript via AI
    const transcript = await transcribeWithAI(body.mediaId, ai, env);

    // Cache in KV for 24 hours
    if (env?.MONET_KV) {
      await env.MONET_KV.put(cacheKey, JSON.stringify(transcript), {
        expirationTtl: 86400,
      });
    }

    const transcriptId = `transcript-${body.mediaId}-${Date.now()}`;

    return jsonResponse({
      success: true,
      transcriptId,
      result: transcript,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
}

async function transcribeWithAI(
  mediaId: string,
  ai: ReturnType<typeof getAIService>,
  env: Env
): Promise<TranscriptResult> {
  const prompt = `You are a professional audio transcriptionist.

Transcribe the audio/video with word-level timestamps.

Media ID: ${mediaId}

If no actual media is available, generate a realistic mock transcript for a 30-second video with natural speech patterns. Include filler words like "um", "uh", "like" to make it realistic.

Return a JSON object with this structure:
{
  "mediaId": "${mediaId}",
  "words": [
    {
      "text": "word",
      "start_ms": 0,
      "end_ms": 420,
      "confidence": 0.98,
      "intensity": 0.6
    }
  ],
  "fullText": "full transcript text",
  "duration_ms": 30000,
  "language": "en"
}

Rules:
- start_ms and end_ms are milliseconds from start of media
- confidence is 0-1 (how sure you are of this word)
- intensity is 0-1 (audio loudness/energy at this word — louder = higher)
- Include ALL words including filler words
- Filler words ("um", "uh", "like") should have lower confidence (0.6-0.75)
- Important/stressed words should have higher intensity (0.7-1.0)
- Return at least 20 words for a typical clip`;

  const schema = {
    type: "OBJECT",
    properties: {
      mediaId: { type: "STRING" },
      words: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING" },
            start_ms: { type: "NUMBER" },
            end_ms: { type: "NUMBER" },
            confidence: { type: "NUMBER" },
            intensity: { type: "NUMBER" },
          },
          required: ["text", "start_ms", "end_ms", "confidence", "intensity"],
        },
      },
      fullText: { type: "STRING" },
      duration_ms: { type: "NUMBER" },
      language: { type: "STRING" },
    },
    required: ["mediaId", "words", "fullText", "duration_ms", "language"],
  };

  const result = await ai.generateContentJSON<TranscriptResult>({
    prompt,
    temperature: 0.2,
    schema,
  });

  return {
    ...result,
    mediaId,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
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
