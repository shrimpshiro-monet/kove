/**
 * POST /api/generate-composition
 *
 * Asks Gemini to write a full HyperFrames HTML overlay composition for the
 * current video — any visual style, any VFX, any kinetic typography —
 * entirely derived from the user's prompt and the EDL data.
 *
 * Falls back to the static composition generator if Gemini fails.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import {
  generateComposition,
  extractTitle,
  type CompositionGenre,
} from "../../lib/composition-generator";
import type { MonetEDL } from "../types/edl";

// ─── Request schema ─────────────────────────────────────────────────────────

const RequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  edl: z.object({
    timeline: z.object({ duration: z.number() }),
    music: z
      .object({
        bpm: z.number().optional(),
        beatGrid: z.array(z.number()).optional(),
        volume: z.number().optional(),
      })
      .optional(),
    shots: z.array(z.unknown()),
    globalEffects: z
      .object({ colorGrade: z.string().optional() })
      .optional(),
  }),
  intent: z.unknown().optional(),
});

type GenerateCompositionRequest = z.infer<typeof RequestSchema>;

// ─── Response type (exported for api-client) ────────────────────────────────

export interface GenerateCompositionResponse {
  success: boolean;
  html?: string;
  source?: "gemini" | "fallback";
  error?: string;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handleGenerateComposition(
  request: Request,
  env: Env | undefined
): Promise<Response> {
  let body: GenerateCompositionRequest;

  try {
    const raw = await request.json();
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse(
        { success: false, error: "Invalid request body", details: parsed.error.flatten() },
        400
      );
    }
    body = parsed.data;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }

  const { prompt, edl, intent } = body;
  const duration = edl.timeline.duration;
  const beatGrid = edl.music?.beatGrid ?? [];
  const bpm = edl.music?.bpm ?? 120;
  const dropTime = duration * 0.62;
  const colorGrade = edl.globalEffects?.colorGrade ?? "raw";
  const shotCount = edl.shots.length;
  const title = extractTitle(prompt);

  // ── Try Gemini first ──────────────────────────────────────────────────────
  try {
    const ai = getAIService(env);
    const promptTemplate = loadPromptTemplate("generate-composition.txt");

    const filledPrompt = promptTemplate
      .replace("{{PROMPT}}", prompt)
      .replace("{{TITLE}}", title)
      .replace("{{DURATION}}", duration.toFixed(2))
      .replace("{{BPM}}", String(Math.round(bpm)))
      .replace("{{BEAT_GRID}}", JSON.stringify(beatGrid.slice(0, 64)))
      .replace("{{DROP_TIME}}", dropTime.toFixed(2))
      .replace("{{SHOT_COUNT}}", String(shotCount))
      .replace("{{COLOR_GRADE}}", colorGrade)
      .replace("{{INTENT_JSON}}", JSON.stringify(intent ?? {}, null, 2));

    const raw = await ai.generateContent({
      prompt: filledPrompt,
      temperature: 1.0, // Creative — let it go wild
    });

    // Strip any accidental markdown code fences from Gemini
    const html = stripCodeFences(raw.trim());

    // Basic sanity: must contain required HyperFrames hooks + security checks
    validateCompositionHtml(html, duration);

    return jsonResponse({ success: true, html, source: "gemini" });
  } catch (geminiErr) {
    console.error("Gemini composition generation failed, using static fallback:", geminiErr);
  }

  // ── Static fallback ───────────────────────────────────────────────────────
  try {
    const intentGenre = extractGenreFromIntent(intent);
    const html = generateComposition({
      genre: intentGenre,
      title,
      edl: edl as MonetEDL,
    });
    return jsonResponse({ success: true, html, source: "fallback" });
  } catch (fallbackErr) {
    console.error("Static composition fallback failed:", fallbackErr);
    return jsonResponse(
      { success: false, error: "Composition generation failed" },
      500
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadPromptTemplate(filename: string): string {
  const path = join(process.cwd(), "src", "server", "prompts", filename);
  return readFileSync(path, "utf-8");
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function validateCompositionHtml(html: string, durationSec?: number): void {
  if (!html.startsWith("<!doctype") && !html.startsWith("<html") && !html.startsWith("<!DOCTYPE")) {
    throw new Error("Response is not valid HTML");
  }
  if (!html.includes("window.__timelines")) {
    throw new Error("Missing window.__timelines registration — composition won't seek");
  }
  if (!html.includes("hf-seek")) {
    throw new Error("Missing hf-seek postMessage handler — scrubbing will be broken");
  }
  if (!html.includes("gsap")) {
    throw new Error("Missing GSAP — no animation engine present");
  }

  // Security: every external <script src> must come from an allowlisted CDN.
  // Prevents Gemini from injecting arbitrary third-party JS into the preview iframe.
  const ALLOWED_SCRIPT_ORIGINS = [
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
    "https://cdn.skypack.dev",
  ];
  const scriptSrcPattern = /<script[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptSrcPattern.exec(html)) !== null) {
    const src = match[1];
    const allowed = ALLOWED_SCRIPT_ORIGINS.some((origin) => src.startsWith(origin));
    if (!allowed && !src.startsWith("/") && !src.startsWith("data:")) {
      throw new Error(`Untrusted script source in composition: ${src}`);
    }
  }

  // Quality: if duration is known, any hardcoded time reference above it is a bug.
  if (durationSec !== undefined) {
    const timePattern = /\b(\d{1,4}(?:\.\d+)?)\s*(?:,\s*["']?(?:s|sec|seconds)?["']?)?\s*\)/g;
    // Light heuristic — flag gsap.to/from calls with times clearly beyond duration.
    // This catches Gemini hallucinating beat times past the end of the clip.
    const gotoPattern = /tl\.\w+\([^,)]+,\s*\{[^}]*\}\s*,\s*([\d.]+)\s*\)/g;
    while ((match = gotoPattern.exec(html)) !== null) {
      const t = parseFloat(match[1]);
      if (t > durationSec + 1) {
        throw new Error(`Animation keyframe at ${t}s exceeds clip duration (${durationSec}s)`);
      }
    }
  }
}

const GENRE_MAP: Record<string, CompositionGenre> = {
  anime_amv: "anime_amv",
  anime: "anime_amv",
  amv: "anime_amv",
  sports: "sports_highlight",
  sports_highlight: "sports_highlight",
  cinematic: "cinematic_trailer",
  cinematic_trailer: "cinematic_trailer",
  trailer: "cinematic_trailer",
  music_video: "music_video",
  music: "music_video",
  wedding: "wedding",
};

function extractGenreFromIntent(intent: unknown): CompositionGenre {
  if (!intent || typeof intent !== "object") return "default";
  const i = intent as Record<string, unknown>;
  const style = i.style as Record<string, unknown> | undefined;
  const genre = (style?.genre as string | undefined)?.toLowerCase() ?? "";
  return GENRE_MAP[genre] ?? "default";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
