// Vertex AI Service - Production Gemini via GCP
// Better rate limits, enterprise features, same Gemini models

import { VertexAI } from "@google-cloud/vertexai";
import type { Env } from "../types/env";
import { withRetry, classifyError } from "../lib/retry";
import { getConfiguredGeminiModel } from "./model-config";

function getResponseText(response: {
  text?: () => string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}): string {
  const textFromMethod = response.text?.();
  if (textFromMethod) {
    return textFromMethod;
  }

  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

function normalizeJsonText(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject !== -1 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }

  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray !== -1 && lastArray > firstArray) {
    return trimmed.slice(firstArray, lastArray + 1);
  }

  return trimmed;
}

function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  const extractFor = (openChar: "{" | "[", closeChar: "}" | "]") => {
    const starts: number[] = [];
    let inString = false;
    let escaping = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (ch === "\\") {
          escaping = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === openChar) {
        starts.push(i);
      } else if (ch === closeChar && starts.length > 0) {
        const start = starts.pop();
        if (start !== undefined && starts.length === 0) {
          candidates.push(text.slice(start, i + 1));
        }
      }
    }
  };

  extractFor("{", "}");
  extractFor("[", "]");

  return candidates;
}

function repairJsonText(text: string): string {
  return removeTrailingCommas(stripJsonComments(text)).trim();
}

function parseJsonResponse<T>(rawText: string): T {
  const normalized = normalizeJsonText(rawText);

  const attempts = new Set<string>();
  attempts.add(normalized);
  attempts.add(repairJsonText(normalized));

  const balanced = extractBalancedJsonCandidates(normalized);
  for (const candidate of balanced) {
    attempts.add(candidate);
    attempts.add(repairJsonText(candidate));
  }

  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }

  throw new SyntaxError("Failed to parse JSON from model response");
}

export class VertexAIService {
  private vertex: VertexAI;
  private projectId: string;
  private location: string;
  private modelName: string;

  constructor(env?: Env) {
    // Get GCP credentials from env
    this.projectId =
      env?.GCP_PROJECT_ID ||
      (typeof process !== "undefined" ? process.env.GCP_PROJECT_ID : "") ||
      "";

    this.location =
      env?.GCP_LOCATION ||
      (typeof process !== "undefined" ? process.env.GCP_LOCATION : "") ||
      "us-central1"; // Default location
    this.modelName = getConfiguredGeminiModel(env);

    const credentials =
      env?.GCP_CREDENTIALS ||
      (typeof process !== "undefined" ? process.env.GCP_CREDENTIALS : "") ||
      "";

    if (!this.projectId) {
      throw new Error(
        "GCP_PROJECT_ID not found. Please add it to .dev.vars for local development."
      );
    }

    // Initialize Vertex AI
    let parsedCredentials: object | undefined;
    if (credentials) {
      try {
        // Try direct JSON parse first
        parsedCredentials = JSON.parse(credentials);
      } catch {
        // Might be base64-encoded — decode then parse
        try {
          const decoded = atob(credentials);
          parsedCredentials = JSON.parse(decoded);
        } catch {
          throw new Error("GCP_CREDENTIALS is not valid JSON or base64-encoded JSON.");
        }
      }
    }

    this.vertex = new VertexAI({
      project: this.projectId,
      location: this.location,
      ...(parsedCredentials
        ? { googleAuthOptions: { credentials: parsedCredentials } }
        : {}),
    });
  }

  /**
   * Generate content with JSON mode
   * Wrapped in retry logic for production reliability
   */
  async generateContentJSON<T = any>(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    schema?: any; // JSON schema for structured output
  }): Promise<T> {
    return withRetry(
      async () => {
        const generativeModel = this.vertex.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: params.temperature ?? 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: params.schema ? "application/json" : undefined,
            responseSchema: params.schema,
          },
          systemInstruction: params.systemInstruction,
        });

        const result = await generativeModel.generateContent(params.prompt);
        const response = result.response;

        const text = getResponseText(response);
        if (!text) {
          throw new Error("Empty response from Vertex AI");
        }

        return parseJsonResponse<T>(text);
      },
      {
        retries: 2,
        baseDelay: 500,
        onRetry: (attempt, error) => {
          const classified = classifyError(error);
          console.log(
            `Retry ${attempt}/2: ${classified.type} - ${classified.userMessage}`
          );
        },
      }
    );
  }

  /**
   * Generate plain text content
   */
  async generateContent(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
  }): Promise<string> {
    try {
      const generativeModel = this.vertex.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
        systemInstruction: params.systemInstruction,
      });

      const result = await generativeModel.generateContent(params.prompt);
      const response = result.response;

      const text = getResponseText(response);
      if (!text) {
        throw new Error("Empty response from Vertex AI");
      }

      return text;
    } catch (error) {
      console.error("Vertex AI generation error:", error);
      throw error;
    }
  }

  async generateContentJSONWithFile<T>(params: {
    fileUri: string;
    mimeType: string;
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    schema?: object;
  }): Promise<T> {
    return withRetry(
      async () => {
        const generativeModel = this.vertex.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: params.temperature ?? 0.4,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: params.schema ? "application/json" : undefined,
            responseSchema: params.schema,
          },
          systemInstruction: params.systemInstruction,
        });

        const result = await generativeModel.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                {
                  fileData: {
                    mimeType: params.mimeType,
                    fileUri: params.fileUri,
                  },
                },
                { text: params.prompt },
              ],
            },
          ],
        });

        const text = getResponseText(result.response);
        if (!text) {
          throw new Error("Empty response from Vertex AI");
        }

        return parseJsonResponse<T>(text);
      },
      {
        retries: 2,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          const classified = classifyError(error);
          console.log(
            `File analysis retry ${attempt}/2: ${classified.type} - ${classified.userMessage}`
          );
        },
      }
    );
  }

  /**
   * Upload file for multimodal input
   * Returns the file URI that Vertex expects
   */
  async uploadFile(params: {
    data: Buffer | Uint8Array;
    mimeType: string;
    displayName: string;
  }): Promise<{ uri: string; name: string }> {
    try {
      // TODO: Implement Vertex AI file upload
      // Uses Cloud Storage for file hosting
      throw new Error("File upload not yet implemented with Vertex AI");
    } catch (error) {
      console.error("File upload error:", error);
      throw error;
    }
  }
}
