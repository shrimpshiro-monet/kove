import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import type { Env } from "./server/types/env";
import { handleUploadRequest, handleCompleteUpload, handleDirectUpload } from "./server/api/upload";
import { handleDecodeIntent, handleUpdateIntent } from "./server/api/decode-intent";
import { handleSyncFromAdvancedEditor } from "./server/api/sync-from-advanced-editor";
import { handleUploadAndDetect } from "./server/api/upload-and-detect";
import { handleAnalyze } from "./server/api/analyze";
import { handleGenerateEDL } from "./server/api/generate-edl";
import { handleRefineEDL } from "./server/api/refine-edl";
import { handleTranscribe } from "./server/api/transcribe";
import { handleAnalyzeReference } from "./server/api/analyze-reference";
import { handleMedia } from "./server/api/media";
import { handleGenerateComposition } from "./server/api/generate-composition";
import { handleGetStudioProject, handlePersistStudioProject } from "./server/api/studio-project";
import { handleQueueExport, handleGetExportStatus } from "./server/api/export";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const typedEnv = env as Env;

    // API Routes
    if (url.pathname.startsWith("/api/")) {
      try {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
              "Access-Control-Max-Age": "86400",
            },
          });
        }

        // Upload endpoints
        if (url.pathname === "/api/upload" && request.method === "POST") {
          return await handleUploadRequest(request, typedEnv);
        }

        if (url.pathname === "/api/upload/complete" && request.method === "POST") {
          return await handleCompleteUpload(request, typedEnv);
        }

        if (url.pathname === "/api/upload/direct" && request.method === "POST") {
          return await handleDirectUpload(request, typedEnv);
        }

        if (url.pathname.startsWith("/api/media/") && request.method === "GET") {
          return await handleMedia(request, typedEnv);
        }

        // Intent extraction endpoints
        if (url.pathname === "/api/decode-intent" && request.method === "POST") {
          return await handleDecodeIntent(request, typedEnv);
        }

        if (url.pathname === "/api/intent/update" && request.method === "POST") {
          return await handleUpdateIntent(request, typedEnv);
        }

        if (url.pathname === "/api/upload-and-detect" && request.method === "POST") {
          return await handleUploadAndDetect(request, typedEnv);
        }

        if (url.pathname === "/api/sync-from-advanced-editor" && request.method === "POST") {
          return await handleSyncFromAdvancedEditor(request, typedEnv);
        }

        // Analysis endpoint
        if (url.pathname === "/api/analyze" && request.method === "POST") {
          return await handleAnalyze(request, typedEnv);
        }

        // EDL generation endpoint
        if (url.pathname === "/api/generate-edl" && request.method === "POST") {
          return await handleGenerateEDL(request, typedEnv);
        }

        // EDL refinement endpoint (Phase 9 — the magic iteration loop)
        if (url.pathname === "/api/refine-edl" && request.method === "POST") {
          return await handleRefineEDL(request, typedEnv);
        }

        // Transcription endpoint (Phase 7B — Aesthetic Dissection)
        if (url.pathname === "/api/transcribe" && request.method === "POST") {
          return await handleTranscribe(request, typedEnv);
        }

        // Reference style analysis endpoint (Style Replication)
        if (url.pathname === "/api/analyze-reference" && request.method === "POST") {
          return await handleAnalyzeReference(request, typedEnv);
        }

        // Composition overlay generation (HyperFrames)
        if (url.pathname === "/api/generate-composition" && request.method === "POST") {
          return await handleGenerateComposition(request, typedEnv);
        }

        // Studio portable link hydration (fetch latest timeline from DB)
        if (url.pathname === "/api/studio-project" && request.method === "GET") {
          return await handleGetStudioProject(request, typedEnv);
        }

        if (url.pathname === "/api/studio-project" && request.method === "POST") {
          return await handlePersistStudioProject(request, typedEnv);
        }

        // Server-side export fallback (Safari/Firefox)
        if (url.pathname === "/api/export" && request.method === "POST") {
          return await handleQueueExport(request, typedEnv);
        }
        if (url.pathname === "/api/export" && request.method === "GET") {
          return await handleGetExportStatus(request, typedEnv);
        }

        // API route not found
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("API error:", error);
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Internal server error",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // SSR routes (TanStack Start)
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
