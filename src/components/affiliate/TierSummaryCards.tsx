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
