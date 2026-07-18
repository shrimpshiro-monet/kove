/**
 * Thinking Service Client
 *
 * Provides real-time "thinking" output and clarifying questions
 * during the editing pipeline.
 */

const THINKING_URL = process.env.THINKING_URL || "http://localhost:8106";

export interface ThinkingThought {
  stage: string;
  text: string;
  icon: string;
  duration_ms: number;
}

export interface ThinkingResult {
  thoughts: ThinkingThought[];
  total_duration_ms: number;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  type: "suggestion" | "clarification" | "requirement";
  impact: "critical" | "high" | "medium" | "low";
}

export interface QuestionsResult {
  questions: ClarifyingQuestion[];
  count: number;
}

async function fetchJSON<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${THINKING_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[thinking-client] ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[thinking-client] ${path} failed:`, (err as Error).message);
    return null;
  }
}

export async function getThinking(input: {
  prompt: string;
  footage_count: number;
  has_music: boolean;
  has_reference: boolean;
  reference_style?: Record<string, unknown>;
}): Promise<ThinkingResult | null> {
  return fetchJSON<ThinkingResult>("/think", input);
}

export async function getQuestions(input: {
  prompt: string;
  footage_count: number;
  has_music: boolean;
  has_reference: boolean;
  analysis_data?: Record<string, unknown>;
}): Promise<QuestionsResult | null> {
  return fetchJSON<QuestionsResult>("/questions", input);
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${THINKING_URL}/docs`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}
