import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";

interface ActionInputProps {
  onSubmit: (query: string) => void;
  placeholder?: string;
}

export function ActionInput({ onSubmit, placeholder = "Describe the vibe…" }: ActionInputProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const { active } = useTheme();

  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      onSubmit(query.trim());
      setQuery("");
    }
  }, [query, onSubmit]);

  return (
    <div className="w-full max-w-[640px] mb-8 animate-slide-up stagger-2 mx-auto">
      <div
        className={cn(
          "relative h-14 rounded-2xl flex items-center px-5 overflow-hidden transition-all duration-300",
          focused
            ? "bg-[var(--background-secondary)] shadow-[0_0_0_2px_var(--accent),0_0_30px_color-mix(in_oklch,var(--accent)_15%,transparent)]"
            : "bg-[var(--background-tertiary)] shadow-[0_0_0_1px_var(--border),0_4px_16px_rgba(0,0,0,0.3)]"
        )}
      >
        <svg className="w-4 h-4 mr-3 opacity-25 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className={cn(
            "w-8 h-8 rounded-xl border-none cursor-pointer flex items-center justify-center ml-3 shrink-0 transition-all duration-200",
            query.trim()
              ? "bg-[var(--accent)] text-white hover:opacity-90"
              : "bg-white/[0.04] text-[var(--text-tertiary)] cursor-not-allowed"
          )}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
