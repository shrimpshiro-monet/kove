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
