import type { Env } from "../types/env";
import { getLocalMedia, putLocalMedia } from "./local-media-cache";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function mimeTypeFromFileName(fileName: string, fallback = "application/octet-stream"): string {
  const ext = fileName.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();

  switch (ext) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mp3":
      return "audio/mp3";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/m4a";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    default:
      return fallback;
  }
}

function stripQuotes(str: any): string {
  if (!str || typeof str !== "string") return "";
  return str.replace(/^['"\s]+|['"\s]+$/g, "");
}

/**
 * Mocks the Cloudflare Worker environment for local development.
 * Provides in-memory or filesystem fallbacks for R2, D1, and KV.
 */
export function getDevEnv(existingEnv?: any): Env {
  const env = existingEnv || {};

  // R2 Mock: MONET_MEDIA
  if (!env.MONET_MEDIA) {
    env.MONET_MEDIA = {
      async get(key: string) {
        const local = getLocalMedia(key);
        if (!local) return null;
        return {
          async arrayBuffer() {
            return local.data;
          },
          async text() {
            return new TextDecoder().decode(local.data);
          },
          async json() {
            return JSON.parse(new TextDecoder().decode(local.data));
          },
          body: null,
          size: local.data.byteLength,
          httpMetadata: {
            contentType: local.mimeType || "application/octet-stream",
          },
          customMetadata: {
            mimeType: local.mimeType || "application/octet-stream",
            fileName: local.fileName || local.originalName || key,
            originalName: local.originalName || local.fileName || key,
          },
        };
      },
      async put(key: string, value: any, options?: any) {
        let data: ArrayBuffer;
        if (value instanceof ArrayBuffer) {
          data = value;
        } else if (value instanceof Uint8Array) {
          data = value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength
          ) as ArrayBuffer;
        } else if (typeof value === "string") {
          const encoded = new TextEncoder().encode(value);
          data = encoded.buffer.slice(
            encoded.byteOffset,
            encoded.byteOffset + encoded.byteLength
          ) as ArrayBuffer;
        } else if (value instanceof Blob) {
          data = await value.arrayBuffer();
        } else {
          data = new ArrayBuffer(0);
        }

        const fileName = options?.customMetadata?.fileName || options?.customMetadata?.name || key;
        const resolvedMimeType =
          options?.httpMetadata?.contentType &&
          options?.httpMetadata?.contentType !== "application/octet-stream"
            ? options.httpMetadata.contentType
            : mimeTypeFromFileName(fileName);

        putLocalMedia(key, {
          data,
          mimeType: resolvedMimeType,
          r2Key: key,
          fileName,
          originalName: options?.customMetadata?.originalName || fileName,
        });
        return {};
      },
      async delete(key: string) { return; },
      async list() { return { objects: [], truncated: false }; },
      async head(key: string) {
        const local = getLocalMedia(key);
        if (!local) return null;
        return {
          size: local.data.byteLength,
          httpMetadata: { contentType: local.mimeType || "application/octet-stream" },
          customMetadata: {
            mimeType: local.mimeType || "application/octet-stream",
            fileName: local.fileName || local.originalName || key,
          },
        };
      }
    } as any;
  }

  // R2 Mock: MONET_RENDERS
  if (!env.MONET_RENDERS) {
    env.MONET_RENDERS = env.MONET_MEDIA; // Reuse media mock for renders in dev
  }

  // D1 Mock: DB (Functional in-memory SQLite interpreter)
  if (!env.DB) {
    class MockD1PreparedStatement {
      private sql: string;
      private args: any[] = [];

      constructor(sql: string, args: any[] = []) {
        this.sql = sql;
        this.args = args;
      }

      bind(...args: any[]) {
        return new MockD1PreparedStatement(this.sql, args);
      }

      private execute() {
        const d1Store = (globalThis as any).__devD1Store || (() => {
          const store = {
            projects: new Map<string, any>(),
            edit_intents: new Map<string, any>(),
            analysis_results: new Map<string, any>(),
            edls: new Map<string, any>(),
            media_items: new Map<string, any>(),
            reference_styles: new Map<string, any>(),
          };
          (globalThis as any).__devD1Store = store;
          return store;
        })();

        const cleanSql = this.sql.trim().replace(/\s+/g, " ");

        // 1. PRAGMA table_info
        if (cleanSql.includes("PRAGMA table_info")) {
          return [
            { name: "id" },
            { name: "project_id" },
            { name: "edl_data" },
            { name: "data" },
            { name: "name" },
            { name: "intent_data" },
            { name: "analysis_data" },
            { name: "r2_key" },
            { name: "mime_type" },
            { name: "file_size" }
          ];
        }

        // 2. INSERT INTO
        if (cleanSql.match(/^INSERT\s+INTO/i)) {
          const tableMatch = cleanSql.match(/INSERT\s+INTO\s+(\w+)/i);
          const colsMatch = cleanSql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
          if (tableMatch && colsMatch) {
            const tableName = tableMatch[1].toLowerCase();
            const cols = colsMatch[1].split(",").map(c => c.trim().toLowerCase());
            
            const row: Record<string, any> = {};
            for (let i = 0; i < cols.length; i++) {
              row[cols[i]] = this.args[i];
            }
            
            const table = (d1Store as any)[tableName] || new Map();
            (d1Store as any)[tableName] = table;
            
            const id = row.id || this.args[0];
            if (id) {
              table.set(String(id), row);
            }
          }
          return [];
        }

        // 3. UPDATE
        if (cleanSql.match(/^UPDATE/i)) {
          const tableMatch = cleanSql.match(/UPDATE\s+(\w+)/i);
          if (tableMatch) {
            const tableName = tableMatch[1].toLowerCase();
            const table = (d1Store as any)[tableName];
            if (table) {
              if (tableName === "edit_intents") {
                const id = this.args[1];
                const row = table.get(String(id));
                if (row) {
                  row.intent_data = this.args[0];
                  row.has_clarifying_questions = 0;
                  row.clarifying_questions = null;
                }
              } else {
                // Generalized update for other tables (like reference_styles)
                // e.g., UPDATE reference_styles SET file_id = ?, style_data = ?, created_at = ? WHERE id = ?
                const setClauseMatch = cleanSql.match(/SET\s+(.*?)\s+WHERE/i);
                const whereMatch = cleanSql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
                if (setClauseMatch && whereMatch) {
                  const setClause = setClauseMatch[1];
                  const whereCol = whereMatch[1].toLowerCase();
                  
                  // Count the number of placeholders (?) in SET clause
                  const setPlaceholdersCount = (setClause.match(/\?/g) || []).length;
                  const whereVal = this.args[setPlaceholdersCount]; // Usually the last bound argument is for WHERE
                  
                  const row = table.get(String(whereVal));
                  if (row) {
                    const columns = setClause.split(",").map(item => item.split("=")[0].trim().toLowerCase());
                    for (let i = 0; i < columns.length; i++) {
                      row[columns[i]] = this.args[i];
                    }
                  }
                }
              }
            }
          }
          return [];
        }

        // 4. SELECT
        if (cleanSql.match(/^SELECT/i)) {
          const tableMatch = cleanSql.match(/FROM\s+(\w+)/i);
          if (tableMatch) {
            const tableName = tableMatch[1].toLowerCase();
            const table = (d1Store as any)[tableName];
            if (table) {
              let results = Array.from(table.values());
              
              const whereMatch = cleanSql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
              if (whereMatch) {
                const whereCol = whereMatch[1].toLowerCase();
                const val = this.args[0];
                results = results.filter((row: any) => String(row[whereCol]) === String(val));
              }
              
              if (cleanSql.match(/ORDER\s+BY\s+created_at\s+DESC/i)) {
                results.sort((a: any, b: any) => {
                  const timeA = Number(a.created_at || 0);
                  const timeB = Number(b.created_at || 0);
                  return timeB - timeA;
                });
              }
              
              const limitMatch = cleanSql.match(/LIMIT\s+(\d+)/i);
              if (limitMatch) {
                const limit = parseInt(limitMatch[1], 10);
                results = results.slice(0, limit);
              }
              
              return results;
            }
          }
          return [];
        }

        return [];
      }

      async run() {
        const results = this.execute();
        return { success: true, results };
      }

      async all<T = any>() {
        const results = this.execute();
        return { success: true, results: results as T[] };
      }

      async first<T = any>() {
        const results = this.execute();
        return (results && results.length > 0 ? results[0] : null) as T | null;
      }
    }

    env.DB = {
      prepare: (sql: string) => new MockD1PreparedStatement(sql),
      batch: async (statements: any[]) => {
        const results = [];
        for (const stmt of statements) {
          results.push(await stmt.all());
        }
        return results;
      },
      exec: async (sql: string) => ({ count: 0, duration: 0 }),
    } as any;
  }

  // KV Mock: MONET_KV
  if (!env.MONET_KV) {
    const kvStore = new Map<string, any>();
    env.MONET_KV = {
      get: async (key: string) => kvStore.get(key) || null,
      put: async (key: string, value: any) => { kvStore.set(key, value); },
      delete: async (key: string) => { kvStore.delete(key); },
      list: async () => ({ keys: Array.from(kvStore.keys()).map(name => ({ name })), list_complete: true }),
    } as any;
  }

  // RENDER_QUEUE Mock: Wire to Editly for local dev
  if (!env.RENDER_QUEUE) {
    env.RENDER_QUEUE = {
      send: async (message: any) => {
        console.info("[dev-env] Mock RENDER_QUEUE received job:", message.jobId);
        console.info("[dev-env] Processing of rendering jobs is delegated to apps/worker-node.");
      }
    } as any;
  }

  // Standard Env Variables
  env.ENVIRONMENT = stripQuotes(env.ENVIRONMENT || process.env.ENVIRONMENT || "development");
  env.GEMINI_API_KEY = stripQuotes(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "");
  env.GEMINI_MODEL = stripQuotes(env.GEMINI_MODEL || process.env.GEMINI_MODEL);

  // GCP Fallbacks (critical for Vertex AI in dev)
  env.GCP_PROJECT_ID = stripQuotes(env.GCP_PROJECT_ID || process.env.GCP_PROJECT_ID);
  env.GCP_LOCATION = stripQuotes(env.GCP_LOCATION || process.env.GCP_LOCATION);
  env.VERTEX_GEMINI_MODEL = stripQuotes(env.VERTEX_GEMINI_MODEL || process.env.VERTEX_GEMINI_MODEL);
  env.GCS_BUCKET = stripQuotes(env.GCS_BUCKET || process.env.GCS_BUCKET);

  // Azure OpenAI (Foundry) credentials
  env.AZURE_OPENAI_ENDPOINT = stripQuotes(env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT);
  env.AZURE_OPENAI_DEPLOYMENT = stripQuotes(env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT);
  env.AZURE_OPENAI_API_KEY = stripQuotes(env.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY);

  // GCP_CREDENTIALS: support base64-encoded JSON, raw JSON, or file path
  const rawCreds = stripQuotes(env.GCP_CREDENTIALS || process.env.GCP_CREDENTIALS || "");
  if (rawCreds) {
    try {
      // Already valid JSON? Use as-is
      JSON.parse(rawCreds);
      env.GCP_CREDENTIALS = rawCreds;
    } catch {
      try {
        // Base64-encoded JSON? Decode it
        const decoded = Buffer.from(rawCreds, "base64").toString("utf-8");
        JSON.parse(decoded); // validate
        env.GCP_CREDENTIALS = decoded;
      } catch {
        // Might be a file path
        if (existsSync(rawCreds)) {
          env.GCP_CREDENTIALS = readFileSync(rawCreds, "utf-8");
        } else {
          console.warn("[dev-env] GCP_CREDENTIALS is not valid JSON, base64, or file path");
          env.GCP_CREDENTIALS = rawCreds;
        }
      }
    }
  } else {
    // No GCP_CREDENTIALS env var — try loading from local key file
    const localKeyPath = join(process.cwd(), "gcp-local-key.json");
    if (existsSync(localKeyPath)) {
      console.log("[dev-env] Loading GCP credentials from gcp-local-key.json");
      env.GCP_CREDENTIALS = readFileSync(localKeyPath, "utf-8");
    }
  }

  return env as Env;
}
