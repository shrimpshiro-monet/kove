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
