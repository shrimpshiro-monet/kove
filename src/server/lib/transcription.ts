/**
 * Transcription service — calls Python AI worker for Whisper transcription.
 *
 * Returns word-level timestamps, speech segments, and speaker info.
 * This is the foundation for content-aware editing.
 */
import type { Env } from "../types/env";

// ── Types ───────────────────────────────────────────────────────────────────

export interface Word {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface TranscriptionResult {
  language: string;
  languageProbability: number;
  duration: number;
  segments: SpeechSegment[];
  words: Word[];
  summary: {
    segmentCount: number;
    wordCount: number;
  };
}

// ── Client ──────────────────────────────────────────────────────────────────

/**
 * Transcribe a video file using Whisper via the Python AI worker.
 *
 * @param env - Environment with PYTHON_AI_URL
 * @param filePath - Path to the video/audio file on disk
 * @param options - Optional: language, model, device
 */
export async function transcribe(
  env: Env,
  filePath: string,
  options?: {
    language?: string;
    modelName?: string;
    device?: string;
    computeType?: string;
  },
): Promise<TranscriptionResult> {
  const pythonAiUrl = env.PYTHON_AI_URL || "http://localhost:8102";

  const resp = await fetch(`${pythonAiUrl}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath,
      language: options?.language,
      modelName: options?.modelName,
      device: options?.device,
      computeType: options?.computeType,
    }),
    signal: AbortSignal.timeout(180_000), // 3 min timeout for long videos
  });

  if (!resp.ok) {
    throw new Error(`Transcription failed: HTTP ${resp.status}: ${await resp.text()}`);
  }

  const json = await resp.json() as { success: boolean; data: TranscriptionResult };
  if (!json.success || !json.data) {
    throw new Error("Transcription worker returned failure");
  }

  return json.data;
}

// ── Speech Segment Extraction ───────────────────────────────────────────────

/**
 * Group words into speech segments based on natural pauses.
 *
 * Words with gaps > pauseThreshold are split into separate segments.
 * This gives us the natural speech boundaries for editing.
 */
export function extractSpeechSegments(
  words: Word[],
  pauseThreshold = 0.5,
): SpeechSegment[] {
  if (words.length === 0) return [];

  const segments: SpeechSegment[] = [];
  let currentWords: Word[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    const gap = curr.start - prev.end;

    if (gap > pauseThreshold) {
      // Natural pause — end current segment, start new one
      segments.push(buildSegment(currentWords));
      currentWords = [curr];
    } else {
      currentWords.push(curr);
    }
  }

  // Final segment
  if (currentWords.length > 0) {
    segments.push(buildSegment(currentWords));
  }

  return segments;
}

function buildSegment(words: Word[]): SpeechSegment {
  return {
    start: words[0].start,
    end: words[words.length - 1].end,
    text: words.map((w) => w.word).join(" "),
    words,
  };
}

// ── Speech Pause Detection ──────────────────────────────────────────────────

export interface SpeechPause {
  time: number;
  duration: number;
  isSentenceEnd: boolean;
  isBreath: boolean;
}

/**
 * Detect natural pauses within speech segments.
 *
 * These are the BEST places to cut — the speaker paused,
 * so a cut here feels natural and doesn't interrupt them.
 */
export function detectSpeechPauses(
  segments: SpeechSegment[],
  words: Word[],
  minPauseDuration = 0.3,
): SpeechPause[] {
  const pauses: SpeechPause[] = [];

  // Gaps between words within segments
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= minPauseDuration) {
      const prevWord = words[i - 1].word;
      const isSentenceEnd = /[.!?]$/.test(prevWord) || words[i - 1].probability > 0.9;
      const isBreath = gap > 0.5 && gap < 2.0;

      pauses.push({
        time: words[i - 1].end + gap / 2,
        duration: gap,
        isSentenceEnd,
        isBreath,
      });
    }
  }

  // Gaps between segments (inter-segment pauses)
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap >= minPauseDuration) {
      const prevText = segments[i - 1].text;
      const isSentenceEnd = /[.!?]$/.test(prevText.trim());
      const isBreath = gap > 0.5 && gap < 2.0;

      pauses.push({
        time: segments[i - 1].end + gap / 2,
        duration: gap,
        isSentenceEnd,
        isBreath,
      });
    }
  }

  // Sort by time
  pauses.sort((a, b) => a.time - b.time);

  return pauses;
}

// ── Text Matching ───────────────────────────────────────────────────────────

/**
 * Find the speech segment that best matches a given text query.
 *
 * Used by the script compiler to map script lines to footage.
 */
export function findMatchingSegment(
  segments: SpeechSegment[],
  query: string,
  threshold = 0.5,
): SpeechSegment | null {
  const queryLower = query.toLowerCase().replace(/[^\w\s]/g, "").trim();
  const queryWords = queryLower.split(/\s+/);

  let bestMatch: SpeechSegment | null = null;
  let bestScore = 0;

  for (const segment of segments) {
    const segText = segment.text.toLowerCase().replace(/[^\w\s]/g, "").trim();
    const segWords = segText.split(/\s+/);

    // Simple word overlap scoring
    let matches = 0;
    for (const qw of queryWords) {
      if (segWords.some((sw) => sw.includes(qw) || qw.includes(sw))) {
        matches++;
      }
    }

    const score = matches / queryWords.length;
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = segment;
    }
  }

  return bestMatch;
}

/**
 * Find the speech segment closest to a given timestamp.
 */
export function findNearestSegment(
  segments: SpeechSegment[],
  time: number,
): SpeechSegment | null {
  if (segments.length === 0) return null;

  let best = segments[0];
  let bestDist = Math.abs(time - (best.start + best.end) / 2);

  for (const seg of segments) {
    const mid = (seg.start + seg.end) / 2;
    const dist = Math.abs(time - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }

  return best;
}
