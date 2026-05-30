// Vertex AI Service - Production Gemini via GCP
// Better rate limits, enterprise features, same Gemini models

import { VertexAI } from "@google-cloud/vertexai";
import type { Env } from "../types/env";
import { withRetry, classifyError } from "../lib/retry";

export class VertexAIService {
  private vertex: VertexAI;
  private projectId: string;
  private location: string;

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
    this.vertex = new VertexAI({
      project: this.projectId,
      location: this.location,
      // If credentials are JSON string, parse them
      ...(credentials
        ? {
            googleAuthOptions: {
              credentials: JSON.parse(credentials),
            },
          }
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
          model: "gemini-2.0-flash-exp", // Latest Gemini via Vertex
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

        if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error("Empty response from Vertex AI");
        }

        const text = response.candidates[0].content.parts[0].text;

        // Parse JSON response
        return JSON.parse(text) as T;
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
        model: "gemini-2.0-flash-exp",
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

      if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Empty response from Vertex AI");
      }

      return response.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error("Vertex AI generation error:", error);
      throw error;
    }
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
