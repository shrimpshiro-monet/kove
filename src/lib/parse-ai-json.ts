/**
 * Parse AI-generated JSON responses safely.
 * Strips markdown code fences, trims whitespace, and parses.
 * Returns null on failure instead of throwing.
 */
export function parseAIJson<T = unknown>(raw: unknown): T | null {
  try {
    let str: string;
    if (typeof raw === "string") {
      str = raw;
    } else if (typeof raw === "object" && raw !== null) {
      str = JSON.stringify(raw);
    } else {
      return null;
    }
    const stripped = str
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}
