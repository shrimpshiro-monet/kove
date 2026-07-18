// src/server/lib/sentry-init.ts
// Sentry integration for error tracking and performance monitoring.
// Hooks into BullMQ render jobs, API routes, and async operations.

export interface SentryConfig {
  /** Sentry DSN (Data Source Name). */
  dsn: string;
  /** Environment (development, staging, production). */
  environment: string;
  /** Release version for tracking. */
  release?: string;
  /** Sample rate for performance traces (0-1). */
  tracesSampleRate?: number;
  /** Sample rate for error events (0-1). */
  sampleRate?: number;
  /** Additional tags to attach to all events. */
  defaultTags?: Record<string, string>;
}

let sentryInitialized = false;

/**
 * Initialize Sentry with the given configuration.
 * Safe to call multiple times — only initializes once.
 */
export function initSentry(config: SentryConfig): void {
  if (sentryInitialized) return;
  if (!config.dsn) {
    console.warn("[sentry] No DSN provided, error tracking disabled");
    return;
  }

  try {
    // Dynamic import — Sentry is optional
    const Sentry = require("@sentry/node");

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release || "monet@0.1.0",
      tracesSampleRate: config.tracesSampleRate ?? 0.1,
      sampleRate: config.sampleRate ?? 1.0,
      maxBreadcrumbs: 50,
      attachStacktrace: true,
      sendDefaultPii: false,

      // Ignore common non-errors
      ignoreErrors: [
        "AbortError",
        "ResizeObserver loop",
        "Non-Error promise rejection",
        "Network request failed",
        "ECONNRESET",
        "ETIMEDOUT",
      ],

      // Before send hook — strip sensitive data
      beforeSend(event) {
        // Remove any potential secrets from error reports
        if (event.request?.headers) {
          delete event.request.headers["Authorization"];
          delete event.request.headers["Cookie"];
          delete event.request.headers["X-API-Key"];
        }

        // Remove env vars from extra data
        if (event.extra) {
          for (const key of Object.keys(event.extra)) {
            if (key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN")) {
              event.extra[key] = "[REDACTED]";
            }
          }
        }

        return event;
      },
    });

    sentryInitialized = true;
    console.info("[sentry] Initialized successfully");
  } catch (err: any) {
    console.warn(`[sentry] Failed to initialize: ${err.message}`);
  }
}

/**
 * Capture an exception with Sentry.
 */
export function trackException(
  error: Error | unknown,
  context?: {
    /** Extra data to attach. */
    extra?: Record<string, any>;
    /** Tags for filtering. */
    tags?: Record<string, string>;
    /** Level: fatal, error, warning, info. */
    level?: "fatal" | "error" | "warning" | "info";
    /** User context. */
    userId?: string;
  },
): void {
  if (!sentryInitialized) return;

  try {
    const Sentry = require("@sentry/node");

    Sentry.withScope((scope: any) => {
      if (context?.extra) {
        scope.setExtras(context.extra);
      }
      if (context?.tags) {
        scope.setTags(context.tags);
      }
      if (context?.level) {
        scope.setLevel(context.level);
      }
      if (context?.userId) {
        scope.setUser({ id: context.userId });
      }

      Sentry.captureException(error);
    });
  } catch {
    // Sentry not available — fail silently
  }
}

/**
 * Capture a message/event with Sentry.
 */
export function trackMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" = "info",
  tags?: Record<string, string>,
): void {
  if (!sentryInitialized) return;

  try {
    const Sentry = require("@sentry/node");
    Sentry.captureMessage(message, level);
  } catch {
    // Sentry not available — fail silently
  }
}

/**
 * Start a Sentry span for performance monitoring.
 * Returns a span object that can be finished later.
 * Uses Sentry v8+ startSpan API (startTransaction is deprecated).
 */
export function startSpan(
  name: string,
  operation: string,
): { finish: () => void; setTag: (key: string, value: string) => void } {
  if (!sentryInitialized) {
    return { finish: () => {}, setTag: () => {} };
  }

  try {
    const Sentry = require("@sentry/node");

    // Sentry v8+: use startSpan or startInactiveSpan
    if (Sentry.startInactiveSpan) {
      const span = Sentry.startInactiveSpan({ name, op: operation });
      return {
        finish: () => span?.end?.(),
        setTag: (key: string, value: string) => span?.setAttribute?.(key, value),
      };
    }

    // Fallback for Sentry v7
    if (Sentry.startTransaction) {
      const transaction = Sentry.startTransaction({ name, op: operation });
      return {
        finish: () => transaction.finish(),
        setTag: (key: string, value: string) => transaction.setTag(key, value),
      };
    }

    return { finish: () => {}, setTag: () => {} };
  } catch {
    return { finish: () => {}, setTag: () => {} };
  }
}

/**
 * Wrap an async function with Sentry error tracking and performance monitoring.
 */
export function withSentry<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>,
): Promise<T> {
  const span = startSpan(name, "function");
  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      span.setTag(key, value);
    }
  }

  return fn()
    .catch((error: Error) => {
      trackException(error, {
        tags: { ...tags, "function.name": name },
        level: "error",
      });
      throw error;
    })
    .finally(() => {
      span.finish();
    });
}

/**
 * Hook into BullMQ render jobs for Sentry tracking.
 * Returns a handle for the 'start' action that must be passed to 'complete' or 'fail'.
 * Avoids globalThis storage which doesn't work in Cloudflare Workers isolates.
 */
export function trackRenderJob(
  jobId: string,
  action: "start",
  metadata?: Record<string, any>,
): { finish: () => void; setTag: (key: string, value: string) => void };
export function trackRenderJob(
  jobId: string,
  action: "complete" | "fail",
  metadata?: Record<string, any>,
  span?: { finish: () => void; setTag: (key: string, value: string) => void },
): void;
export function trackRenderJob(
  jobId: string,
  action: "start" | "complete" | "fail",
  metadata?: Record<string, any>,
  span?: { finish: () => void; setTag: (key: string, value: string) => void },
): { finish: () => void; setTag: (key: string, value: string) => void } | void {
  if (!sentryInitialized) {
    return action === "start" ? { finish: () => {}, setTag: () => {} } : undefined;
  }

  if (action === "start") {
    const renderSpan = startSpan(`render-job:${jobId}`, "render");
    renderSpan.setTag("job.id", jobId);
    if (metadata?.quality) renderSpan.setTag("render.quality", metadata.quality);
    if (metadata?.shotCount) renderSpan.setTag("render.shotCount", String(metadata.shotCount));
    return renderSpan;
  }

  if (!span) return;

  if (action === "complete") {
    if (metadata?.durationMs) span.setTag("render.durationMs", String(metadata.durationMs));
    if (metadata?.outputSize) span.setTag("render.outputSize", String(metadata.outputSize));
    span.finish();
  } else if (action === "fail") {
    trackExceptionMessage(`Render job ${jobId} failed`, "error", {
      "job.id": jobId,
      "job.error": metadata?.error || "unknown",
    });
    span.setTag("render.status", "failed");
    span.finish();
  }
}
