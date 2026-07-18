// src/server/middleware/auth-guard.ts
// Cloudflare Workers-compatible auth guard for SSR routes.
// Intercepts requests before SSR rendering, using Clerk JWT verification.
// This replaces the client-side auth check pattern for page routes.

import { verifyClerkToken, extractAuthToken, type AuthenticatedUser, type ClerkAuthConfig } from "./clerk-auth";

/**
 * Protected page routes — these require authentication before SSR renders.
 * Format: regex patterns matching URL pathnames.
 */
const PROTECTED_PAGE_ROUTES: RegExp[] = [
  /^\/studio/,
  /^\/dashboard/,
  /^\/chat/,
  /^\/editor/,
];

/**
 * Public page routes that never require auth.
 */
const PUBLIC_PAGE_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/landing/,
  /^\/api\/health/,
  /^\/api\/auth/,
  /^\/api\/webhooks/,
];

export interface AuthGuardResult {
  /** Whether the request is allowed to proceed. */
  allowed: boolean;
  /** The authenticated user (if auth was required and succeeded). */
  user?: AuthenticatedUser;
  /** Redirect URL (if the request should be redirected). */
  redirectTo?: string;
  /** Error message (if auth failed). */
  error?: string;
}

/**
 * Check if a page route requires authentication and verify the token.
 *
 * @param request - The incoming request
 * @param config - Clerk configuration
 * @returns Auth guard result with redirect URL if auth is needed
 */
export async function authGuard(
  request: Request,
  config: ClerkAuthConfig,
): Promise<AuthGuardResult> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  // Check public routes first — always allowed
  for (const pattern of PUBLIC_PAGE_ROUTES) {
    if (pattern.test(pathname)) {
      return { allowed: true };
    }
  }

  // Check if this is a protected page route
  let requiresAuth = false;
  for (const pattern of PROTECTED_PAGE_ROUTES) {
    if (pattern.test(pathname)) {
      requiresAuth = true;
      break;
    }
  }

  if (!requiresAuth) {
    return { allowed: true };
  }

  // Extract and verify token
  const token = extractAuthToken(request);
  if (!token) {
    // No token — redirect to sign-in
    const signInUrl = new URL("/", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return {
      allowed: false,
      redirectTo: signInUrl.toString(),
      error: "Authentication required",
    };
  }

  const authResult = await verifyClerkToken(token, config);

  if (!authResult.success) {
    // Invalid/expired token — redirect to sign-in
    const signInUrl = new URL("/", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    signInUrl.searchParams.set("error", "session_expired");
    return {
      allowed: false,
      redirectTo: signInUrl.toString(),
      error: authResult.error || "Authentication failed",
    };
  }

  return {
    allowed: true,
    user: authResult.user,
  };
}

/**
 * Create a 302 redirect response.
 */
export function createRedirectResponse(url: string): Response {
  return Response.redirect(url, 302);
}
