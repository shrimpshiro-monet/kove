// Gemini AI Service - Multimodal video understanding

import type { Env } from "../types/env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash"; // Just the model name, URL template adds "models/"

export interface GeminiFile {
  name: string;
  displayName: string;
  mimeType: string;
  sizeBytes: string;
  createTime: string;
  updateTime: string;
  expirationTime: string;
  sha256Hash: string;
  uri: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

export interface GeminiUploadResponse {
  file: GeminiFile;
}

export class GeminiService {
  private apiKey: string;

  constructor(env?: Env) {
    // In development, fall back to process.env if env binding not available
    this.apiKey =
      (env?.GEMINI_API_KEY) ||
      (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "") ||
      "";

    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY not found. Please add it to .dev.vars for local development."
      );
    }
  }

  /**
   * Upload a file to Gemini Files API
   * The file must be in R2 first - we fetch it and upload to Gemini
   */
  async uploadFile(
    r2Bucket: any, // R2Bucket type from @cloudflare/workers-types
    r2Key: string,
    displayName: string,
    mimeType: string
  ): Promise<GeminiFile> {
    try {
      // Fetch file from R2
      const r2Object = await r2Bucket.get(r2Key);
      if (!r2Object) {
        throw new Error(`File not found in R2: ${r2Key}`);
      }

      // Get file as ArrayBuffer
      const fileData = await r2Object.arrayBuffer();

      // Upload to Gemini Files API
      // Step 1: Get resumable upload URL
      const initResponse = await fetch(
        `${GEMINI_API_BASE}/upload/v1beta/files?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": fileData.byteLength.toString(),
            "X-Goog-Upload-Header-Content-Type": mimeType,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file: {
              display_name: displayName,
            },
          }),
        }
      );

      if (!initResponse.ok) {
        const error = await initResponse.text();
        throw new Error(`Gemini upload init failed: ${error}`);
      }

      const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL");
      if (!uploadUrl) {
        throw new Error("No upload URL returned from Gemini");
      }

      // Step 2: Upload file data
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": fileData.byteLength.toString(),
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
        },
        body: fileData,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`Gemini file upload failed: ${error}`);
      }

      const result: GeminiUploadResponse = await uploadResponse.json();

      // Wait for file to be processed
      await this.waitForFileProcessing(result.file.name);

      return result.file;
    } catch (error) {
      console.error("Gemini upload error:", error);
      throw error;
    }
  }

  /**
   * Wait for Gemini to finish processing an uploaded file
   */
  private async waitForFileProcessing(
    fileName: string,
    maxAttempts: number = 30,
    delayMs: number = 2000
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const file = await this.getFile(fileName);

      if (file.state === "ACTIVE") {
        return;
      }

      if (file.state === "FAILED") {
        throw new Error(`File processing failed: ${fileName}`);
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(`File processing timeout: ${fileName}`);
  }

  /**
   * Get file info from Gemini
   */
  async getFile(fileName: string): Promise<GeminiFile> {
    const response = await fetch(
      `${GEMINI_API_BASE}/${fileName}?key=${this.apiKey}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get file: ${error}`);
    }

    const result: { file: GeminiFile } = await response.json();
    return result.file;
  }

  /**
   * Generate content with Gemini (text + file inputs)
   */
  async generateContent(params: {
    prompt: string;
    fileUris?: string[];
    systemInstruction?: string;
    temperature?: number;
    responseSchema?: object; // For JSON mode
  }): Promise<string> {
    const contents: any[] = [];

    // Add file parts if provided
    if (params.fileUris && params.fileUris.length > 0) {
      const fileParts = params.fileUris.map((uri) => ({
        fileData: { fileUri: uri },
      }));
      contents.push({
        role: "user",
        parts: fileParts,
      });
    }

    // Add text prompt
    contents.push({
      role: "user",
      parts: [{ text: params.prompt }],
    });

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    };

    // Add system instruction if provided
    if (params.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: params.systemInstruction }],
      };
    }

    // Add JSON schema if provided
    if (params.responseSchema) {
      requestBody.generationConfig.responseMimeType = "application/json";
      requestBody.generationConfig.responseSchema = params.responseSchema;
    }

    console.log("Gemini request:", {
      url: `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`,
      body: requestBody,
    });

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    console.log("Gemini response status:", response.status, response.statusText);

    if (!response.ok) {
      const error = await response.text();
      console.error("Gemini error response:", error);
      throw new Error(`Gemini generate failed: ${error}`);
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    console.log("Gemini response:", JSON.stringify(result, null, 2));

    // Extract text from response
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Failed to extract text from Gemini response:", result);
      throw new Error(`No text in Gemini response. Response structure: ${JSON.stringify(result)}`);
    }

    return text;
  }

  /**
   * Delete a file from Gemini (cleanup)
   */
  async deleteFile(fileName: string): Promise<void> {
    await fetch(`${GEMINI_API_BASE}/${fileName}?key=${this.apiKey}`, {
      method: "DELETE",
    });
  }
}
