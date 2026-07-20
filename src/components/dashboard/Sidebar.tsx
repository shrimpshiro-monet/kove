import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import { useTheme } from "./ThemeProvider";

export interface NavItem {
  id: string;
  icon: React.FC<{ className?: string }>;
  label: string;
}

interface SidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  items: NavItem[];
}

export function Sidebar({ active, onNavigate, items }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const { active: resolvedTheme } = useTheme();

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col fixed left-4 top-4 bottom-4 z-50",
        "bg-[var(--background-secondary)]/90 backdrop-blur-xl rounded-2xl",
        "border border-[var(--border)] shadow-float",
        "transition-all duration-300 ease-out",
        "animate-slide-in-left",
        expanded ? "w-[240px] px-3 py-4" : "w-[68px] px-2 py-4 items-center"
      )}
    >
      {/* Logo */}
      <div className={cn("mb-4", expanded ? "px-2" : "p-2")}>
        <Icons.logo className="w-5 h-5 text-[var(--accent)]" />
        {expanded && (
          <span className="ml-2.5 text-sm font-bold font-display text-[var(--text-primary)] tracking-tight">
            Kove
          </span>
        )}
      </div>

      <div className="w-8 h-px bg-[var(--border)] mb-2" />

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 flex-1">
        {items.map(({ id, icon: Icon, label }, i) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={expanded ? undefined : label}
            className={cn(
              "flex items-center gap-2.5 rounded-xl transition-all duration-200",
              `animate-fade-in stagger-${Math.min(i + 1, 6)}`,
              expanded ? "px-3 py-2.5 w-full" : "w-10 h-10 justify-center",
              active === id
                ? "bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.3)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] hover:scale-105"
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {expanded && (
              <span className="text-sm font-medium truncate">{label}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="w-8 h-px bg-[var(--border)] my-2" />

      {/* Settings */}
      <button
        onClick={() => onNavigate("settings")}
        title={expanded ? undefined : "Settings"}
        className={cn(
          "flex items-center gap-2.5 rounded-xl transition-all duration-200",
          expanded ? "px-3 py-2.5 w-full" : "w-10 h-10 justify-center",
          active === "settings"
            ? "bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.3)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] hover:scale-105"
        )}
      >
        <Icons.settings className="w-5 h-5 shrink-0" />
        {expanded && (
          <span className="text-sm font-medium">Settings</span>
        )}
      </button>

      {/* Collapse Toggle */}
      <div className="mt-2">
        <button
          onClick={toggle}
          className={cn(
            "flex items-center gap-2 rounded-xl transition-all duration-200 text-[var(--text-tertiary)] hover:text-[var(--text-muted)] hover:bg-white/[0.04]",
            expanded ? "px-3 py-2 w-full" : "w-10 h-10 justify-center"
          )}
        >
          {expanded ? (
            <Icons.chevronLeft className="w-4 h-4" />
          ) : (
            <Icons.chevronRight className="w-4 h-4" />
          )}
          {expanded && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
