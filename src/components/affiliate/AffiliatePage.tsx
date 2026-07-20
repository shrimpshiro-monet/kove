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
        <ReferralCodeCard
          customCode={affiliateProfile.customCode}
          claimCustomCode={claimCustomCode}
          checkCodeAvailability={checkCodeAvailability}
        />

        <ThresholdProgress
          referredCount={affiliateProfile.referredCount}
          threshold={affiliateProfile.threshold}
          oneTimeBonusUnlocked={affiliateProfile.oneTimeBonusUnlocked}
        />

        <TierSummaryCards
          profile={affiliateProfile}
          commissionRecords={commissionRecords}
        />

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
