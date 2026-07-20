import { useState, useCallback, useEffect } from "react";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface Project {
  id: string;
  name: string;
  clips: number;
  duration: string;
  createdAt: number;
  updatedAt: number;
  thumbnailColor?: string;
}

export interface ReferralLink {
  id: string;
  name: string;
  slug: string;
  clicks: number;
  signups: number;
  conversion: string;
  commission: string;
  status: "active" | "paused" | "archived";
  createdAt: number;
}

export interface Transaction {
  id: string;
  date: string;
  source: string;
  type: string;
  amount: string;
  status: "paid" | "pending" | "processing" | "failed" | "refunded";
  refId: string;
  createdAt: number;
}

export interface Payout {
  id: string;
  date: string;
  batch: string;
  amount: string;
  status: "paid" | "processing" | "pending";
  method: string;
  createdAt: number;
}

export interface Referral {
  id: string;
  name: string;
  email: string;
  joinedAt: number;
  status: "active" | "inactive";
  totalCommission: string;
}

export interface DashboardSettings {
  defaultEditor: "simple" | "studio";
  username: string;
  email: string;
  payoutMethod: string;
  payoutLast4: string;
  payoutFrequency: string;
  payoutMinimum: string;
}

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

// ════════════════════════════════════════════════════════════════
// STORAGE KEY
// ════════════════════════════════════════════════════════════════

const STORAGE_KEY = "kove-dashboard";

// ════════════════════════════════════════════════════════════════
// SEED DATA (first load only)
// ════════════════════════════════════════════════════════════════

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

function daysAgo(n: number): number {
  return Date.now() - n * 86400000;
}

function dateStr(n: number): string {
  return new Date(n).toISOString().slice(0, 10);
}

const SEED: DashboardState = {
  projects: [
    { id: uid(), name: "Steph Curry highlight reel", clips: 54, duration: "52.5s", createdAt: daysAgo(0), updatedAt: daysAgo(0), thumbnailColor: "#1D3B6A" },
    { id: uid(), name: "Gym edit — drop night", clips: 38, duration: "31.2s", createdAt: daysAgo(1), updatedAt: daysAgo(1), thumbnailColor: "#4A7FCC" },
    { id: uid(), name: "Travel montage Bali", clips: 67, duration: "45.8s", createdAt: daysAgo(3), updatedAt: daysAgo(3), thumbnailColor: "#E8C84A" },
    { id: uid(), name: "Product unboxing promo", clips: 22, duration: "18.4s", createdAt: daysAgo(7), updatedAt: daysAgo(7), thumbnailColor: "#E85D4A" },
    { id: uid(), name: "Concert aftermovie", clips: 89, duration: "1:12.0", createdAt: daysAgo(14), updatedAt: daysAgo(14), thumbnailColor: "#27C93F" },
  ],
  referralLinks: [
    { id: uid(), name: "Default referral", slug: "kove.to/hamza", clicks: 1240, signups: 48, conversion: "3.9%", commission: "$1,152.00", status: "active", createdAt: daysAgo(90) },
    { id: uid(), name: "YouTube campaign", slug: "kove.to/yt-hamza", clicks: 890, signups: 32, conversion: "3.6%", commission: "$768.00", status: "active", createdAt: daysAgo(60) },
    { id: uid(), name: "Twitter bio link", slug: "kove.to/tw-hamza", clicks: 340, signups: 12, conversion: "3.5%", commission: "$288.00", status: "active", createdAt: daysAgo(30) },
    { id: uid(), name: "Old campaign", slug: "kove.to/old-hamza", clicks: 120, signups: 2, conversion: "1.7%", commission: "$48.00", status: "archived", createdAt: daysAgo(120) },
  ],
  transactions: [
    { id: uid(), date: dateStr(daysAgo(1)), source: "@designstudio", type: "Signup bonus", amount: "+$24.00", status: "paid", refId: "TXN-8F3A", createdAt: daysAgo(1) },
    { id: uid(), date: dateStr(daysAgo(1)), source: "@videopro", type: "Recurring", amount: "+$12.00", status: "pending", refId: "TXN-7B2C", createdAt: daysAgo(1) },
    { id: uid(), date: dateStr(daysAgo(2)), source: "@motiongraphics", type: "Milestone", amount: "+$50.00", status: "paid", refId: "TXN-6D1E", createdAt: daysAgo(2) },
    { id: uid(), date: dateStr(daysAgo(3)), source: "@creativelab", type: "Signup bonus", amount: "+$24.00", status: "paid", refId: "TXN-5A9F", createdAt: daysAgo(3) },
    { id: uid(), date: dateStr(daysAgo(4)), source: "Payout batch #42", type: "Payout", amount: "-$420.00", status: "paid", refId: "TXN-4C8B", createdAt: daysAgo(4) },
    { id: uid(), date: dateStr(daysAgo(5)), source: "@studioflow", type: "Recurring", amount: "+$12.00", status: "processing", refId: "TXN-3E7D", createdAt: daysAgo(5) },
    { id: uid(), date: dateStr(daysAgo(6)), source: "@filmmakers", type: "Signup bonus", amount: "+$24.00", status: "paid", refId: "TXN-2F6A", createdAt: daysAgo(6) },
    { id: uid(), date: dateStr(daysAgo(7)), source: "@editpro", type: "Bonus", amount: "+$100.00", status: "paid", refId: "TXN-1G5C", createdAt: daysAgo(7) },
  ],
  payouts: [
    { id: uid(), date: dateStr(daysAgo(1)), batch: "Payout batch #43", amount: "$420.00", status: "processing", method: "Stripe •••• 4242", createdAt: daysAgo(1) },
    { id: uid(), date: dateStr(daysAgo(8)), batch: "Payout batch #42", amount: "$385.00", status: "paid", method: "Stripe •••• 4242", createdAt: daysAgo(8) },
    { id: uid(), date: dateStr(daysAgo(15)), batch: "Payout batch #41", amount: "$512.00", status: "paid", method: "Stripe •••• 4242", createdAt: daysAgo(15) },
    { id: uid(), date: dateStr(daysAgo(22)), batch: "Payout batch #40", amount: "$298.00", status: "paid", method: "Stripe •••• 4242", createdAt: daysAgo(22) },
    { id: uid(), date: dateStr(daysAgo(29)), batch: "Payout batch #39", amount: "$445.00", status: "paid", method: "Stripe •••• 4242", createdAt: daysAgo(29) },
  ],
  referrals: [
    { id: uid(), name: "@designstudio", email: "design@studio.com", joinedAt: daysAgo(1), status: "active", totalCommission: "$1,152.00" },
    { id: uid(), name: "@videopro", email: "pro@video.com", joinedAt: daysAgo(14), status: "active", totalCommission: "$768.00" },
    { id: uid(), name: "@motiongraphics", email: "motion@ graphics.com", joinedAt: daysAgo(30), status: "active", totalCommission: "$288.00" },
    { id: uid(), name: "@creativelab", email: "hello@creativelab.co", joinedAt: daysAgo(45), status: "active", totalCommission: "$144.00" },
    { id: uid(), name: "@filmmakers", email: "team@filmmakers.io", joinedAt: daysAgo(60), status: "active", totalCommission: "$96.00" },
    { id: uid(), name: "@studioflow", email: "flow@studio.com", joinedAt: daysAgo(75), status: "inactive", totalCommission: "$72.00" },
    { id: uid(), name: "@editpro", email: "pro@edit.tools", joinedAt: daysAgo(90), status: "active", totalCommission: "$48.00" },
  ],
  settings: {
    defaultEditor: "simple",
    username: "Hamza",
    email: "hamza@kove.to",
    payoutMethod: "Stripe",
    payoutLast4: "4242",
    payoutFrequency: "Weekly",
    payoutMinimum: "$100",
  },
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
};

// ════════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ════════════════════════════════════════════════════════════════

function loadState(): DashboardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return SEED;
}

function saveState(state: DashboardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ════════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════════

export function useDashboardStore() {
  const [state, setState] = useState<DashboardState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const patch = useCallback((fn: (s: DashboardState) => void) => {
    setState((prev) => {
      const next = { ...prev };
      fn(next);
      return next;
    });
  }, []);

  // ── Projects ──

  const addProject = useCallback((name: string) => {
    patch((s) => {
      s.projects.unshift({
        id: uid(),
        name,
        clips: 0,
        duration: "0s",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnailColor: "#1D3B6A",
      });
    });
  }, [patch]);

  const deleteProject = useCallback((id: string) => {
    patch((s) => {
      s.projects = s.projects.filter((p) => p.id !== id);
    });
  }, [patch]);

  const renameProject = useCallback((id: string, name: string) => {
    patch((s) => {
      const p = s.projects.find((x) => x.id === id);
      if (p) { p.name = name; p.updatedAt = Date.now(); }
    });
  }, [patch]);

  // ── Referral Links ──

  const addReferralLink = useCallback((name: string, slug: string) => {
    patch((s) => {
      s.referralLinks.unshift({
        id: uid(),
        name,
        slug,
        clicks: 0,
        signups: 0,
        conversion: "0%",
        commission: "$0.00",
        status: "active",
        createdAt: Date.now(),
      });
    });
  }, [patch]);

  const updateLinkStatus = useCallback((id: string, status: ReferralLink["status"]) => {
    patch((s) => {
      const link = s.referralLinks.find((x) => x.id === id);
      if (link) link.status = status;
    });
  }, [patch]);

  const deleteReferralLink = useCallback((id: string) => {
    patch((s) => {
      s.referralLinks = s.referralLinks.filter((l) => l.id !== id);
    });
  }, [patch]);

  // ── Referrals ──

  const deleteReferral = useCallback((id: string) => {
    patch((s) => {
      s.referrals = s.referrals.filter((r) => r.id !== id);
    });
  }, [patch]);

  // ── Settings ──

  const updateSettings = useCallback((partial: Partial<DashboardSettings>) => {
    patch((s) => {
      Object.assign(s.settings, partial);
    });
  }, [patch]);

  // ── Computed ──

  const totalEarnedThisMonth = state.transactions
    .filter((t) => t.amount.startsWith("+"))
    .reduce((sum, t) => sum + parseFloat(t.amount.replace(/[^0-9.]/g, "")), 0);

  const pendingBalance = state.transactions
    .filter((t) => t.status === "pending" || t.status === "processing")
    .filter((t) => t.amount.startsWith("+"))
    .reduce((sum, t) => sum + parseFloat(t.amount.replace(/[^0-9.]/g, "")), 0);

  const lifetimeEarnings = state.transactions
    .filter((t) => t.amount.startsWith("+"))
    .reduce((sum, t) => sum + parseFloat(t.amount.replace(/[^0-9.]/g, "")), 0);

  const totalPaidOut = state.payouts
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + parseFloat(p.amount.replace(/[^0-9.]/g, "")), 0);

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

  return {
    state,
    addProject,
    deleteProject,
    renameProject,
    addReferralLink,
    updateLinkStatus,
    deleteReferralLink,
    deleteReferral,
    updateSettings,
    totalEarnedThisMonth,
    pendingBalance,
    lifetimeEarnings,
    totalPaidOut,
    claimCustomCode,
    checkCodeAvailability,
    affiliateProfile: state.affiliateProfile,
    referredUsers: state.referredUsers,
    commissionRecords: state.commissionRecords,
  };
}
