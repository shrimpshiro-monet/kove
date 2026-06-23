/**
 * Standardized API response helpers for Monet AI Director.
 * Aligned with GEMINI.md mandates.
 */

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export const ApiErrorCode = {
  InvalidRequest: "INVALID_REQUEST",
  ValidationFailed: "VALIDATION_FAILED",
  MethodNotAllowed: "METHOD_NOT_ALLOWED",

  MediaNotFound: "MEDIA_NOT_FOUND",
  InvalidMediaType: "INVALID_MEDIA_TYPE",
  FileTooLarge: "FILE_TOO_LARGE",

  UploadFailed: "UPLOAD_FAILED",
  DatabaseInsertFailed: "DATABASE_INSERT_FAILED",
  CacheWriteFailed: "CACHE_WRITE_FAILED",

  StorageUnavailable: "STORAGE_UNAVAILABLE",
  DatabaseUnavailable: "DATABASE_UNAVAILABLE",

  IntentNotFound: "INTENT_NOT_FOUND",
  IntentDecodeFailed: "INTENT_DECODE_FAILED",
  IntentUpdateFailed: "INTENT_UPDATE_FAILED",

  AnalysisNotFound: "ANALYSIS_NOT_FOUND",
  AnalysisFailed: "ANALYSIS_FAILED",

  EDLGenerationFailed: "EDL_GENERATION_FAILED",
  EDLValidationFailed: "EDL_VALIDATION_FAILED",
  InternalError: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * Return a standardized JSON error response.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
  extraHeaders?: HeadersInit
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    } satisfies ApiErrorBody),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        ...extraHeaders,
      },
    }
  );
}

/**
 * Return a standardized JSON success response.
 */
export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
