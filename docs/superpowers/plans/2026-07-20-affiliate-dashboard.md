# Affiliate Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the affiliate/referral dashboard page with Fey-inspired dark financial UI, referred users table, custom code claim flow, progress bar, tier summary cards, and charts.

**Architecture:** Single-page feature inside existing TanStack dashboard layout. New route `/dashboard/affiliate` with scoped `.theme-fey` CSS tokens. Extended localStorage store with affiliate types and seed data. Component-per-section in `src/components/affiliate/`.

**Tech Stack:** React 19, TanStack Router, Tailwind CSS v4, Recharts, Radix UI (Progress, Avatar), `cn()` utility from `@/lib/utils`.

## Global Constraints

- Near-black backgrounds: `#0a0a0b` / `#0d0d10`
- Card surfaces: `#131316`, 1px hairline border `rgba(255,255,255,0.08)`
- Text: primary `#f2f2f0`, secondary `#9a9a9f`, muted `#6b6b70`
- Positive delta: mint green `#34d399` — for gains/active/paid
- Negative/error: muted red `#ff5c5c` — for churned/failed only
- Pending: neutral amber `#b8863a` — not red
- Rounded corners: 12–16px on cards, sharp table rows with hairline dividers
- Font: `tabular-nums` on all currency/number columns (JetBrains Mono)
- No `any` types — design the type or use `unknown`
- All data from localStorage seed — no backend calls

---

## Task 1: Fey Theme Tokens

**Files:**
- Modify: `src/styles.css:359-359` (insert before light theme block)

**Interfaces:**
- Consumes: none
- Produces: `.theme-fey` CSS class usable by any component via `className="theme-fey"`

- [ ] **Step 1: Add `.theme-fey` CSS class to styles.css**

Insert the following block after the `.theme-multan` closing brace (line 359) and before the light theme block (line 366):

```css
/*
 * ─────────────────────────────────────────────────────────────
 * .theme-fey — Fey financial dashboard (affiliate section)
 * ─────────────────────────────────────────────────────────────
 */
:root.theme-fey,
.theme-fey {
  --background: #0a0a0b;
  --background-secondary: #0d0d10;
  --background-tertiary: #131316;
  --background-elevated: #1a1a1f;

  --foreground: #f2f2f0;
  --text-primary: #f2f2f0;
  --text-secondary: #9a9a9f;
  --text-muted: #6b6b70;
  --text-tertiary: #4a4a4f;

  --card: #131316;
  --card-foreground: #f2f2f0;
  --popover: #1a1a1f;
  --popover-foreground: #f2f2f0;

  --primary: var(--accent);
  --primary-foreground: #f2f2f0;
  --primary-hover: var(--accent);
  --primary-active: var(--accent);

  --secondary: #1a1a1f;
  --secondary-foreground: #f2f2f0;
  --muted: #1a1a1f;
  --muted-foreground: #6b6b70;
  --accent: var(--accent);
  --accent-foreground: #f2f2f0;

  --destructive: #ff5c5c;
  --destructive-foreground: #f2f2f0;

  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.12);
  --border-active: rgba(255, 255, 255, 0.16);
  --border-strong: rgba(255, 255, 255, 0.20);
  --input: #131316;
  --ring: var(--accent);

  --status-success: #34d399;
  --status-warning: #b8863a;
  --status-info: #5A7A9A;
  --status-error: #ff5c5c;

  --chart-1: var(--accent);
  --chart-2: #9a9a9f;
  --chart-3: #34d399;
  --chart-4: #b8863a;
  --chart-5: #6b6b70;
}
```

- [ ] **Step 2: Verify styles compile**

Run: `pnpm dev` (in background), open browser, check no CSS errors in console.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add .theme-fey CSS tokens for affiliate dashboard"
```

---

## Task 2: Extend Store with Affiliate Types & Seed Data

**Files:**
- Modify: `src/stores/dashboard-store.ts:1-298` (types section + seed + hook)

**Interfaces:**
- Consumes: none
- Produces: `PlanTier`, `AffiliateProfile`, `CommissionRecord`, `ReferredUser` types; `state.affiliateProfile`, `state.referredUsers`, `state.commissionRecords` on `DashboardState`; `claimCustomCode()` and `checkCodeAvailability()` on the hook return

- [ ] **Step 1: Add new types after existing type definitions**

Insert after line 76 (`export interface DashboardSettings { ... }`) and before line 78 (`export interface DashboardState {`):

```typescript
export type PlanTier = "free" | "flux" | "nova";

export interface AffiliateProfile {
  userId: string;
  customCode: string | null;
  tier: PlanTier;
  oneTimeBonusUnlocked: boolean;
  referredCount: number;
  threshold: number;
}

export interface CommissionRecord {
  id: string;
  referredUserId: string;
  type: "one_time" | "recurring";
  planAtPayout: PlanTier;
  rate: number;
  amount: number;
  status: "paid" | "accrued" | "pending";
  createdAt: number;
}

export interface ReferredUser {
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

- [ ] **Step 2: Extend `DashboardState` interface**

Replace the existing `DashboardState` (lines 69–76) with:

```typescript
export interface DashboardState {
  projects: Project[];
  referralLinks: ReferralLink[];
  transactions: Transaction[];
  payouts: Payout[];
  referrals: Referral[];
  settings: DashboardSettings;
  affiliateProfile: AffiliateProfile;
  referredUsers: ReferredUser[];
  commissionRecords: CommissionRecord[];
}
```

- [ ] **Step 3: Add affiliate seed data to SEED constant**

Add these three arrays inside the `SEED` object, after the `settings` block (after line 149):

```typescript
  affiliateProfile: {
    userId: "current-user",
    customCode: null,
    tier: "flux" as const,
    oneTimeBonusUnlocked: false,
    referredCount: 3,
    threshold: 5,
  },
  referredUsers: [
    { id: uid(), username: "@designstudio", avatarInitials: "DS", joinedAt: daysAgo(1), planTier: "nova" as const, totalSpend: 2400, commissionEarned: 480, status: "active" as const },
    { id: uid(), username: "@videopro", avatarInitials: "VP", joinedAt: daysAgo(14), planTier: "flux" as const, totalSpend: 1200, commissionEarned: 240, status: "active" as const },
    { id: uid(), username: "@motiongraphics", avatarInitials: "MG", joinedAt: daysAgo(30), planTier: "flux" as const, totalSpend: 800, commissionEarned: 160, status: "active" as const },
    { id: uid(), username: "@creativelab", avatarInitials: "CL", joinedAt: daysAgo(45), planTier: "free" as const, totalSpend: 400, commissionEarned: 80, status: "pending" as const },
    { id: uid(), username: "@filmmakers", avatarInitials: "FM", joinedAt: daysAgo(60), planTier: "flux" as const, totalSpend: 600, commissionEarned: 120, status: "active" as const },
    { id: uid(), username: "@studioflow", avatarInitials: "SF", joinedAt: daysAgo(75), planTier: "free" as const, totalSpend: 200, commissionEarned: 40, status: "churned" as const },
    { id: uid(), username: "@editpro", avatarInitials: "EP", joinedAt: daysAgo(90), planTier: "nova" as const, totalSpend: 3600, commissionEarned: 720, status: "active" as const },
  ],
  commissionRecords: [
    { id: uid(), referredUserId: "r1", type: "one_time", planAtPayout: "flux", rate: 20, amount: 480, status: "paid", createdAt: daysAgo(1) },
    { id: uid(), referredUserId: "r2", type: "recurring", planAtPayout: "flux", rate: 5, amount: 60, status: "paid", createdAt: daysAgo(7) },
    { id: uid(), referredUserId: "r3", type: "recurring", planAtPayout: "flux", rate: 5, amount: 40, status: "paid", createdAt: daysAgo(7) },
    { id: uid(), referredUserId: "r4", type: "recurring", planAtPayout: "flux", rate: 4, amount: 16, status: "accrued", createdAt: daysAgo(14) },
    { id: uid(), referredUserId: "r5", type: "recurring", planAtPayout: "flux", rate: 6, amount: 36, status: "paid", createdAt: daysAgo(14) },
    { id: uid(), referredUserId: "r6", type: "recurring", planAtPayout: "flux", rate: 3, amount: 6, status: "pending", createdAt: daysAgo(30) },
    { id: uid(), referredUserId: "r7", type: "recurring", planAtPayout: "flux", rate: 7, amount: 252, status: "paid", createdAt: daysAgo(30) },
    { id: uid(), referredUserId: "r1", type: "recurring", planAtPayout: "flux", rate: 5, amount: 120, status: "paid", createdAt: daysAgo(30) },
    { id: uid(), referredUserId: "r2", type: "recurring", planAtPayout: "flux", rate: 5, amount: 60, status: "accrued", createdAt: daysAgo(30) },
    { id: uid(), referredUserId: "r3", type: "recurring", planAtPayout: "flux", rate: 5, amount: 40, status: "pending", createdAt: daysAgo(30) },
    { id: uid(), referredUserId: "r5", type: "recurring", planAtPayout: "flux", rate: 6, amount: 36, status: "accrued", createdAt: daysAgo(30) },
  ],
```

- [ ] **Step 4: Add `claimCustomCode` and `checkCodeAvailability` to the hook**

Add before the `return` statement (before line 283):

```typescript
  // ── Affiliate ──

  const claimCustomCode = useCallback((code: string) => {
    patch((s) => {
      s.affiliateProfile.customCode = code;
    });
  }, [patch]);

  const checkCodeAvailability = useCallback((code: string): boolean => {
    const taken = ["taken", "reserved", "admin", "kove"];
    return !taken.includes(code.toLowerCase());
  }, []);
```

- [ ] **Step 5: Expose new values in the return object**

Extend the return statement (line 283–297) to include:

```typescript
    claimCustomCode,
    checkCodeAvailability,
    affiliateProfile: state.affiliateProfile,
    referredUsers: state.referredUsers,
    commissionRecords: state.commissionRecords,
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/dashboard-store.ts
git commit -m "feat: extend store with affiliate types, seed data, and claim logic"
```

---

## Task 3: Wire Route & Navigation

**Files:**
- Modify: `src/routes/dashboard.tsx:4-13` (extend search param type)
- Modify: `src/components/dashboard/DashboardPage.tsx:13-16, 73, 79-81, 90-98, 197-202` (nav items, page state, navigation, conditional render)

**Interfaces:**
- Consumes: `AffiliateProfile`, `ReferredUser`, `CommissionRecord` from store (Task 2)
- Produces: `/dashboard/affiliate` URL renders `AffiliatePage`, sidebar shows "Affiliate" nav item

- [ ] **Step 1: Extend route search param type**

Replace `src/routes/dashboard.tsx` entirely:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../components/dashboard/DashboardPage";

interface DashboardSearch {
  page?: "overview" | "projects" | "affiliate";
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    page: (search.page as "overview" | "projects" | "affiliate") || "overview",
  }),
});
```

- [ ] **Step 2: Add "Affiliate" nav item**

In `src/components/dashboard/DashboardPage.tsx`, replace lines 13–16:

```typescript
const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "affiliate", label: "Affiliate" },
];
```

- [ ] **Step 3: Extend page state type**

In `DashboardPage.tsx`, replace line 73:

```typescript
  const [page, setPage] = useState<"overview" | "projects" | "affiliate">("overview");
```

- [ ] **Step 4: Extend URL sync useEffect**

In `DashboardPage.tsx`, replace lines 79–81:

```typescript
  useEffect(() => {
    if (pageParam === "projects") setPage("projects");
    else if (pageParam === "affiliate") setPage("affiliate");
  }, [pageParam]);
```

- [ ] **Step 5: Extend handleNavigate**

Replace lines 90–98:

```typescript
  const handleNavigate = (p: string) => {
    if (p === "projects") {
      setPage("projects");
      navigate({ to: "/dashboard", search: { page: "projects" } });
    } else if (p === "affiliate") {
      setPage("affiliate");
      navigate({ to: "/dashboard", search: { page: "affiliate" } });
    } else {
      setPage("overview");
      navigate({ to: "/dashboard" });
    }
  };
```

- [ ] **Step 6: Add affiliate page conditional render**

In the JSX, replace the ternary block (lines 118–202) with:

```tsx
      {page === "overview" ? (
        <div className="flex flex-col items-center min-h-[calc(100vh-120px)] -mt-16">
          {/* ... existing overview content unchanged ... */}
        </div>
      ) : page === "projects" ? (
        <ProjectsPage
          projects={projects}
          onAdd={addProject}
        />
      ) : (
        <AffiliatePage />
      )}
```

Add import at top of file:

```typescript
import { AffiliatePage } from "../affiliate/AffiliatePage";
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/dashboard.tsx src/components/dashboard/DashboardPage.tsx
git commit -m "feat: wire affiliate route and sidebar navigation"
```

---

## Task 4: EmptyState Component

**Files:**
- Create: `src/components/affiliate/EmptyState.tsx`

**Interfaces:**
- Consumes: `customCode: string | null` from affiliate profile
- Produces: `<EmptyState>` component

- [ ] **Step 1: Create EmptyState component**

```tsx
// src/components/affiliate/EmptyState.tsx
import { useState } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  customCode: string | null;
  onCopy: (text: string) => void;
}

export function EmptyState({ customCode, onCopy }: EmptyStateProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const link = `yourapp.com/r/${customCode}`;
    onCopy(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--background-tertiary)] border border-[var(--border)] flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-[var(--text-muted)]">
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
          <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">Share your code to start earning</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-xs">
        Refer friends and earn commissions on their subscriptions
      </p>
      {customCode && (
        <div className="flex items-center gap-2">
          <code className="px-3 py-1.5 bg-[var(--background-tertiary)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--text-primary)]">
            yourapp.com/r/{customCode}
          </code>
          <button
            onClick={handleCopy}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              copied
                ? "bg-[var(--status-success)] text-[#0a0a0b]"
                : "bg-[var(--background-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/EmptyState.tsx
git commit -m "feat: add affiliate empty state component"
```

---

## Task 5: ReferralCodeCard Component

**Files:**
- Create: `src/components/affiliate/ReferralCodeCard.tsx`

**Interfaces:**
- Consumes: `customCode: string | null`, `claimCustomCode(code: string)`, `checkCodeAvailability(code: string): boolean` from store
- Produces: `<ReferralCodeCard>` component

- [ ] **Step 1: Create ReferralCodeCard component**

```tsx
// src/components/affiliate/ReferralCodeCard.tsx
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ReferralCodeCardProps {
  customCode: string | null;
  claimCustomCode: (code: string) => void;
  checkCodeAvailability: (code: string) => boolean;
}

export function ReferralCodeCard({ customCode, claimCustomCode, checkCodeAvailability }: ReferralCodeCardProps) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [copied, setCopied] = useState(false);

  const isClaimed = customCode !== null;

  const debouncedCheck = useCallback(
    (value: string) => {
      if (value.length < 3) {
        setStatus("idle");
        return;
      }
      setStatus("checking");
      const timer = setTimeout(() => {
        const available = checkCodeAvailability(value);
        setStatus(available ? "available" : "taken");
      }, 300);
      return () => clearTimeout(timer);
    },
    [checkCodeAvailability]
  );

  useEffect(() => {
    if (isClaimed) return;
    const cleanup = debouncedCheck(input);
    return cleanup;
  }, [input, isClaimed, debouncedCheck]);

  const handleClaim = () => {
    if (status === "available" && input.length >= 3) {
      claimCustomCode(input);
    }
  };

  const handleCopy = () => {
    if (!customCode) return;
    navigator.clipboard.writeText(`yourapp.com/r/${customCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Your referral code</h3>
        {isClaimed && (
          <span className="text-[10px] font-medium text-[var(--status-success)] bg-[var(--status-success)]/10 px-2 py-0.5 rounded-full">
            Claimed
          </span>
        )}
      </div>

      {isClaimed ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--text-primary)] truncate">
            yourapp.com/r/{customCode}
          </code>
          <button
            onClick={handleCopy}
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0",
              copied
                ? "bg-[var(--status-success)] text-[#0a0a0b]"
                : "bg-[var(--background-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center">
              <span className="text-sm text-[var(--text-muted)] mr-0 shrink-0">yourapp.com/r/</span>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                placeholder="yourname"
                maxLength={20}
                className="flex-1 bg-transparent border-none text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-0 px-0"
              />
            </div>
            <button
              onClick={handleClaim}
              disabled={status !== "available"}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                status === "available"
                  ? "bg-[var(--accent)] text-white hover:opacity-90"
                  : "bg-[var(--background-elevated)] text-[var(--text-tertiary)] cursor-not-allowed"
              )}
            >
              Claim
            </button>
          </div>
          <div className="h-4 mt-1">
            {status === "available" && input.length >= 3 && (
              <span className="text-[11px] text-[var(--status-success)]">Available</span>
            )}
            {status === "taken" && (
              <span className="text-[11px] text-[var(--status-error)]">Taken</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/ReferralCodeCard.tsx
git commit -m "feat: add referral code card with availability check"
```

---

## Task 6: ThresholdProgress Component

**Files:**
- Create: `src/components/affiliate/ThresholdProgress.tsx`

**Interfaces:**
- Consumes: `referredCount: number`, `threshold: number`, `oneTimeBonusUnlocked: boolean` from `AffiliateProfile`
- Produces: `<ThresholdProgress>` component

- [ ] **Step 1: Create ThresholdProgress component**

```tsx
// src/components/affiliate/ThresholdProgress.tsx
import { cn } from "@/lib/utils";

interface ThresholdProgressProps {
  referredCount: number;
  threshold: number;
  oneTimeBonusUnlocked: boolean;
}

export function ThresholdProgress({ referredCount, threshold, oneTimeBonusUnlocked }: ThresholdProgressProps) {
  const percent = Math.min((referredCount / threshold) * 100, 100);

  if (oneTimeBonusUnlocked) {
    return (
      <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[var(--status-success)]/15 flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 text-[var(--status-success)]">
              <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-medium text-[var(--status-success)]">Bonus unlocked</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-secondary)]">
          <span className="font-mono tabular-nums text-[var(--text-primary)]">{referredCount}</span>
          {" "}of{" "}
          <span className="font-mono tabular-nums">{threshold}</span>
          {" "}referred users
        </span>
        <span className="text-xs text-[var(--text-muted)] font-mono tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-2">
        Unlocks 30% one-time commission on your next qualifying referral
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/ThresholdProgress.tsx
git commit -m "feat: add threshold progress bar component"
```

---

## Task 7: TierSummaryCards Component

**Files:**
- Create: `src/components/affiliate/TierSummaryCards.tsx`

**Interfaces:**
- Consumes: `affiliateProfile: AffiliateProfile`, `commissionRecords: CommissionRecord[]` from store
- Produces: `<TierSummaryCards>` component

- [ ] **Step 1: Create TierSummaryCards component**

```tsx
// src/components/affiliate/TierSummaryCards.tsx
import { cn } from "@/lib/utils";
import type { AffiliateProfile, CommissionRecord } from "@/stores/dashboard-store";

interface TierSummaryCardsProps {
  profile: AffiliateProfile;
  commissionRecords: CommissionRecord[];
}

const TIER_LABELS: Record<string, string> = { free: "Free", flux: "Flux", nova: "Nova" };
const TIER_RATES: Record<string, string> = { free: "10%", flux: "20%", nova: "30%" };
const UPSELL_HINTS: Record<string, string> = {
  free: "Flux earns 2x the one-time bonus",
  flux: "Nova earns 3x the one-time bonus",
  nova: "",
};

export function TierSummaryCards({ profile, commissionRecords }: TierSummaryCardsProps) {
  const lifetimeEarned = commissionRecords
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0);

  const pendingPayout = commissionRecords
    .filter((c) => c.status === "accrued" || c.status === "pending")
    .reduce((sum, c) => sum + c.amount, 0);

  const cards = [
    {
      label: "Current tier",
      value: TIER_LABELS[profile.tier],
      hint: UPSELL_HINTS[profile.tier],
    },
    {
      label: "One-time rate",
      value: TIER_RATES[profile.tier],
      hint: null,
    },
    {
      label: "Total earned",
      value: `$${lifetimeEarned.toLocaleString()}`,
      hint: null,
    },
    {
      label: "Pending payout",
      value: `$${pendingPayout.toLocaleString()}`,
      hint: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-4"
        >
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
            {card.label}
          </div>
          <div className="text-lg font-mono tabular-nums text-[var(--text-primary)] font-medium">
            {card.value}
          </div>
          {card.hint && (
            <div className="text-[10px] text-[var(--text-muted)] mt-1">
              {card.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/TierSummaryCards.tsx
git commit -m "feat: add tier summary cards with upsell hints"
```

---

## Task 8: ReferredUsersTable Component

**Files:**
- Create: `src/components/affiliate/ReferredUsersTable.tsx`

**Interfaces:**
- Consumes: `referredUsers: ReferredUser[]`, `commissionRecords: CommissionRecord[]` from store
- Produces: `<ReferredUsersTable>` component

- [ ] **Step 1: Create ReferredUsersTable component**

```tsx
// src/components/affiliate/ReferredUsersTable.tsx
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ReferredUser, CommissionRecord } from "@/stores/dashboard-store";

interface ReferredUsersTableProps {
  referredUsers: ReferredUser[];
  commissionRecords: CommissionRecord[];
}

const TIER_COLORS: Record<string, string> = {
  free: "#6b6b70",
  flux: "var(--accent)",
  nova: "#34d399",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "text-[var(--status-success)]" },
  pending: { label: "Pending", className: "text-[var(--status-pending)]" },
  churned: { label: "Churned", className: "text-[var(--status-error)]" },
};

function getCommissionForUser(userId: string, records: CommissionRecord[]) {
  return records
    .filter((r) => r.referredUserId === userId)
    .reduce((sum, r) => sum + r.amount, 0);
}

function getLatestRate(userId: string, records: CommissionRecord[]) {
  const userRecords = records.filter((r) => r.referredUserId === userId);
  return userRecords.length > 0 ? userRecords[userRecords.length - 1].rate : 0;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function ReferredUsersTable({ referredUsers, commissionRecords }: ReferredUsersTableProps) {
  return (
    <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10">User</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Total spend</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Plan</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Rate</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Earned</TableHead>
            <TableHead className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium h-10 text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {referredUsers.map((user) => {
            const status = STATUS_CONFIG[user.status];
            const earned = getCommissionForUser(user.id, commissionRecords);
            const rate = getLatestRate(user.id, commissionRecords);
            return (
              <TableRow key={user.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: TIER_COLORS[user.planTier] }}
                    >
                      {user.avatarInitials}
                    </div>
                    <span className="text-sm text-[var(--text-primary)] font-medium">{user.username}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm text-[var(--text-secondary)]">
                  {formatCurrency(user.totalSpend)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs font-medium capitalize" style={{ color: TIER_COLORS[user.planTier] }}>
                    {user.planTier}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm text-[var(--text-secondary)]">
                  {rate}%
                </TableCell>
                <TableCell className={cn("text-right font-mono tabular-nums text-sm", earned > 0 ? "text-[var(--status-success)]" : "text-[var(--text-muted)]")}>
                  {formatCurrency(earned)}
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn("text-xs font-medium", status.className)}>
                    {status.label}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/ReferredUsersTable.tsx
git commit -m "feat: add referred users table with Fey-style data layout"
```

---

## Task 9: AffiliateCharts Component

**Files:**
- Create: `src/components/affiliate/AffiliateCharts.tsx`

**Interfaces:**
- Consumes: `commissionRecords: CommissionRecord[]`, `referredUsers: ReferredUser[]` from store
- Produces: `<AffiliateCharts>` component

- [ ] **Step 1: Create AffiliateCharts component**

```tsx
// src/components/affiliate/AffiliateCharts.tsx
import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import type { CommissionRecord, ReferredUser } from "@/stores/dashboard-store";

interface AffiliateChartsProps {
  commissionRecords: CommissionRecord[];
  referredUsers: ReferredUser[];
}

function aggregateByMonth(records: CommissionRecord[], referredUsers: ReferredUser[]) {
  const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const now = Date.now();
  const msPerMonth = 30 * 86400000;

  return months.map((month, i) => {
    const cutoff = now - (5 - i) * msPerMonth;
    const referralsInMonth = referredUsers.filter((r) => r.joinedAt <= cutoff).length;
    const earningsInMonth = records
      .filter((r) => r.createdAt <= cutoff)
      .reduce((sum, r) => sum + r.amount, 0);

    return { name: month, referrals: referralsInMonth, earnings: earningsInMonth };
  });
}

function Toggle({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {["6M", "1Y"].map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
            active === opt
              ? "bg-[var(--background-elevated)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--background-elevated)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs">
      <div className="text-[var(--text-muted)] mb-0.5">{label}</div>
      <div className="font-mono tabular-nums text-[var(--text-primary)]">{payload[0].value}</div>
    </div>
  );
};

export function AffiliateCharts({ commissionRecords, referredUsers }: AffiliateChartsProps) {
  const [referralRange, setReferralRange] = useState("6M");
  const [earningsRange, setEarningsRange] = useState("6M");

  const data = useMemo(() => aggregateByMonth(commissionRecords, referredUsers), [commissionRecords, referredUsers]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Referrals over time */}
      <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Referrals</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Total: <span className="font-mono tabular-nums text-[var(--text-secondary)]">{referredUsers.length}</span>
            </p>
          </div>
          <Toggle active={referralRange} onChange={setReferralRange} />
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="referrals" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Earnings over time */}
      <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Earnings</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Total: <span className="font-mono tabular-nums text-[var(--status-success)]">
                ${commissionRecords.reduce((s, r) => s + r.amount, 0).toLocaleString()}
              </span>
            </p>
          </div>
          <Toggle active={earningsRange} onChange={setEarningsRange} />
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b6b70" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="earnings" stroke="var(--accent)" strokeWidth={1.5} fill="url(#earningsGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/AffiliateCharts.tsx
git commit -m "feat: add affiliate charts (referrals + earnings over time)"
```

---

## Task 10: AffiliatePage — Compose All Sections

**Files:**
- Create: `src/components/affiliate/AffiliatePage.tsx`

**Interfaces:**
- Consumes: `useDashboardStore()` for all affiliate data; all components from Tasks 4–9
- Produces: `<AffiliatePage>` route component

- [ ] **Step 1: Create AffiliatePage component**

```tsx
// src/components/affiliate/AffiliatePage.tsx
import { useDashboardStore } from "@/stores/dashboard-store";
import { ReferralCodeCard } from "./ReferralCodeCard";
import { ThresholdProgress } from "./ThresholdProgress";
import { TierSummaryCards } from "./TierSummaryCards";
import { ReferredUsersTable } from "./ReferredUsersTable";
import { AffiliateCharts } from "./AffiliateCharts";
import { EmptyState } from "./EmptyState";

export function AffiliatePage() {
  const {
    affiliateProfile,
    referredUsers,
    commissionRecords,
    claimCustomCode,
    checkCodeAvailability,
  } = useDashboardStore();

  const hasReferrals = referredUsers.length > 0;

  return (
    <div className="theme-fey min-h-[calc(100vh-120px)] -mt-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-4.5 h-4.5">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-medium text-[var(--text-primary)]">Affiliate program</h1>
        </div>
        <span className="ml-auto text-xs font-medium text-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1 rounded-full capitalize">
          {affiliateProfile.tier} tier
        </span>
      </div>

      <div className="space-y-6">
        {/* Referral code card */}
        <ReferralCodeCard
          customCode={affiliateProfile.customCode}
          claimCustomCode={claimCustomCode}
          checkCodeAvailability={checkCodeAvailability}
        />

        {/* Threshold progress */}
        <ThresholdProgress
          referredCount={affiliateProfile.referredCount}
          threshold={affiliateProfile.threshold}
          oneTimeBonusUnlocked={affiliateProfile.oneTimeBonusUnlocked}
        />

        {/* Tier summary cards */}
        <TierSummaryCards
          profile={affiliateProfile}
          commissionRecords={commissionRecords}
        />

        {/* Referred users table or empty state */}
        {hasReferrals ? (
          <ReferredUsersTable
            referredUsers={referredUsers}
            commissionRecords={commissionRecords}
          />
        ) : (
          <EmptyState
            customCode={affiliateProfile.customCode}
            onCopy={(text) => navigator.clipboard.writeText(text)}
          />
        )}

        {/* Charts */}
        {hasReferrals && (
          <AffiliateCharts
            commissionRecords={commissionRecords}
            referredUsers={referredUsers}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/affiliate/AffiliatePage.tsx
git commit -m "feat: compose affiliate page with all sections"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors (route tree auto-regenerates).

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: No errors or warnings.

- [ ] **Step 3: Verify in browser**

- Navigate to `/dashboard`, click "Affiliate" in sidebar
- Verify Fey dark theme renders (near-black background, card surfaces)
- Verify table shows 7 referred users with correct data
- Verify code card shows input (no code claimed yet)
- Verify progress bar shows "3 of 5"
- Verify tier cards show correct values
- Verify charts render with data

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: address lint/typecheck issues for affiliate dashboard"
```
