import type { Env } from "../../types/env";
import { jsonResponse } from "../../lib/api-response";

const PADDLE_WEBHOOK_VERSION = "1";

/**
 * Verify Paddle webhook signature using HMAC-SHA256.
 * Paddle signs the raw body with the webhook secret.
 */
async function verifyWebhookSignature(
  body: string,
  secretKey: string,
  signatureHeader: string,
): Promise<boolean> {
  try {
    // Paddle signature format: "ts=<timestamp>;h1=<hex_digest>"
    const parts = Object.fromEntries(
      signatureHeader.split(";").map((p) => {
        const [k, ...v] = p.split("=");
        return [k.trim(), v.join("=").trim()];
      }),
    );

    const hmac = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signedPayload = `${parts.ts}:${body}`;
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      hmac,
      new TextEncoder().encode(signedPayload),
    );

    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === parts.h1;
  } catch {
    return false;
  }
}

interface PaddleEvent {
  event_id: string;
  event_type: string;
  data: Record<string, unknown>;
}

/**
 * Ensure the user_subscriptions row exists for a given Clerk user ID.
 */
async function ensureSubscriptionRow(
  db: D1Database,
  clerkUserId: string,
): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM user_subscriptions WHERE clerk_user_id = ?")
    .bind(clerkUserId)
    .first();

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO user_subscriptions (id, clerk_user_id, status, created_at, updated_at) VALUES (?, ?, 'free', ?, ?)",
      )
      .bind(crypto.randomUUID(), clerkUserId, Date.now(), Date.now())
      .run();
  }
}

/**
 * Handle transaction.completed — activate subscription.
 */
async function handleTransactionCompleted(
  db: D1Database,
  data: Record<string, unknown>,
): Promise<void> {
  const customData = data.customData as Record<string, string> | undefined;
  const clerkUserId = customData?.clerkUserId;
  if (!clerkUserId) {
    console.warn("[webhook] transaction.completed missing clerkUserId in customData");
    return;
  }

  const subscriptionId = data.subscriptionId as string | undefined;
  const customerId = data.customerId as string | undefined;
  const planId = (data.items as Array<{ priceId: string }> | undefined)?.[0]?.priceId;

  await ensureSubscriptionRow(db, clerkUserId);

  const now = Date.now();
  await db
    .prepare(
      `UPDATE user_subscriptions
       SET paddle_customer_id = COALESCE(?, paddle_customer_id),
           paddle_subscription_id = COALESCE(?, paddle_subscription_id),
           paddle_plan_id = COALESCE(?, paddle_plan_id),
           status = 'active',
           updated_at = ?
       WHERE clerk_user_id = ?`,
    )
    .bind(customerId ?? null, subscriptionId ?? null, planId ?? null, now, clerkUserId)
    .run();

  console.log(`[webhook] Activated subscription for user ${clerkUserId}`);
}

/**
 * Handle subscription.updated — sync status changes.
 */
async function handleSubscriptionUpdated(
  db: D1Database,
  data: Record<string, unknown>,
): Promise<void> {
  const paddleSubId = data.id as string | undefined;
  if (!paddleSubId) return;

  const status = data.status as string | undefined;
  const cancelAtPeriodEnd = data.cancelAtPeriodEnd as boolean | undefined;

  // Map Paddle status to our status
  let mappedStatus: "active" | "cancelled" | "past_due" | "free";
  switch (status) {
    case "active":
      mappedStatus = "active";
      break;
    case "cancelled":
    case "past_due":
      mappedStatus = status;
      break;
    default:
      mappedStatus = "active";
  }

  const now = Date.now();
  await db
    .prepare(
      `UPDATE user_subscriptions
       SET status = ?, cancel_at_period_end = ?, updated_at = ?
       WHERE paddle_subscription_id = ?`,
    )
    .bind(mappedStatus, cancelAtPeriodEnd ? 1 : 0, now, paddleSubId)
    .run();

  console.log(`[webhook] Updated subscription ${paddleSubId} → ${mappedStatus}`);
}

/**
 * Handle subscription.cancelled — deactivate subscription.
 */
async function handleSubscriptionCancelled(
  db: D1Database,
  data: Record<string, unknown>,
): Promise<void> {
  const paddleSubId = data.id as string | undefined;
  if (!paddleSubId) return;

  const now = Date.now();
  await db
    .prepare(
      `UPDATE user_subscriptions
       SET status = 'cancelled', cancel_at_period_end = 1, updated_at = ?
       WHERE paddle_subscription_id = ?`,
    )
    .bind(now, paddleSubId)
    .run();

  console.log(`[webhook] Cancelled subscription ${paddleSubId}`);
}

/**
 * POST /api/billing/webhook
 * Receives Paddle webhook events. Raw body required for HMAC verification.
 *
 * NOTE: This route is in PUBLIC_ROUTES (no auth) — signature verification
 * is the auth mechanism.
 */
export async function handleBillingWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const webhookSecret = (env as any).PADDLE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] PADDLE_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("paddle-signature") ?? "";

  if (!signatureHeader) {
    return new Response("Missing paddle-signature header", { status: 401 });
  }

  // Verify HMAC signature
  const isValid = await verifyWebhookSignature(rawBody, webhookSecret, signatureHeader);
  if (!isValid) {
    console.error("[webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log(`[webhook] Received event: ${event.event_type} (${event.event_id})`);

  try {
    switch (event.event_type) {
      case "transaction.completed":
        await handleTransactionCompleted(env.DB, event.data);
        break;

      case "subscription.updated":
        await handleSubscriptionUpdated(env.DB, event.data);
        break;

      case "subscription.cancelled":
        await handleSubscriptionCancelled(env.DB, event.data);
        break;

      default:
        console.log(`[webhook] Unhandled event type: ${event.event_type}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] Error handling ${event.event_type}:`, message);
    return new Response("Internal error", { status: 500 });
  }
}
