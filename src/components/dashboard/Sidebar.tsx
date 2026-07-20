import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  label: string;
}

interface SidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  items: NavItem[];
}

export function Sidebar({ active, onNavigate, items }: SidebarProps) {
  const [expanded, setExpanded] = useState(true);

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-50",
        "bg-[var(--background)] border-r border-[var(--border)]",
        "transition-all duration-200 ease-out",
        expanded ? "w-[200px] px-4 py-6" : "w-[52px] px-3 py-6 items-center"
      )}
    >
      {/* Logo + Toggle */}
      <div className={cn("flex items-center mb-8", expanded ? "justify-between" : "justify-center")}>
        {expanded && (
          <span className="text-sm font-semibold font-display text-[var(--text-primary)] tracking-tight">
            Kove
          </span>
        )}
        <button
          onClick={toggle}
          className="w-5 h-5 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
            {expanded ? (
              <polyline points="10 12 6 8 10 4" />
            ) : (
              <polyline points="6 12 10 8 6 4" />
            )}
          </svg>
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {items.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              "flex items-center gap-2 rounded-md transition-all duration-150 text-left",
              expanded ? "px-2.5 py-1.5" : "w-7 h-7 justify-center",
              active === id
                ? "text-[var(--accent)] font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
          >
            {label[0]}
            {expanded && (
              <span className="text-xs capitalize">{label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Settings */}
      <button
        onClick={() => onNavigate("settings")}
        className={cn(
          "flex items-center gap-2 rounded-md transition-all duration-150 text-left",
          expanded ? "px-2.5 py-1.5" : "w-7 h-7 justify-center",
          active === "settings"
            ? "text-[var(--accent)] font-medium"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        )}
      >
        S
        {expanded && (
          <span className="text-xs capitalize">Settings</span>
        )}
      </button>
    </aside>
  );
}
