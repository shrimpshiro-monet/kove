// Simple retry wrapper for flaky AI calls
// Deletes 90% of "random AI flakiness" pain

export interface RetryOptions {
  retries?: number;
  baseDelay?: number; // milliseconds
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 *
 * Non-negotiable for production AI systems.
 * Handles: 503s, network timeouts, transient Gemini errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 5,
    baseDelay = 5000,
    maxDelay = 20000,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      // Last attempt - throw
      if (attempt === retries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      console.log(
        `Retry attempt ${attempt + 1}/${retries} after ${delay}ms:`,
        lastError.message
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine if error is worth retrying
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Retryable: Rate limits, service unavailable, timeouts
  const retryablePatterns = [
    "429",
    "resource exhausted",
    "503",
    "service unavailable",
    "high demand",
    "rate limit",
    "timeout",
    "econnreset",
    "enotfound",
    "etimedout",
  ];

  // Non-retryable: Auth errors, invalid requests
  const nonRetryablePatterns = [
    "401",
    "403",
    "400",
    "invalid api key",
    "authentication",
    "not found",
    "404",
    "unsupported mime type",
  ];

  // Check non-retryable first (higher priority)
  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Check retryable
  if (retryablePatterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // Default: retry network/unknown errors
  return true;
}

/**
 * Classify error for user-facing messages
 */
export function classifyError(error: Error): {
  type: "rate_limit" | "auth" | "network" | "validation" | "unknown";
  userMessage: string;
  retryable: boolean;
} {
  const message = error.message.toLowerCase();

  if (message.includes("429") || message.includes("resource exhausted") || message.includes("503") || message.includes("high demand")) {
    return {
      type: "rate_limit",
      userMessage:
        "AI director is experiencing high demand. Retrying automatically...",
      retryable: true,
    };
  }

  if (
    message.includes("401") ||
    message.includes("403") ||
    message.includes("api key")
  ) {
    return {
      type: "auth",
      userMessage: "Authentication error. Please check API configuration.",
      retryable: false,
    };
  }

  if (
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("network")
  ) {
    return {
      type: "network",
      userMessage: "Network error. Retrying...",
      retryable: true,
    };
  }

  if (message.includes("invalid") || message.includes("400")) {
    return {
      type: "validation",
      userMessage: "Invalid request. Please check your input.",
      retryable: false,
    };
  }

  return {
    type: "unknown",
    userMessage: "Unexpected error. Retrying...",
    retryable: true,
  };
}
