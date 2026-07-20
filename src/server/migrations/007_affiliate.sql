-- Affiliate system tables
-- Tracks referral codes, referrals, and commissions

-- Affiliate profiles: one per user who opts into the program
CREATE TABLE IF NOT EXISTS affiliate_profiles (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  custom_code TEXT UNIQUE,
  tier TEXT NOT NULL CHECK(tier IN ('free', 'flux', 'nova')) DEFAULT 'free',
  one_time_bonus_unlocked INTEGER NOT NULL DEFAULT 0,
  referred_count INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aff_clerk ON affiliate_profiles(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_aff_code ON affiliate_profiles(custom_code);

-- Referrals: links an affiliate to a referred user
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  affiliate_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ref_affiliate ON referrals(affiliate_user_id);
CREATE INDEX IF NOT EXISTS idx_ref_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_ref_referred ON referrals(referred_user_id);

-- Commissions: one record per payout event (one-time or recurring)
CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  affiliate_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('one_time', 'recurring')),
  plan_at_payout TEXT NOT NULL CHECK(plan_at_payout IN ('free', 'flux', 'nova')),
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accrued', 'paid')) DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comm_affiliate ON commissions(affiliate_user_id);
CREATE INDEX IF NOT EXISTS idx_comm_referred ON commissions(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_comm_status ON commissions(status);
