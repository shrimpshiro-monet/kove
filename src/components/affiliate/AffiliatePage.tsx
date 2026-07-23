import { useState, useEffect } from "react";
import type { PlanTier } from "@/stores/dashboard-store";
import { ReferralCodeCard } from "./ReferralCodeCard";
import { ThresholdProgress } from "./ThresholdProgress";
import { TierSummaryCards } from "./TierSummaryCards";
import { ReferredUsersTable } from "./ReferredUsersTable";
import { AffiliateCharts } from "./AffiliateCharts";
import { EmptyState } from "./EmptyState";

interface AffiliateProfile {
  userId: string;
  customCode: string | null;
  tier: PlanTier;
  oneTimeBonusUnlocked: boolean;
  referredCount: number;
  threshold: number;
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

const EMPTY_PROFILE: AffiliateProfile = {
  userId: "",
  customCode: null,
  tier: "free",
  oneTimeBonusUnlocked: false,
  referredCount: 0,
  threshold: 5,
};

export function AffiliatePage() {
  const [profile, setProfile] = useState<AffiliateProfile>(EMPTY_PROFILE);
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);
  const [commissionRecords, setCommissionRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/affiliate/profile").then((r) => r.json()),
      fetch("/api/affiliate/referrals").then((r) => r.json()),
      fetch("/api/affiliate/commissions").then((r) => r.json()),
    ]).then(([profileData, referralsData, commissionsData]: any[]) => {
      if (profileData.success) setProfile(profileData.profile);
      if (referralsData.success) setReferredUsers(referralsData.referrals);
      if (commissionsData.success) setCommissionRecords(commissionsData.commissions);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const claimCustomCode = (code: string) => {
    fetch("/api/affiliate/claim-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) => r.json()).then((data: any) => {
      if (data.success) setProfile((p) => ({ ...p, customCode: code }));
    }).catch(() => {});
  };

  const checkCodeAvailability = (code: string): boolean => {
    return code.length >= 3 && /^[a-zA-Z0-9_-]+$/.test(code);
  };

  const hasReferrals = referredUsers.length > 0;

  if (loading) {
    return (
      <div className="theme-fey min-h-[calc(100vh-120px)] -mt-16 flex items-center justify-center">
        <div className="text-sm text-[var(--text-muted)]">Loading affiliate data...</div>
      </div>
    );
  }

  return (
    <div className="theme-fey min-h-[calc(100vh-120px)] -mt-16">
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
          {profile.tier} tier
        </span>
      </div>

      <div className="space-y-6">
        <ReferralCodeCard
          customCode={profile.customCode}
          claimCustomCode={claimCustomCode}
          checkCodeAvailability={checkCodeAvailability}
        />

        <ThresholdProgress
          referredCount={profile.referredCount}
          threshold={profile.threshold}
          oneTimeBonusUnlocked={profile.oneTimeBonusUnlocked}
        />

        <TierSummaryCards
          profile={profile}
          commissionRecords={commissionRecords}
        />

        {hasReferrals ? (
          <ReferredUsersTable
            referredUsers={referredUsers}
            commissionRecords={commissionRecords}
          />
        ) : (
          <EmptyState
            customCode={profile.customCode}
            onCopy={(text) => navigator.clipboard.writeText(text)}
          />
        )}

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
