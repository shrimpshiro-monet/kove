// Gemini AI Service - Using Official SDK
// Much more reliable than raw fetch

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { Env } from "../types/env";
import { withRetry, classifyError } from "../lib/retry";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(env?: Env) {
    // Get API key from env or process.env
    const apiKey =
      env?.GEMINI_API_KEY ||
      (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "") ||
      "";

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY not found. Please add it to .dev.vars for local development."
      );
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Use gemini-2.5-flash - stable model with JSON mode support
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
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
        const generationConfig: any = {
          temperature: params.temperature ?? 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        };

        // Enable JSON mode if schema provided
        if (params.schema) {
          generationConfig.responseMimeType = "application/json";
          generationConfig.responseSchema = params.schema;
        }

        // Create model with config
        const model = this.genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: params.systemInstruction,
          generationConfig,
        });

        const result = await model.generateContent(params.prompt);
        const response = result.response;
        const text = response.text();

        if (!text) {
          throw new Error("Empty response from Gemini");
        }

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
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: params.systemInstruction,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
      });

      const result = await model.generateContent(params.prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini generation error:", error);
      throw error;
    }
  }

  /**
   * Upload file to Gemini Files API
   * Returns the file URI that Gemini expects
   */
  async uploadFile(params: {
    data: Buffer | Uint8Array;
    mimeType: string;
    displayName: string;
  }): Promise<{ uri: string; name: string }> {
    try {
      // Note: File upload with official SDK
      // For now, we'll implement this when we need video analysis
      // The SDK handles the file upload format correctly
      throw new Error("File upload not yet implemented with SDK");
    } catch (error) {
      console.error("File upload error:", error);
      throw error;
    }
  }
}
