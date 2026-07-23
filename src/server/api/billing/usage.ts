import type { Env } from "../../types/env";
import { jsonResponse } from "../../lib/api-response";

const FREE_TIER_EDIT_LIMIT = 5;

function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * GET /api/billing/usage
 * Returns current month's edit count and whether user has exceeded free tier.
 */
export async function handleGetUsage(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return jsonResponse({ success: false, error: "Missing user ID" }, 401);
  }

  const yearMonth = getCurrentYearMonth();

  // Get or create usage record
  let usage = await env.DB.prepare(
    "SELECT edit_count FROM billing_usage WHERE clerk_user_id = ? AND year_month = ?"
  )
    .bind(userId, yearMonth)
    .first<{ edit_count: number }>();

  if (!usage) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO billing_usage (id, clerk_user_id, year_month, edit_count, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)"
    )
      .bind(
        crypto.randomUUID(),
        userId,
        yearMonth,
        Date.now(),
        Date.now(),
      )
      .run();
    usage = { edit_count: 0 };
  }

  // Get subscription status
  const sub = await env.DB.prepare(
    "SELECT status FROM user_subscriptions WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{ status: string }>();

  const tier = sub?.status === "active" ? "pro" : "free";
  const editCount = usage.edit_count;
  const limit = tier === "pro" ? Infinity : FREE_TIER_EDIT_LIMIT;
  const remaining = tier === "pro" ? -1 : Math.max(0, limit - editCount);
  const exceeded = tier === "free" && editCount >= FREE_TIER_EDIT_LIMIT;

  return jsonResponse({
    success: true,
    tier,
    yearMonth,
    editCount,
    limit: tier === "pro" ? "unlimited" : FREE_TIER_EDIT_LIMIT,
    remaining: tier === "pro" ? "unlimited" : remaining,
    exceeded,
    upgradeUrl: "/pricing",
  });
}

/**
 * POST /api/billing/usage/increment
 * Increments the edit count for the current month. Called by generation endpoints.
 */
export async function handleIncrementUsage(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return jsonResponse({ success: false, error: "Missing user ID" }, 401);
  }

  const yearMonth = getCurrentYearMonth();

  // Check current usage
  const usage = await env.DB.prepare(
    "SELECT edit_count FROM billing_usage WHERE clerk_user_id = ? AND year_month = ?"
  )
    .bind(userId, yearMonth)
    .first<{ edit_count: number }>();

  const currentCount = usage?.edit_count ?? 0;

  // Check subscription
  const sub = await env.DB.prepare(
    "SELECT status FROM user_subscriptions WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{ status: string }>();

  const tier = sub?.status === "active" ? "pro" : "free";

  if (tier === "free" && currentCount >= FREE_TIER_EDIT_LIMIT) {
    return jsonResponse(
      {
        success: false,
        error: "Free tier edit limit reached",
        code: "USAGE_LIMIT_EXCEEDED",
        editCount: currentCount,
        limit: FREE_TIER_EDIT_LIMIT,
        upgradeUrl: "/pricing",
      },
      403,
    );
  }

  // Increment
  if (usage) {
    await env.DB.prepare(
      "UPDATE billing_usage SET edit_count = edit_count + 1, updated_at = ? WHERE clerk_user_id = ? AND year_month = ?"
    )
      .bind(Date.now(), userId, yearMonth)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO billing_usage (id, clerk_user_id, year_month, edit_count, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
    )
      .bind(crypto.randomUUID(), userId, yearMonth, Date.now(), Date.now())
      .run();
  }

  return jsonResponse({
    success: true,
    editCount: currentCount + 1,
    tier,
    remaining: tier === "pro" ? "unlimited" : Math.max(0, FREE_TIER_EDIT_LIMIT - currentCount - 1),
  });
}
