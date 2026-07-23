import { z } from "zod";
import type { Env } from "../../types/env";
import { apiError, ApiErrorCode, jsonResponse } from "../../lib/api-response";

const PADDLE_API_VERSION = "2024-10-22";

const CheckoutRequestSchema = z.object({
  priceId: z.string().min(1, "Paddle price ID is required"),
});

/**
 * POST /api/billing/checkout
 * Creates a Paddle transaction and returns checkout details for the frontend overlay.
 *
 * Flow:
 * 1. Frontend sends { priceId }
 * 2. Backend calls Paddle API to create a transaction
 * 3. Returns { transactionId, checkoutUrl } for Paddle.js overlay
 */
export async function handleCreateCheckout(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return apiError(ApiErrorCode.Unauthorized, "Authentication required", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = CheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      ApiErrorCode.InvalidRequest,
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  const { priceId } = parsed.data;

  // Get or create Paddle customer ID
  const sub = await env.DB.prepare(
    "SELECT paddle_customer_id FROM user_subscriptions WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{ paddle_customer_id: string | null }>();

  const paddleCustomerId = sub?.paddle_customer_id ?? null;

  const paddleApiKey = (env as any).PADDLE_API_KEY;
  const paddleEnv = (env as any).PADDLE_ENV || "sandbox";
  const baseUrl =
    paddleEnv === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";

  if (!paddleApiKey) {
    return apiError(ApiErrorCode.ConfigurationError, "Paddle API key not configured", 500);
  }

  try {
    // Create a Paddle transaction (v2 API)
    const transactionBody: Record<string, unknown> = {
      items: [
        {
          priceId,
          quantity: 1,
        },
      ],
      customData: {
        clerkUserId: userId,
      },
    };

    if (paddleCustomerId) {
      transactionBody.customerId = paddleCustomerId;
    }

    const resp = await fetch(`${baseUrl}/2.0/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": PADDLE_API_VERSION,
      },
      body: JSON.stringify(transactionBody),
    });

    const data = (await resp.json()) as {
      data?: { id: string; status: string; checkout?: { url: string } };
      error?: { code: string; message: string };
    };

    if (!resp.ok || !data.data) {
      console.error("[checkout] Paddle API error:", data);
      return apiError(
        ApiErrorCode.CheckoutFailed,
        data?.error?.message || `Paddle API returned ${resp.status}`,
        502,
      );
    }

    // Ensure a subscription row exists
    if (!sub) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO user_subscriptions (id, clerk_user_id, status, created_at, updated_at) VALUES (?, ?, 'free', ?, ?)"
      )
        .bind(crypto.randomUUID(), userId, Date.now(), Date.now())
        .run();
    }

    return jsonResponse({
      success: true,
      transactionId: data.data.id,
      status: data.data.status,
      checkoutUrl: data.data.checkout?.url ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[checkout] Error creating Paddle transaction:", message);
    return apiError(ApiErrorCode.CheckoutFailed, message, 500);
  }
}

/**
 * POST /api/billing/checkout/customer-portal
 * Returns a Paddle customer portal URL for managing subscriptions.
 */
export async function handleCustomerPortal(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return apiError(ApiErrorCode.Unauthorized, "Authentication required", 401);
  }

  const sub = await env.DB.prepare(
    "SELECT paddle_customer_id FROM user_subscriptions WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{ paddle_customer_id: string | null }>();

  if (!sub?.paddle_customer_id) {
    return apiError(ApiErrorCode.NoSubscription, "No active subscription found", 404);
  }

  const paddleApiKey = (env as any).PADDLE_API_KEY;
  const paddleEnv = (env as any).PADDLE_ENV || "sandbox";
  const baseUrl =
    paddleEnv === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";

  try {
    const resp = await fetch(
      `${baseUrl}/2.0/customers/${sub.paddle_customer_id}/portal/sessions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paddleApiKey}`,
          "Content-Type": "application/json",
          "Paddle-Version": PADDLE_API_VERSION,
        },
        body: JSON.stringify({}),
      },
    );

    const data = (await resp.json()) as {
      data?: { url: string };
      error?: { code: string; message: string };
    };

    if (!resp.ok || !data.data) {
      return apiError(
        ApiErrorCode.PortalFailed,
        data?.error?.message || "Failed to create portal session",
        502,
      );
    }

    return jsonResponse({
      success: true,
      portalUrl: data.data.url,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(ApiErrorCode.PortalFailed, message, 500);
  }
}
