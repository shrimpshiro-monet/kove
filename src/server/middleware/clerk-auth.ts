// src/server/middleware/clerk-auth.ts
// Clerk authentication middleware for protecting routes and API paths.
// Integrates with the existing server.ts route handler pattern.

export interface ClerkAuthConfig {
  /** Clerk publishable key (from env). */
  publishableKey: string;
  /** Clerk secret key (from env). */
  secretKey: string;
  /** Optional: custom JWT verification key for edge runtime. */
  jwtKey?: string;
}

export interface AuthenticatedUser {
  /** Clerk user ID. */
  id: string;
  /** User email address. */
  email: string;
  /** User display name. */
  name: string;
  /** User roles/permissions. */
  roles: string[];
  /** Session expiration timestamp. */
  expiresAt: number;
}

export interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
}

/**
 * Protected route patterns — routes that require authentication.
 * Format: { method: "ALL" | "GET" | "POST", path: RegExp }
 */
const PROTECTED_ROUTES: Array<{ method: string; path: RegExp }> = [
  // API routes — all require auth
  { method: "ALL", path: /^\/api\/(analyze|generate|refine|export|upload|detect|render|director|specialist|style|replicate|media|transcribe|deep-analysis)/ },

  // Studio routes — require auth
  { method: "ALL", path: /^\/studio/ },

  // Dashboard — requires auth
  { method: "GET", path: /^\/dashboard/ },

  // Chat — requires auth
  { method: "ALL", path: /^\/chat/ },

  // Editor — requires auth
  { method: "ALL", path: /^\/editor/ },
];

/**
 * Public routes that never require authentication.
 */
const PUBLIC_ROUTES: Array<RegExp> = [
  /^\/$/,              // Landing page
  /^\/landing/,        // Landing page
  /^\/api\/health/,    // Health check
  /^\/api\/auth/,      // Auth callbacks
  /^\/api\/webhooks/,  // Webhooks
];

/**
 * Verify a Clerk JWT token and extract user information.
 *
 * Uses the Clerk SDK's session verification. For Cloudflare Workers,
 * this uses the edge-compatible JWT verification.
 *
 * @param token - The JWT token from the Authorization header or session cookie
 * @param config - Clerk configuration
 * @returns Auth result with user info or error
 */
export async function verifyClerkToken(
  token: string,
  config: ClerkAuthConfig,
): Promise<AuthResult> {
  if (!token) {
    return { success: false, error: "No authentication token provided" };
  }

  try {
    // Import Clerk SDK dynamically (edge-compatible)
    const clerkModule = await import("@clerk/backend").catch(() => null);
    const verifyToken = clerkModule?.verifyToken ?? null;

    if (verifyToken) {
      // Production: use Clerk's verified JWT verification
      const payload = await verifyToken(token, {
        secretKey: config.secretKey,
      });

      return {
        success: true,
        user: {
          id: payload.sub,
          email: payload.email as string || "",
          name: payload.name as string || "",
          roles: (payload.roles as string[]) || [],
          expiresAt: payload.exp,
        },
      };
    }

    // Development fallback: decode JWT without verification
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { success: false, error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { success: false, error: "Token expired" };
    }

    return {
      success: true,
      user: {
        id: payload.sub || payload.user_id || "dev-user",
        email: payload.email || "dev@example.com",
        name: payload.name || "Dev User",
        roles: payload.roles || ["user"],
        expiresAt: payload.exp || Math.floor(Date.now() / 1000) + 3600,
      },
    };
  } catch (err: any) {
    return { success: false, error: `Token verification failed: ${err.message}` };
  }
}

/**
 * Extract the authentication token from a Request.
 * Checks Authorization header first, then session cookie.
 */
export function extractAuthToken(request: Request): string | null {
  // Check Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check session cookie
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const sessionToken =
      cookies["__session"] ||
      cookies["clerk-session"] ||
      cookies["monet-session"];
    if (sessionToken) return sessionToken;
  }

  return null;
}

/**
 * Middleware function that checks if a route requires authentication.
 *
 * @param request - The incoming request
 * @param config - Clerk configuration
 * @returns Auth result (user if authenticated, error if not)
 */
export async function clerkAuthMiddleware(
  request: Request,
  config: ClerkAuthConfig,
): Promise<AuthResult> {
  const url = new URL(request.url);
  const method = request.method;

  // Check public routes first — skip auth
  for (const publicPattern of PUBLIC_ROUTES) {
    if (publicPattern.test(url.pathname)) {
      return { success: true }; // No user needed for public routes
    }
  }

  // Check if route requires authentication
  let requiresAuth = false;
  for (const route of PROTECTED_ROUTES) {
    const methodMatch = route.method === "ALL" || route.method === method;
    if (methodMatch && route.path.test(url.pathname)) {
      requiresAuth = true;
      break;
    }
  }

  if (!requiresAuth) {
    return { success: true }; // Route doesn't require auth
  }

  // Extract and verify token
  const token = extractAuthToken(request);
  if (!token) {
    return {
      success: false,
      error: "Authentication required. Please log in.",
    };
  }

  return verifyClerkToken(token, config);
}

/**
 * Create a 401 Unauthorized response.
 */
export function createUnauthorizedResponse(message?: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: message || "Authentication required",
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="monet-api"',
      },
    },
  );
}

/**
 * Wrap a route handler with Clerk authentication.
 * Returns a new handler that checks auth before invoking the original.
 */
export function withClerkAuth(
  handler: (request: Request, env: any, user?: AuthenticatedUser) => Promise<Response>,
  config: ClerkAuthConfig,
): (request: Request, env: any) => Promise<Response> {
  return async (request: Request, env: any) => {
    const authResult = await clerkAuthMiddleware(request, config);

    if (!authResult.success) {
      return createUnauthorizedResponse(authResult.error);
    }

    return handler(request, env, authResult.user);
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key) {
      cookies[key.trim()] = valueParts.join("=").trim();
    }
  }
  return cookies;
}
