# Affiliate Dashboard — Design Spec

## Overview

Build the affiliate/referral section of the Kove video app. Reskins Fey's stock analysis UI (dark financial dashboard, data-dense tables, chart cards) — "stocks" become referred users, "prices" become what they paid.

## Scope

Single-page feature inside the existing dashboard layout. No backend changes — all data from extended localStorage seed. Charts are nice-to-have, not blocking.

---

## 1. Route & Navigation

- **Route**: `src/routes/dashboard.affiliate.tsx` — TanStack nested route under `/dashboard`
- **URL**: `/dashboard/affiliate` via search param `page=affiliate`
- **Sidebar**: Add `{ id: "affiliate", label: "Affiliate" }` to `NAV_ITEMS` in `DashboardPage.tsx`
- **Page switch**: Extend the existing `page` state union from `"overview" | "projects"` to `"overview" | "projects" | "affiliate"`
- **Layout**: Renders inside `DashboardLayout` (sidebar + topbar unchanged)

---

## 2. Fey Theme Layer

Add `.theme-fey` class to `src/styles.css` following the existing `.theme-margalla` / `.theme-multan` pattern. The `AffiliatePage` wrapper applies `className="theme-fey"` to scope all token overrides.

### Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--background` | `#0a0a0b` | Page background |
| `--background-secondary` | `#0d0d10` | Elevated surfaces |
| `--background-tertiary` | `#131316` | Card/table surface |
| `--background-elevated` | `#1a1a1f` | Hover states, popovers |
| `--text-primary` | `#f2f2f0` | Headings, primary text |
| `--text-secondary` | `#9a9a9f` | Body text, descriptions |
| `--text-muted` | `#6b6b70` | Labels, column headers |
| `--text-tertiary` | `#4a4a4f` | Disabled, timestamps |
| `--card` | `#131316` | Card backgrounds |
| `--border` | `rgba(255,255,255,0.08)` | Hairline borders |
| `--border-hover` | `rgba(255,255,255,0.12)` | Border hover |
| `--accent` | Reuse main dashboard accent | Primary action color |
| `--status-success` | `#34d399` | Active/paid (mint green) |
| `--status-error` | `#ff5c5c` | Churned/failed |
| `--status-pending` | `#b8863a` | Neutral pending (amber) |

### Typography & Surface Rules

- All currency/number columns: `font-mono tabular-nums` (JetBrains Mono, digits align vertically)
- Cards: `rounded-2xl` (12–16px), `bg-[var(--card)]`, `border border-[var(--border)]`
- Table rows: sharp corners, no rounded backgrounds, hairline `border-b border-[var(--border)]`
- Small metric cards: match Fey's "Mkt cap / EV-Sales / P-E ratio" strip — horizontal row, compact padding

---

## 3. Data Model Extensions

Extend `src/stores/dashboard-store.ts` with:

```typescript
type PlanTier = "free" | "flux" | "nova";

interface AffiliateProfile {
  userId: string;
  customCode: string | null;
  tier: PlanTier;
  oneTimeBonusUnlocked: boolean;
  referredCount: number;
  threshold: number;
}

interface CommissionRecord {
  id: string;
  referredUserId: string;
  type: "one_time" | "recurring";
  planAtPayout: PlanTier;
  rate: number;
  amount: number;
  status: "paid" | "accrued" | "pending";
  createdAt: number;
}

interface ReferredUser {
  id: string;
  username: string;
  avatarInitials: string;
  joinedAt: number;
  planTier: PlanTier;
  totalSpend: number;
  commissionEarned: number;
  status: "active" | "pending" | "churned";
}
```

### Seed Data

- `affiliateProfile`: tier "flux", threshold 5, referredCount 3, oneTimeBonusUnlocked false
- `referredUsers`: 6–8 entries with varied tiers, statuses, spend amounts
- `commissionRecords`: 10–12 entries mixing one_time and recurring, paid/accrued/pending

### Commission Structure

| Plan | One-time (first qualifying referral) | Monthly recurring |
|---|---|---|
| Free | 10% | 0–1% |
| Flux | 20% | 0–8% |
| Nova | 30% | 0–15% |

- One-time bonus always pays first, on first qualifying referral
- Monthly recurring applies after, at affiliate's current plan rate
- Plan-at-time-of-payout tracked per commission record

---

## 4. Component Architecture

### `src/components/affiliate/AffiliatePage.tsx`

Route component. Wraps all children in a `div.theme-fey`. Composes the 6 sections vertically with consistent spacing (`space-y-6`).

### `src/components/affiliate/ReferralCodeCard.tsx`

- Card surface with input field for custom code claim
- Debounced availability check (300ms) as user types
- Green checkmark inline for available, red "taken" text for taken
- Once claimed: shows full link `yourapp.com/r/CODENAME` + copy button, input becomes read-only
- Copy button uses `navigator.clipboard.writeText()`

### `src/components/affiliate/ThresholdProgress.tsx`

- Label: "3 of 5 referred users" with horizontal progress bar
- Progress bar: thin, `rounded-full` track, accent-color fill
- Subtext: "Unlocks 30% one-time commission on your next qualifying referral"
- When threshold met: replaces bar with compact `✓ Bonus unlocked` badge

### `src/components/affiliate/TierSummaryCards.tsx`

Row of 4 metric cards matching Fey's stat strip layout:
1. Current plan/tier (Free / Flux / Nova) — with subtle upsell hint if not Nova
2. Monthly commission rate (current tier's rate)
3. Total earned all-time
4. Pending payout this cycle

Upsell hint (non-Nova): "Flux earns 2x the one-time bonus" — understated, `text-[var(--text-muted)]` style

### `src/components/affiliate/ReferredUsersTable.tsx`

Fey "Peer analysis" table reskin. Uses existing `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` primitives.

| Column | Fey Original | Affiliate Version |
|---|---|---|
| Ticker + name | Username / handle with avatar tile |
| "This stock" tag | "You referred" tag (omit if not first row) |
| FCF/share | Amount paid (LTM) |
| LTM revenue | Total spend |
| EV/sales | Plan tier |
| P/E ratio | Commission rate applied |
| Mkt Cap | Your commission earned |
| 1D returns | Status: green "Active" / amber "Pending" / red "Churned" |

- Avatar tile: 28×28 rounded-square with generated initials, colored by plan tier
- All monetary columns use `font-mono tabular-nums`
- Row hover: `bg-white/[0.02]`
- Paid vs accrued commission: green vs muted text distinction

### `src/components/affiliate/AffiliateCharts.tsx`

Two Recharts line charts side by side (using existing `ChartContainer`):
- Left: Referrals over time (simple line, like Fey's "Comparables average")
- Right: Earnings over time (line with area fill, like Fey's "Percent premium")
- 6M / 1Y toggle pills top-right of each chart
- Chart colors: accent for primary line, muted gray for average

### `src/components/affiliate/EmptyState.tsx`

When no referrals exist:
- "Share your code to start earning"
- Referral code displayed prominently
- CTA button to copy/share

---

## 5. Interaction & State Transitions

| State | UI Behavior |
|---|---|
| No referrals | EmptyState replaces table, code front and center |
| Code available | Green checkmark appears inline after debounce |
| Code taken | Red "taken" text under input, form stays functional |
| Code claimed | Input becomes read-only, full link + copy button |
| Threshold not met | Progress bar shows current/threshold count |
| Threshold met | Progress bar → "✓ Bonus unlocked" badge, permanent |
| Active referral | Green status pill |
| Pending commission | Amber status pill (not red) |
| Churned user | Red status text |
| Paid commission | Green text in commission column |
| Accrued (not paid) | Muted text in commission column |

---

## 6. Priority Order

1. Referred users table (core value)
2. Custom code claim flow + uniqueness check
3. Progress bar + tier summary cards
4. Charts (nice-to-have, not blocking)

---

## 7. Files to Create/Modify

| File | Action |
|---|---|
| `src/routes/dashboard.affiliate.tsx` | Create — route definition |
| `src/components/affiliate/AffiliatePage.tsx` | Create — main page component |
| `src/components/affiliate/ReferralCodeCard.tsx` | Create |
| `src/components/affiliate/ThresholdProgress.tsx` | Create |
| `src/components/affiliate/TierSummaryCards.tsx` | Create |
| `src/components/affiliate/ReferredUsersTable.tsx` | Create |
| `src/components/affiliate/AffiliateCharts.tsx` | Create |
| `src/components/affiliate/EmptyState.tsx` | Create |
| `src/styles.css` | Modify — add `.theme-fey` tokens |
| `src/stores/dashboard-store.ts` | Modify — extend types + seed data |
| `src/components/dashboard/DashboardPage.tsx` | Modify — add affiliate nav item + page switch |
| `src/routeTree.gen.ts` | Auto-generated (do not edit) |
