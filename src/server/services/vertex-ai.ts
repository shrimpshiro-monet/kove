// Vertex AI Service - Production Gemini via GCP
// Better rate limits, enterprise features, same Gemini models

import { VertexAI } from "@google-cloud/vertexai";
import type { GenerateContentRequest } from "@google-cloud/vertexai";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type VertexPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
};
import type { Env } from "../types/env";
import { withRetry } from "../lib/retry";
import { getConfiguredGeminiModel } from "./model-config";

function getResponseText(response: any): string {
  // Extract text from Vertex AI response payload
  const parts = response.candidates?.[0]?.content?.parts;
  if (parts && parts.length > 0) {
    const contentParts = parts.filter((part: any) => !part.thought && part.text);
    if (contentParts.length > 0) {
      return contentParts.map((part: any) => part.text ?? "").join("");
    }
  }

  const textFromMethod = typeof response.text === "function" ? response.text() : response.text;
  if (textFromMethod) {
    return textFromMethod;
  }

  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text ?? "")
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

function stripQuotes(str: any): string {
  if (!str || typeof str !== "string") return "";
  return str.replace(/^['"\s]+|['"\s]+$/g, "");
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

const VERTEX_GEMINI_SUPPORTED_MIME_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/mpeg",
  "video/mpg",
  "video/x-flv",
  "video/3gpp",
  "video/wmv",
  "audio/aac",
  "audio/flac",
  "audio/mp3",
  "audio/m4a",
  "audio/mpeg",
  "audio/mpga",
  "audio/mp4",
  "audio/opus",
  "audio/pcm",
  "audio/wav",
  "audio/webm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function assertSupportedVertexGeminiMimeType(mimeType: string): void {
  const normalized = mimeType.trim().toLowerCase().split(";")[0];

  if (!normalized || normalized === "application/octet-stream") {
    throw new Error(
      `Unsupported Vertex Gemini MIME type "${mimeType}". Resolve the real media MIME type before upload.`
    );
  }

  if (!VERTEX_GEMINI_SUPPORTED_MIME_TYPES.has(normalized)) {
    throw new Error(
      `Unsupported Vertex Gemini MIME type "${mimeType}". Supported examples: video/mp4, video/webm, video/quicktime, audio/mpeg, image/jpeg, application/pdf, text/plain.`
    );
  }
}

export class VertexAIService {
  private projectId: string;
  private location: string;
  private modelName: string;
  private parsedCredentials?: any;
  private env?: Env;

  constructor(env?: Env) {
    this.env = env;

    // --- Parse credentials ---
    let credsRaw =
      env?.GCP_CREDENTIALS ||
      (typeof process !== "undefined" ? process.env.GCP_CREDENTIALS : "") ||
      "";

    const keyPath =
      (typeof process !== "undefined" && process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
      join(process.cwd(), "gcp-local-key.json");

    if (existsSync(keyPath)) {
      console.log("[VertexAIService] Loading credentials from file:", keyPath);
      credsRaw = readFileSync(keyPath, "utf-8");
    } else {
      console.log("[VertexAIService] No key file at", keyPath, "— using env var");
    }

    if (credsRaw) {
      try {
        this.parsedCredentials = JSON.parse(credsRaw);
      } catch {
        try {
          this.parsedCredentials = JSON.parse(
            Buffer.from(credsRaw, "base64").toString("utf-8")
          );
        } catch (e) {
          console.error("[VertexAIService] Failed to parse GCP_CREDENTIALS:", e);
        }
      }
      if (this.parsedCredentials && typeof this.parsedCredentials.private_key === "string") {
        this.parsedCredentials.private_key = this.parsedCredentials.private_key.replace(/\\n/g, "\n");
      }
    }

    // --- Resolve project / location / model ---
    this.projectId = stripQuotes(
      env?.GCP_PROJECT_ID ||
      this.parsedCredentials?.project_id ||
      (typeof process !== "undefined" ? process.env.GCP_PROJECT_ID : "") ||
      ""
    );

    this.location = stripQuotes(
      env?.GCP_LOCATION ||
      (typeof process !== "undefined" ? process.env.GCP_LOCATION : "") ||
      "us-central1"
    );

    this.modelName = getConfiguredGeminiModel(env);

    if (!this.projectId) {
      throw new Error(
        "GCP_PROJECT_ID not found. Please add it to .dev.vars for local development."
      );
    }

    if (this.parsedCredentials) {
      console.log(
        "[VertexAIService] Parsed credentials keys:",
        Object.keys(this.parsedCredentials)
      );
    }
  }

  /**
   * Get an access token for GCP services using the service account credentials.
   * Uses native WebCrypto (100% supported in Cloudflare Workers and Node.js).
   */
  private async getAccessToken(
    credentials: any,
    scopes: string[]
  ): Promise<string> {
    if (!credentials || !credentials.client_email || !credentials.private_key) {
      console.error(
        "[VertexAIService] Credential check failed. Keys found:",
        Object.keys(credentials || {})
      );
      throw new Error("Invalid GCP credentials structure: missing email or key");
    }

    console.log("[VertexAIService] Private key type:", typeof credentials.private_key);
    console.log("[VertexAIService] Private key length:", credentials.private_key?.length);
    console.log("[VertexAIService] Private key start:", credentials.private_key?.slice(0, 40));
    console.log("[VertexAIService] Private key end:", credentials.private_key?.slice(-40));

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: credentials.client_email,
      sub: credentials.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: scopes.join(" "),
    };

    // --- Build JWT header + payload ---
    const header = { alg: "RS256", typ: "JWT" };
    
    // Base64Url helper function
    const base64UrlEncode = (jsonObj: any): string => {
      const jsonStr = JSON.stringify(jsonObj);
      const b64 = btoa(jsonStr);
      return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    };

    const encodedHeader = base64UrlEncode(header);
    const encodedPayload = base64UrlEncode(payload);
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // --- Sign with Native WebCrypto (100% supported in Cloudflare Workers) ---
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = credentials.private_key
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/[^A-Za-z0-9+/=]/g, "");
    
    console.log("[VertexAIService] pemContents length:", pemContents.length);
    console.log("[VertexAIService] pemContents start:", pemContents.slice(0, 40));
    console.log("[VertexAIService] pemContents end:", pemContents.slice(-40));

    // Decode base64 to binary using Buffer (fully compatible with Node.js and workerd nodejs_compat)
    const binaryDer = Buffer.from(pemContents, "base64");

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer.slice(binaryDer.byteOffset, binaryDer.byteOffset + binaryDer.byteLength),
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const encoder = new TextEncoder();
    const dataToSign = encoder.encode(unsignedToken);
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      dataToSign
    );

    const signatureArray = new Uint8Array(signatureBuffer);
    let signatureBinary = "";
    for (let i = 0; i < signatureArray.length; i++) {
      signatureBinary += String.fromCharCode(signatureArray[i]);
    }
    const signatureB64 = btoa(signatureBinary);
    const encodedSignature = signatureB64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const jwt = `${unsignedToken}.${encodedSignature}`;

    // --- Exchange JWT for access token ---
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Token exchange failed (${tokenResponse.status}): ${errorText}`
      );
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    return tokenData.access_token;
  }

  /**
   * Helper: Call Vertex AI generateContent REST API
   */
  private async callVertexAIREST(params: {
    prompt: string | any[];
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: any;
  }): Promise<string> {
    const token = await this.getAccessToken(this.parsedCredentials, [
      "https://www.googleapis.com/auth/cloud-platform",
    ]);

    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelName}:generateContent`;

    let contents: any[] = [];
    if (typeof params.prompt === "string") {
      contents = [
        {
          role: "user",
          parts: [{ text: params.prompt }],
        },
      ];
    } else if (Array.isArray(params.prompt)) {
      contents = [
        {
          role: "user",
          parts: params.prompt.map((part) => {
            if (part.fileData) {
              return {
                fileData: {
                  mimeType: part.fileData.mimeType,
                  fileUri: part.fileData.fileUri,
                },
              };
            }
            return { text: part.text || "" };
          }),
        },
      ];
    }

    const body: any = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
        responseMimeType: params.responseMimeType,
        responseSchema: params.responseSchema,
      },
    };

    if (params.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: params.systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vertex AI REST call failed (${response.status}): ${errText}`);
    }

    const resData = (await response.json()) as any;
    const text = getResponseText(resData);
    return text;
  }

  /**
   * Upload file for multimodal input
   * Returns the file URI that Vertex expects (gs://...)
   */
  async uploadFile(params: {
    data: Uint8Array;
    mimeType: string;
    displayName: string;
  }): Promise<{ uri: string; name: string }> {
    assertSupportedVertexGeminiMimeType(params.mimeType);

    try {
      const credentials = this.parsedCredentials;

      if (!credentials) {
        throw new Error("GCP_CREDENTIALS not found for GCS upload");
      }

      const bucketName = stripQuotes(this.env?.GCS_BUCKET || "monet-ai-assets");

      const token = await this.getAccessToken(credentials, [
        "https://www.googleapis.com/auth/devstorage.read_write",
      ]);

      const safeDisplayName = (params.displayName || "file").replace(
        /[^a-zA-Z0-9.-]/g,
        "_"
      );
      const fileName = `${Date.now()}-${safeDisplayName}`;
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${fileName}`;

      console.log(`Uploading to GCS: gs://${bucketName}/${fileName}`);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": params.mimeType,
        },
        body: toArrayBuffer(params.data),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`GCS upload failed: ${response.status} - ${err}`);
      }

      const result = (await response.json()) as { name: string };
      const uri = `gs://${bucketName}/${result.name}`;

      return {
        uri,
        name: result.name,
      };
    } catch (error) {
      console.error("Vertex AI GCS upload error:", error);
      throw error;
    }
  }

  /**
   * Generate content with JSON mode
   * Wrapped in retry logic for production reliability
   */
  async generateContentJSON<T = any>(params: {
    prompt: string | any[];
    systemInstruction?: string;
    temperature?: number;
    schema?: any; // JSON schema for structured output
  }): Promise<T> {
    return withRetry(
      async () => {
        const text = await this.callVertexAIREST({
          prompt: params.prompt,
          systemInstruction: params.systemInstruction,
          temperature: params.temperature,
          responseMimeType: "application/json",
          responseSchema: params.schema,
        });

        console.log("[VertexAI] Raw response text (first 500 chars):", text?.slice(0, 500));
        console.log("[VertexAI] Response tail (last 300 chars):", text?.slice(-300));
        console.log("[VertexAI] Response total length:", text?.length);
        if (!text) {
          throw new Error("Empty response from Vertex AI");
        }

        return parseJsonResponse<T>(text);
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
      const text = await this.callVertexAIREST({
        prompt: params.prompt,
        systemInstruction: params.systemInstruction,
        temperature: params.temperature,
      });

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
    assertSupportedVertexGeminiMimeType(params.mimeType);

    return withRetry(
      async () => {
        const text = await this.callVertexAIREST({
          prompt: [
            {
              fileData: {
                mimeType: params.mimeType,
                fileUri: params.fileUri,
              },
            },
            { text: params.prompt },
          ],
          systemInstruction: params.systemInstruction,
          temperature: params.temperature ?? 0.4,
          responseMimeType: params.schema ? "application/json" : undefined,
          responseSchema: params.schema,
        });

        console.log("[VertexAI] Raw file-response text (first 500 chars):", text?.slice(0, 500));
        console.log("[VertexAI] Response tail (last 300 chars):", text?.slice(-300));
        console.log("[VertexAI] Response total length:", text?.length);
        if (!text) {
          throw new Error("Empty response from Vertex AI");
        }

        return parseJsonResponse<T>(text);
      }
    );
  }
}
