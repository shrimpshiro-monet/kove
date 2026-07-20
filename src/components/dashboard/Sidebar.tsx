import { useUser, useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  label: string;
}

interface SidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  items: NavItem[];
  expanded: boolean;
  onToggle: () => void;
}

export function Sidebar({ active, onNavigate, items, expanded, onToggle }: SidebarProps) {
  const { user, isSignedIn } = useUser();
  const { openUserProfile } = useClerk();

  const displayName = user?.firstName ?? user?.username ?? user?.emailAddresses?.[0]?.emailAddress;
  const initials = displayName?.[0]?.toUpperCase() || "?";

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
            Jalebi
          </span>
        )}
        <button
          onClick={onToggle}
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

      {/* User profile */}
      <div className={cn("border-t border-[var(--border)] pt-3", expanded ? "w-full" : "")}>
        {isSignedIn ? (
          <button
            onClick={() => openUserProfile()}
            className={cn(
              "flex items-center gap-2.5 rounded-lg transition-all duration-150 text-left group w-full",
              expanded ? "px-2 py-2" : "w-9 h-9 justify-center mx-auto"
            )}
          >
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                initials
              )}
            </div>
            {expanded && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--text-primary)] truncate leading-tight">
                  {displayName}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] truncate leading-tight mt-0.5">
                  {user?.emailAddresses?.[0]?.emailAddress || ""}
                </div>
              </div>
            )}
          </button>
        ) : (
          <a
            href="/sign-in"
            className={cn(
              "flex items-center gap-2 rounded-lg transition-all duration-150",
              expanded ? "px-2 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]" : "w-9 h-9 justify-center mx-auto text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
              <path d="M8 2v6m0 0l-3-3m3 3l3-3M2 10v2a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            {expanded && <span>Log in</span>}
          </a>
        )}
      </div>
    </aside>
  );
}
