// AI Service Factory
// Supports both Gemini API (free tier) and Vertex AI (GCP credits)

import type { Env } from "../types/env";
import { GeminiService } from "./gemini-sdk";
import { VertexAIService } from "./vertex-ai";

export type AIService = GeminiService | VertexAIService;

/**
 * Get AI service based on environment configuration
 *
 * Priority:
 * 1. Vertex AI (if GCP_PROJECT_ID configured) - production, better limits
 * 2. Gemini API (if GEMINI_API_KEY configured) - free tier, quick start
 */
export function getAIService(env?: Env): AIService {
  // PRIORITY SWAP: Try Gemini API first (faster to get working)
  const geminiKey =
    env?.GEMINI_API_KEY ||
    (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "");

  if (geminiKey && geminiKey.trim()) {
    console.log("Using Gemini API (direct)");
    return new GeminiService(env);
  }

  // Fallback to Vertex AI (GCP)
  const gcpProjectId =
    env?.GCP_PROJECT_ID ||
    (typeof process !== "undefined" ? process.env.GCP_PROJECT_ID : "");

  if (gcpProjectId && gcpProjectId.trim()) {
    console.log("Using Vertex AI (GCP) for Gemini models");
    console.log(`Project: ${gcpProjectId}`);
    return new VertexAIService(env);
  }

  throw new Error(
    "No AI service configured. Set either GEMINI_API_KEY (Gemini API) or GCP_PROJECT_ID (Vertex AI) in .dev.vars"
  );
}
