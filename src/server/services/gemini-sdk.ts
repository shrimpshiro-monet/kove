// Gemini AI Service - Using Official SDK
// Much more reliable than raw fetch

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { Env } from "../types/env";
import { withRetry, classifyError } from "../lib/retry";
import { getConfiguredGeminiModel } from "./model-config";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: string;

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
    this.modelName = getConfiguredGeminiModel(env);

    // Use the configured model so we can switch families without code edits.
    this.model = this.genAI.getGenerativeModel({
      model: this.modelName,
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
          model: this.modelName,
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
        model: this.modelName,
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
   * Upload a video/audio file to the Gemini Files API.
   * Uses resumable upload protocol (required for files >5MB).
   * Returns the file URI to use in generateContentJSONWithFile().
   *
   * IMPORTANT: Uploaded files expire after 48 hours.
   * Store the URI + expiresAt in D1 if you need to reuse it.
   */
  async uploadFile(params: {
    data: Uint8Array;
    mimeType: string;
    displayName: string;
  }): Promise<{ uri: string; name: string; expiresAt: string }> {
    const apiKey =
      (this.genAI as unknown as { apiKey?: string }).apiKey ||
      (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "") ||
      "";

    if (!apiKey) throw new Error("GEMINI_API_KEY not available for file upload");

    // Step 1: Initiate resumable upload
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": params.data.length.toString(),
          "X-Goog-Upload-Header-Content-Type": params.mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: params.displayName } }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`Gemini Files API init failed: ${initRes.status} — ${err}`);
    }

    const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      throw new Error("Gemini Files API did not return an upload URL");
    }

    // Step 2: Upload the actual bytes
    const binary = new Uint8Array(params.data);
    const arrayBuffer = binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength
    );

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": params.data.length.toString(),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Blob([arrayBuffer]),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Gemini Files API upload failed: ${uploadRes.status} — ${err}`);
    }

    const result = await uploadRes.json() as {
      file?: { uri?: string; name?: string; expirationTime?: string };
    };

    const uri = result?.file?.uri;
    const name = result?.file?.name;
    const expiresAt = result?.file?.expirationTime ?? new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString();

    if (!uri || !name) {
      throw new Error(`Gemini Files API returned incomplete file metadata: ${JSON.stringify(result)}`);
    }

    return { uri, name, expiresAt };
  }

  /**
   * Analyze a video/audio file that has been uploaded to the Gemini Files API.
   * Pass the fileUri from uploadFile() and a text prompt.
   * Returns structured JSON validated against responseSchema.
   */
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
        const generationConfig: Record<string, unknown> = {
          temperature: params.temperature ?? 0.4,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        };

        if (params.schema) {
          generationConfig.responseMimeType = "application/json";
          generationConfig.responseSchema = params.schema;
        }

        const model = this.genAI.getGenerativeModel({
          model: this.modelName,
          systemInstruction: params.systemInstruction,
          generationConfig: generationConfig as Parameters<typeof this.genAI.getGenerativeModel>[0]["generationConfig"],
        });

        const result = await model.generateContent([
          {
            fileData: {
              mimeType: params.mimeType,
              fileUri: params.fileUri,
            },
          },
          { text: params.prompt },
        ]);

        const text = result.response.text();
        if (!text) throw new Error("Empty response from Gemini (file analysis)");

        return JSON.parse(text) as T;
      },
      {
        retries: 2,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          const classified = classifyError(error);
          console.log(`File analysis retry ${attempt}/2: ${classified.type} — ${classified.userMessage}`);
        },
      }
    );
  }
}
