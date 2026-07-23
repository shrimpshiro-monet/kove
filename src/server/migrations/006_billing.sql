-- Billing & Subscription tables
-- Paddle Billing (v2) integration for Kove MVP

-- User subscriptions: tracks Paddle subscription state per Clerk user
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  paddle_plan_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('free', 'active', 'cancelled', 'past_due')) DEFAULT 'free',
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_clerk ON user_subscriptions(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_sub_paddle_sub ON user_subscriptions(paddle_subscription_id);

-- Monthly usage tracking: edits per user per calendar month
CREATE TABLE IF NOT EXISTS billing_usage (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  year_month TEXT NOT NULL,  -- 'YYYY-MM' format
  edit_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(clerk_user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON billing_usage(clerk_user_id, year_month);
