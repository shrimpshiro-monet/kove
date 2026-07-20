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
