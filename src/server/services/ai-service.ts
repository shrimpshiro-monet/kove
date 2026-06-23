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
  console.log("[AI Service] Resolving provider...");

  // HIGHEST PRIORITY: Azure AI Foundry (per-stage model routing)
  const foundryEndpoint =
    env?.AZURE_FOUNDRY_ENDPOINT ||
    (typeof process !== "undefined" ? process.env.AZURE_FOUNDRY_ENDPOINT : "");
  const foundryKey =
    env?.AZURE_FOUNDRY_KEY ||
    (typeof process !== "undefined" ? process.env.AZURE_FOUNDRY_KEY : "");

  if (foundryEndpoint && foundryKey) {
    console.log("[AI Service] ✅ Azure AI Foundry configured, using it");
    return getAzureFoundry(env!);
  } else {
    console.log("[AI Service] ❌ Azure Foundry not configured", {
      endpoint: foundryEndpoint ? "set" : "MISSING",
      key: foundryKey ? "set" : "MISSING",
    });
  }

  // PRIORITY: Azure OpenAI (if configured) - most reliable for production
  const azureKey =
    env?.AZURE_OPENAI_API_KEY ||
    (typeof process !== "undefined" ? process.env.AZURE_OPENAI_API_KEY : "");

  if (azureKey && azureKey.trim()) {
    console.log("[AI Service] ✅ Azure OpenAI configured, using it");
    return new AzureOpenAIService(env);
  } else {
    console.log("[AI Service] ❌ Azure OpenAI not configured");
  }

  // Fallback: Vertex AI (if GCP_PROJECT_ID configured) - production, better limits
  const gcpProjectId =
    env?.GCP_PROJECT_ID ||
    (typeof process !== "undefined" ? process.env.GCP_PROJECT_ID : "");

  if (gcpProjectId && gcpProjectId.trim()) {
    console.log("[AI Service] ⚠️ Falling back to Vertex AI (GCP)");
    return new VertexAIService(env);
  }

  // Fallback to Gemini API (if GEMINI_API_KEY configured) - free tier, quick start
  const geminiKey =
    env?.GEMINI_API_KEY ||
    (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "");

  if (geminiKey && geminiKey.trim()) {
    console.log("[AI Service] ⚠️ Falling back to Gemini API (free tier)");
    return new GeminiService(env);
  }

  throw new Error(
    "No AI service configured. Set AZURE_OPENAI_API_KEY, GEMINI_API_KEY, or GCP_PROJECT_ID in .dev.vars"
  );
}
