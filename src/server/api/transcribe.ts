import type { Env } from "../types/env";
import { jsonResponse } from "../lib/api-response";
import { getOrTranscribe } from "../services/transcription-service";

export type { TranscriptWord, TranscriptResult } from "../services/transcription-service";

interface TranscribeRequest {
  projectId: string;
  mediaId: string;
  mediaType: "footage" | "music";
}

export async function handleTranscribe(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: TranscribeRequest = await request.json();

    if (!body.projectId || !body.mediaId) {
      return jsonResponse({ success: false, error: "Missing projectId or mediaId" }, 400);
    }

    const { transcript, cached } = await getOrTranscribe(env, body.mediaId);
    const transcriptId = cached ? `cached-${body.mediaId}` : `transcript-${body.mediaId}-${Date.now()}`;

    return jsonResponse({
      success: true,
      transcriptId,
      result: transcript,
      ...(cached ? { cached: true } : {}),
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
}
