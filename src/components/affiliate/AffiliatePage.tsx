import { useState, useEffect } from "react";
import { useDashboardStore, type PlanTier } from "@/stores/dashboard-store";
import { ReferralCodeCard } from "./ReferralCodeCard";
import { ThresholdProgress } from "./ThresholdProgress";
import { TierSummaryCards } from "./TierSummaryCards";
import { ReferredUsersTable } from "./ReferredUsersTable";
import { AffiliateCharts } from "./AffiliateCharts";
import { EmptyState } from "./EmptyState";

function mapBackendTier(backendTier: string): PlanTier {
  if (backendTier === "pro") return "nova";
  return "free";
}

export function AffiliatePage() {
  const {
    affiliateProfile,
    referredUsers,
    commissionRecords,
    claimCustomCode,
    checkCodeAvailability,
  } = useDashboardStore();

  const [realTier, setRealTier] = useState<PlanTier | null>(null);

  useEffect(() => {
    fetch("/api/billing/usage")
      .then((r) => r.json())
      .then((data: { tier?: string }) => {
        if (data.tier) setRealTier(mapBackendTier(data.tier));
      })
      .catch(() => {});
  }, []);

  const currentTier = realTier ?? affiliateProfile.tier;
  const profile = { ...affiliateProfile, tier: currentTier };
  const hasReferrals = referredUsers.length > 0;

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
          {currentTier} tier
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
