import type { Env } from "../../types/env";
import { jsonResponse, apiError, ApiErrorCode } from "../../lib/api-response";

const COMMISSION_RATES: Record<string, { oneTime: number; recurringMin: number; recurringMax: number }> = {
  free: { oneTime: 0.10, recurringMin: 0, recurringMax: 0.01 },
  flux: { oneTime: 0.20, recurringMin: 0, recurringMax: 0.08 },
  nova: { oneTime: 0.30, recurringMin: 0, recurringMax: 0.15 },
};

export function getCommissionRate(tier: string, type: "one_time" | "recurring"): number {
  const rates = COMMISSION_RATES[tier] ?? COMMISSION_RATES.free;
  if (type === "one_time") return rates.oneTime;
  return (rates.recurringMin + rates.recurringMax) / 2;
}

function tierFromPaddlePlan(planId: string | null | undefined): string {
  if (!planId) return "free";
  if (planId.includes("nova")) return "nova";
  if (planId.includes("flux")) return "flux";
  return "free";
}

/**
 * GET /api/affiliate/profile
 * Returns the affiliate's profile, or creates one if they don't exist.
 */
export async function handleGetAffiliateProfile(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return apiError(ApiErrorCode.Unauthorized, "Missing user ID", 401);
  }

  let profile = await env.DB.prepare(
    "SELECT * FROM affiliate_profiles WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{
      id: string;
      clerk_user_id: string;
      custom_code: string | null;
      tier: string;
      one_time_bonus_unlocked: number;
      referred_count: number;
      threshold: number;
      created_at: number;
      updated_at: number;
    }>();

  if (!profile) {
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO affiliate_profiles (id, clerk_user_id, tier, created_at, updated_at) VALUES (?, ?, 'free', ?, ?)"
    )
      .bind(id, userId, now, now)
      .run();

    profile = {
      id,
      clerk_user_id: userId,
      custom_code: null,
      tier: "free",
      one_time_bonus_unlocked: 0,
      referred_count: 0,
      threshold: 5,
      created_at: now,
      updated_at: now,
    };
  }

  // Sync tier from subscription
  const sub = await env.DB.prepare(
    "SELECT paddle_plan_id, status FROM user_subscriptions WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{ paddle_plan_id: string | null; status: string }>();

  const realTier = sub?.status === "active" ? tierFromPaddlePlan(sub?.paddle_plan_id) : "free";
  if (realTier !== profile.tier) {
    await env.DB.prepare(
      "UPDATE affiliate_profiles SET tier = ?, updated_at = ? WHERE clerk_user_id = ?"
    )
      .bind(realTier, Date.now(), userId)
      .run();
    profile.tier = realTier;
  }

  return jsonResponse({
    success: true,
    profile: {
      userId: profile.clerk_user_id,
      customCode: profile.custom_code,
      tier: profile.tier,
      oneTimeBonusUnlocked: profile.one_time_bonus_unlocked === 1,
      referredCount: profile.referred_count,
      threshold: profile.threshold,
    },
  });
}

/**
 * GET /api/affiliate/referrals
 * Returns all users referred by the current affiliate.
 */
export async function handleGetAffiliateReferrals(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return apiError(ApiErrorCode.Unauthorized, "Missing user ID", 401);
  }

  const referrals = await env.DB.prepare(
    `SELECT r.id, r.referred_user_id, r.created_at,
            COALESCE(s.status, 'free') as user_status,
            COALESCE(s.paddle_plan_id, '') as user_plan_id
     FROM referrals r
     LEFT JOIN user_subscriptions s ON r.referred_user_id = s.clerk_user_id
     WHERE r.affiliate_user_id = ?
     ORDER BY r.created_at DESC`
  )
    .bind(userId)
    .all<{
      id: string;
      referred_user_id: string;
      created_at: number;
      user_status: string;
      user_plan_id: string;
    }>();

  const result = referrals.results.map((r) => ({
    id: r.id,
    username: r.referred_user_id.slice(0, 8),
    avatarInitials: r.referred_user_id.slice(0, 2).toUpperCase(),
    joinedAt: r.created_at,
    planTier: r.user_status === "active" ? tierFromPaddlePlan(r.user_plan_id) : "free",
    status: r.user_status === "active" ? "active" : r.user_status === "cancelled" ? "churned" : "pending",
  }));

  return jsonResponse({ success: true, referrals: result });
}

/**
 * GET /api/affiliate/commissions
 * Returns all commission records for the current affiliate.
 */
export async function handleGetAffiliateCommissions(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return apiError(ApiErrorCode.Unauthorized, "Missing user ID", 401);
  }

  const commissions = await env.DB.prepare(
    `SELECT * FROM commissions WHERE affiliate_user_id = ? ORDER BY created_at DESC`
  )
    .bind(userId)
    .all<{
      id: string;
      affiliate_user_id: string;
      referred_user_id: string;
      type: string;
      plan_at_payout: string;
      rate: number;
      amount: number;
      status: string;
      created_at: number;
    }>();

  return jsonResponse({
    success: true,
    commissions: commissions.results.map((c) => ({
      id: c.id,
      referredUserId: c.referred_user_id,
      type: c.type,
      planAtPayout: c.plan_at_payout,
      rate: c.rate,
      amount: c.amount,
      status: c.status,
      createdAt: c.created_at,
    })),
  });
}

/**
 * POST /api/affiliate/claim-code
 * Claim a custom referral code. Checks uniqueness.
 */
export async function handleClaimAffiliateCode(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    return apiError(ApiErrorCode.Unauthorized, "Missing user ID", 401);
  }

  const body = await request.json<{ code: string }>();
  const code = body.code?.trim().toLowerCase();

  if (!code || code.length < 3 || code.length > 20) {
    return apiError(ApiErrorCode.InvalidRequest, "Code must be 3-20 characters", 400);
  }

  if (!/^[a-z0-9_-]+$/.test(code)) {
    return apiError(ApiErrorCode.InvalidRequest, "Code can only contain letters, numbers, hyphens, and underscores", 400);
  }

  // Check if code is taken
  const existing = await env.DB.prepare(
    "SELECT id FROM affiliate_profiles WHERE custom_code = ?"
  )
    .bind(code)
    .first();

  if (existing) {
    return apiError(ApiErrorCode.InvalidRequest, "Code already taken", 409);
  }

  // Ensure profile exists
  const profile = await env.DB.prepare(
    "SELECT id, custom_code FROM affiliate_profiles WHERE clerk_user_id = ?"
  )
    .bind(userId)
    .first<{ id: string; custom_code: string | null }>();

  if (!profile) {
    return apiError(ApiErrorCode.InvalidRequest, "Affiliate profile not found", 404);
  }

  if (profile.custom_code) {
    return apiError(ApiErrorCode.InvalidRequest, "Code already claimed", 400);
  }

  await env.DB.prepare(
    "UPDATE affiliate_profiles SET custom_code = ?, updated_at = ? WHERE clerk_user_id = ?"
  )
    .bind(code, Date.now(), userId)
    .run();

  return jsonResponse({ success: true, code });
}

/**
 * POST /api/affiliate/track-referral
 * Called when a user signs up with a referral code (from cookie).
 * Creates the referral link and affiliate profile if needed.
 */
export async function handleTrackReferral(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.json<{ code: string; newUserId: string }>();
  const { code, newUserId } = body;

  if (!code || !newUserId) {
    return apiError(ApiErrorCode.InvalidRequest, "Missing code or newUserId", 400);
  }

  // Find affiliate by code
  const affiliate = await env.DB.prepare(
    "SELECT clerk_user_id FROM affiliate_profiles WHERE custom_code = ?"
  )
    .bind(code.toLowerCase())
    .first<{ clerk_user_id: string }>();

  if (!affiliate) {
    return apiError(ApiErrorCode.InvalidRequest, "Invalid referral code", 404);
  }

  // Check if user was already referred
  const existingRef = await env.DB.prepare(
    "SELECT id FROM referrals WHERE referred_user_id = ?"
  )
    .bind(newUserId)
    .first();

  if (existingRef) {
    return jsonResponse({ success: true, message: "Already referred" });
  }

  // Create referral
  const referralId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO referrals (id, affiliate_user_id, referred_user_id, referral_code, created_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(referralId, affiliate.clerk_user_id, newUserId, code.toLowerCase(), Date.now())
    .run();

  // Increment affiliate's referral count
  await env.DB.prepare(
    "UPDATE affiliate_profiles SET referred_count = referred_count + 1, updated_at = ? WHERE clerk_user_id = ?"
  )
    .bind(Date.now(), affiliate.clerk_user_id)
    .run();

  console.log(`[affiliate] Tracked referral: ${code} → ${newUserId}`);

  return jsonResponse({ success: true, referralId });
}
