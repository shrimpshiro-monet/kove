// AI Service Factory
// Supports Azure Foundry (primary), Azure OpenAI, Gemini API (free tier), and Vertex AI (GCP credits)

import type { Env } from "../types/env";
import { GeminiService } from "./gemini-sdk";
import { VertexAIService } from "./vertex-ai";
import { AzureOpenAIService } from "./azure-openai";
import { getAzureFoundry, type AzureFoundryService } from "./azure-foundry";

export type AIService = GeminiService | VertexAIService | AzureOpenAIService | AzureFoundryService;

/**
 * Get AI service based on environment configuration
 *
 * Priority:
 * 1. Azure OpenAI (if AZURE_OPENAI_API_KEY configured) - primary, most reliable
 * 2. Vertex AI (if GCP_PROJECT_ID configured) - production, better limits (preferred for production/GCP)
 * 3. Gemini API (if GEMINI_API_KEY configured) - free tier, quick start
 */
export function getAIService(env?: Env): AIService {
  // HIGHEST PRIORITY: Azure AI Foundry (per-stage model routing)
  const foundryEndpoint =
    env?.AZURE_FOUNDRY_ENDPOINT ||
    (typeof process !== "undefined" ? process.env.AZURE_FOUNDRY_ENDPOINT : "");
  const foundryKey =
    env?.AZURE_FOUNDRY_KEY ||
    (typeof process !== "undefined" ? process.env.AZURE_FOUNDRY_KEY : "");

  if (foundryEndpoint && foundryKey) {
    console.log("Using Azure AI Foundry for per-stage model routing");
    return getAzureFoundry(env!);
  }

  // PRIORITY: Azure OpenAI (if configured) - most reliable for production
  const azureKey =
    env?.AZURE_OPENAI_API_KEY ||
    (typeof process !== "undefined" ? process.env.AZURE_OPENAI_API_KEY : "");

  if (azureKey && azureKey.trim()) {
    console.log("Using Azure OpenAI for AI models");
    return new AzureOpenAIService(env);
  }

  // Fallback: Vertex AI (if GCP_PROJECT_ID configured) - production, better limits
  const gcpProjectId =
    env?.GCP_PROJECT_ID ||
    (typeof process !== "undefined" ? process.env.GCP_PROJECT_ID : "");

  if (gcpProjectId && gcpProjectId.trim()) {
    console.log("Using Vertex AI (GCP) for Gemini models");
    console.log(`Project: ${gcpProjectId}`);
    return new VertexAIService(env);
  }

  // Fallback to Gemini API (if GEMINI_API_KEY configured) - free tier, quick start
  const geminiKey =
    env?.GEMINI_API_KEY ||
    (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "");

  if (geminiKey && geminiKey.trim()) {
    console.log("Using Gemini API (direct)");
    return new GeminiService(env);
  }

  throw new Error(
    "No AI service configured. Set AZURE_OPENAI_API_KEY, GEMINI_API_KEY, or GCP_PROJECT_ID in .dev.vars"
  );
}
